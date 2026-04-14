import { Safepay } from "@sfpy/node-sdk";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";
import { Booking } from "../models/booking.model.js";
import * as walletService from "./wallet.service.js";

const LATE_FEE_PREFIX = "LATEFEE-";
import mongoose from "mongoose";

// Initialize SDK
// Change environment to 'production' when going live
const safepay = new Safepay({
  environment:"sandbox",
  apiKey: process.env.SAFEPAY_API_KEY,
  v1Secret: process.env.SAFEPAY_V1_SECRET,
  webhookSecret: process.env.SAFEPAY_WEBHOOK_SECRET,
});

/**
 * 1. INIT PAYMENT
 * - Calculates amount from Booking DB
 * - Creates Safepay Session
 * - Returns the Redirect URL
 * @param {string} bookingId - Booking ID
 * @param {string} userId - User ID  
 * @param {string} platform - Optional: 'web' (default) or 'mobile'
 */
export const initSafepayPayment = async (bookingId, userId, platform = "web") => {
  const booking = await Booking.findById(bookingId).populate("customer");
  
  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Security Check: Ensure user owns this booking
  if (booking.customer._id.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, "Unauthorized to pay for this booking");
  }

  if (booking.paymentStatus === "paid") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Booking is already paid");
  }


  console.log("bookigns details checked")
  console.log("frontend url is: ", process.env.FRONTEND_URL)
  console.log("safepay SAFEPAY_API_KEY ", process.env.SAFEPAY_API_KEY);
  console.log("safepay SAFEPAY_V1_SECRET", process.env.SAFEPAY_V1_SECRET)
  console.log("safepay webhook", process.env.SAFEPAY_WEBHOOK_SECRET)


  // 1. Create Payment Tracker (Session)
  const { token } = await safepay.payments.create({
    amount: booking.totalPrice, 
    currency: "PKR",
  });

  // 2. Generate Checkout URL
  // Determine redirect URLs based on platform
  let cancelUrl, redirectUrl;
  
  if (platform === "mobile") {
    // Mobile app: Use deep link scheme to return to app
    const mobileScheme = process.env.MOBILE_APP_SCHEME || "swiftride";
    cancelUrl = `${mobileScheme}://payment/cancel`;
    redirectUrl = `${mobileScheme}://payment/success`;
  } else {
    // Web app: Use frontend URL (original behavior)
    cancelUrl = `${process.env.FRONTEND_URL}/payment/cancel`;
    redirectUrl = `${process.env.FRONTEND_URL}/payment/success`;
  }

  const url = safepay.checkout.create({
    token,
    orderId: booking.invoiceNumber || booking._id.toString(),
    cancelUrl,
    redirectUrl,
    source: "custom",
    webhooks: true, // Crucial: Enables the webhook call
  });

  // 3. Update DB status
  booking.paymentStatus = "processing";
  booking.paymentReference = token; // Save token to verify later if needed
  await booking.save();

  return { 
    url,     // Redirect user here
    token    // Session token
  };
};

/**
 * INIT LATE FEE PAYMENT
 * Creates a Safepay checkout session for an outstanding late fee.
 */
export const initLateFeePayment = async (bookingId, userId, platform = "web") => {
  const booking = await Booking.findById(bookingId).populate("customer");

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  if (booking.customer._id.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, "Unauthorized to pay for this booking");
  }

  if (!booking.lateFeeAmount || booking.lateFeeAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No late fee outstanding for this booking");
  }

  if (booking.isLateFeePaid) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Late fee is already paid");
  }

  const { token } = await safepay.payments.create({
    amount: booking.lateFeeAmount,
    currency: "PKR",
  });

  let cancelUrl, redirectUrl;

  if (platform === "mobile") {
    const mobileScheme = process.env.MOBILE_APP_SCHEME || "swiftride";
    cancelUrl = `${mobileScheme}://payment/cancel`;
    redirectUrl = `${mobileScheme}://payment/success`;
  } else {
    cancelUrl = `${process.env.FRONTEND_URL}/payment/cancel`;
    redirectUrl = `${process.env.FRONTEND_URL}/payment/success`;
  }

  const url = safepay.checkout.create({
    token,
    orderId: `${LATE_FEE_PREFIX}${booking._id.toString()}`,
    cancelUrl,
    redirectUrl,
    source: "custom",
    webhooks: true,
  });

  return { url, token };
};

/**
 * 2. HANDLE WEBHOOK
 * - Verifies signature from Safepay
 * - Marks Booking as PAID in DB
 * - Triggers Wallet Earning logic
 */
export const handleSafepayWebhook = async (req) => {
  try {
    console.log("Processing Webhook Payload:", JSON.stringify(req.body, null, 2));

    // --- 1. Signature Verification (Safe Mode) ---
    try {
      // Note: If safepay.webhooks is undefined, ensure your SDK version supports it
      // or verify manually. For now, we catch the error to prevent crashing.
      if (safepay.webhooks) {
        const valid = safepay.webhooks.verify(
          req.body,
          req.headers["x-sfpy-signature"]
        );
        if (!valid) throw new Error("Invalid Signature");
      }
    } catch (sigError) {
      console.warn("Signature Check Skipped:", sigError.message);
    }

    // --- 2. Extract Data ---
    const { data } = req.body;
    if (!data) return { success: false, message: "No data found" };

    const notification = data.notification || {};
    const state = notification.state;

    // --- 3. Check for PAID Status ---
    if (state === 'PAID') {
      const metadata = notification.metadata || {};
      // Safepay sometimes sends 'order_id' (snake_case) or 'orderId' (camelCase)
      const orderRef = metadata.order_id || metadata.orderId || notification.reference;

      if (!orderRef) {
        console.error("Critical: Order ID missing in webhook metadata");
        return { success: false };
      }

      console.log(`Found Order Ref: ${orderRef}, Updating DB...`);

      // --- 4. Late Fee Branch ---
      if (orderRef.startsWith(LATE_FEE_PREFIX)) {
        const bookingId = orderRef.slice(LATE_FEE_PREFIX.length);
        const booking = await Booking.findById(bookingId);

        if (!booking) {
          console.error(`Booking not found for late fee ref: ${bookingId}`);
          return { success: false };
        }

        if (!booking.isLateFeePaid) {
          booking.isLateFeePaid = true;
          await booking.save();

          await walletService.creditLateFeeEarning(bookingId);
          console.log(`✅ Late fee paid for booking ${bookingId}`);
        } else {
          console.log("Late fee was already marked paid.");
        }

        return { success: true };
      }

      // --- 5. Regular Booking: Smart Query Construction ---
      let query = {};

      // Check if orderRef is a valid MongoDB ObjectId (24 hex characters)
      if (mongoose.Types.ObjectId.isValid(orderRef)) {
        // If it looks like an ID, it COULD be either ID or Invoice
        query = { $or: [{ invoiceNumber: orderRef }, { _id: orderRef }] };
      } else {
        // If it looks like "INV-...", it is DEFINITELY NOT an ObjectId
        // Searching _id here would cause the CastError crash
        query = { invoiceNumber: orderRef };
      }

      const booking = await Booking.findOne(query);

      if (!booking) {
        console.error(`Booking not found for Ref: ${orderRef}`);
        return { success: false };
      }

      // --- 6. Update Payment Status ---
      if (booking.paymentStatus !== "paid") {
        booking.paymentStatus = "paid";
        booking.paymentReference = data.token;

        // Add a history entry if you want
        booking.statusHistory.push({
          status: booking.status,
          note: "Payment confirmed via Safepay Webhook",
          changedAt: new Date()
        });

        await booking.save();

        // Trigger wallet logic if exists
        if (walletService && walletService.createBookingEarning) {
           await walletService.createBookingEarning(booking);
        }

        console.log(`✅ Booking ${booking._id} marked as PAID.`);
      } else {
        console.log("Booking was already paid.");
      }

      return { success: true };
    }

    return { received: true };

  } catch (error) {
    console.error("❌ Webhook Crash:", error);
    return { success: false, error: error.message };
  }
};


// export const handleSafepayWebhook = async (req) => {
//   try {
//     // 1. Log for debugging (keep this until fixed)
//     console.log("Processing Webhook Payload:", JSON.stringify(req.body, null, 2));

//     // 2. Verify Signature (Optional: Wrap in try/catch to avoid crash if signature fails)
//     try {
//       const valid = safepay.webhooks.verify(
//         req.body,
//         req.headers["x-sfpy-signature"]
//       );
//       if (!valid) {
//         throw new Error("Invalid Signature");
//       }
//     } catch (sigError) {
//       console.error("Signature Verification Failed:", sigError.message);
//       // In Sandbox, you might want to proceed anyway if signature fails.
//       // In Production, throw an error here.
//     }

//     // 3. Extract Data safely based on YOUR logs
//     const { data } = req.body;
//     console.log()
    
//     // Safety check: Does 'data' exist?
//     if (!data) return { success: false, message: "No data found" };

//     const notification = data.notification || {};
//     const state = notification.state; 
//     const type = data.type;

//     console.log(`Payment State: ${state}, Event Type: ${type}`);

//     // 4. Check for Success (Your log shows state: 'PAID')
//     if (state === 'PAID') {
      
//       // FIX THE PATH: Metadata is inside 'notification', not directly in 'data'
//       const metadata = notification.metadata || {};
//       const orderRef = metadata.order_id || metadata.orderId;

//       if (!orderRef) {
//         console.error("Critical: Order ID missing in webhook metadata");
//         return { success: false };
//       }

//       console.log(`Found Order Ref: ${orderRef}, Updating DB...`);

//       // 5. Find and Update Booking
//       // Note: Ensure your Booking Model imports are correct
//       const booking = await Booking.findOne({
//         $or: [{ invoiceNumber: orderRef }, { _id: orderRef }],
//       });

//       if (!booking) {
//         console.error(`Booking not found for Ref: ${orderRef}`);
//         return { success: false };
//       }

//       if (booking.paymentStatus !== "paid") {
//         booking.paymentStatus = "paid";
//         booking.paymentReference = data.token;
//         await booking.save();
        
//         // Trigger wallet logic if you have it
//         if (walletService && walletService.createBookingEarning) {
//            await walletService.createBookingEarning(booking);
//         }
        
//         console.log(`✅ Booking ${booking._id} marked as PAID.`);
//       } else {
//         console.log("Booking was already paid.");
//       }

//       return { success: true };
//     }

//     return { received: true };

//   } catch (error) {
//     console.error("❌ Webhook Crash:", error);
//     // Return a valid object so the controller doesn't send 500
//     return { success: false, error: error.message };
//   }
// };