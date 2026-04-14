// import httpStatus from "http-status";
// import * as bookingService from "../services/booking.service.js";
// import { sendSuccessResponse } from "../utils/response.js";
// import catchAsync from "../utils/catchAsync.js";

// export const createBooking = catchAsync(async (req, res) => {
//   const customerId = req.user.id;
//   const booking = await bookingService.createBooking(customerId, req.body);

//   sendSuccessResponse(res, httpStatus.CREATED, "Booking created successfully", {
//     booking
//   });
// });

import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import * as bookingService from "../services/booking.service.js";
import { sendSuccessResponse } from "../utils/response.js";
import ApiError from "../utils/ApiError.js";
import { Booking } from "../models/booking.model.js";

// export const createBooking = catchAsync(async (req, res) => {
//   const customerId = req.user.id;
//   const { carId, startDate, endDate } = req.body;

//   const booking = await bookingService.createBooking(customerId, {
//     carId,
//     startDate,
//     endDate
//   });

//   sendSuccessResponse(res, httpStatus.CREATED, "Booking created successfully", {
//     booking
//   });
// });
export const createBooking = catchAsync(async (req, res) => {
  // Guard: block customers with unpaid late fees
  const unpaidLateFee = await Booking.findOne({
    customer: req.user.id,
    lateFeeAmount: { $gt: 0 },
    isLateFeePaid: false
  });

  if (unpaidLateFee) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `You have an outstanding late fee of PKR ${unpaidLateFee.lateFeeAmount}. Please pay it to book again.`
    );
  }

  const booking = await bookingService.createBooking(req.user.id, req.body);

  sendSuccessResponse(res, httpStatus.CREATED, "Booking created", {
    booking
  });
});


const mapBookingSummaryForUser = (booking) => {
  return {
    id: booking._id,
    invoiceNumber: booking.invoiceNumber,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    startDateTime: booking.startDateTime,
    endDateTime: booking.endDateTime,
    durationHours: booking.durationHours,
    totalPrice: booking.totalPrice,
    currency: booking.currency,
    isPaid: booking.paymentStatus === "paid",

    lateFeeAmount: booking.lateFeeAmount || 0,
    isLateFeePaid: booking.isLateFeePaid || false,

    car: booking.car
      ? {
        id: booking.car._id,
        make: booking.car.make,
        model: booking.car.model,
        year: booking.car.year,
        primaryPhoto:
          booking.car.photos && booking.car.photos.length > 0
            ? booking.car.photos[0]
            : null,
        location: booking.car.location || null,
        color: booking.car.color,
        plateNumber: booking.car.plateNumber,
        photos: booking.car.photos || []
      }
      : null,

    // For /me endpoint, we don't need customer/owner details – caller knows who they are
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
  };
};

const mapBookingDetailForUser = (booking) => {
  const base = mapBookingSummaryForUser(booking);

  return {
    ...base,
    customer: booking.customer ? {
      id: booking.customer._id,
      fullName: booking.customer.fullName,
      email: booking.customer.email,
      phoneNumber: booking.customer.phoneNumber,
      profilePicture: booking.customer.profilePicture
    } : null,
    // Add images for handover status
    pickupImages: booking.pickupImages || [],
    returnImages: booking.returnImages || [],
    // minimal extra for user-facing detail
    invoicePdfPath: booking.pdfPath || null,
    invoiceDownloadPath: booking._id
      ? `/api/bookings/invoice/${booking._id}`
      : null,
    statusTimeline: (booking.statusHistory || []).map((h) => ({
      status: h.status,
      changedAt: h.changedAt,
      note: h.note
    })),
    handoverSecret: booking.handoverSecret // Will only be present if selected and user is authorized to see it (handled by filtering/logic or frontend usage)
  };
};



// export const updateBookingStatus = catchAsync(async (req, res) => {
//   const ownerId = req.user.id;
//   const { bookingId } = req.params;
//   const { status } = req.body;

//   const booking = await bookingService.updateBookingStatus(
//     bookingId,
//     ownerId,
//     status
//   );

//   sendSuccessResponse(res, httpStatus.OK, "Booking status updated", {
//     booking
//   });
// });


export const updateBookingStatus = catchAsync(async (req, res) => {
  const ownerId = req.user.id;
  const { id } = req.params;
  const { status, note } = req.body;
  console.log("Updating booking status: ", { id, ownerId, status, note });

  const booking = await bookingService.updateBookingStatus(
    id,
    ownerId,
    status,
    note
  );

  sendSuccessResponse(res, httpStatus.OK, "Booking status updated", {
    booking
  });
});




// export const getMyBookings = catchAsync(async (req, res) => {
//   const customerId = req.user.id;
//   const bookings = await bookingService.getCustomerBookings(customerId);

//   sendSuccessResponse(res, httpStatus.OK, "Your bookings fetched successfully", {
//     bookings
//   });
// });
export const getMyBookings = catchAsync(async (req, res) => {
  const userId = req.user.id;
  console.log("user id is: ", userId)

  const bookings = await Booking.find({ customer: userId })
    .populate("car", "make model year photos location")
    .sort({ createdAt: -1 });
  console.log("bookings: ", bookings)

  const items = bookings.map(mapBookingSummaryForUser);
  console.log("items: ", items)

  sendSuccessResponse(res, httpStatus.OK, "My bookings fetched", {
    items
  });
});


// export const getOwnerBookings = catchAsync(async (req, res) => {
//   const ownerId = req.user.id;
//   const bookings = await bookingService.getOwnerBookings(ownerId);

//   sendSuccessResponse(res, httpStatus.OK, "Owner bookings fetched successfully", {
//     bookings
//   });
// });
export const getOwnerBookings = catchAsync(async (req, res) => {
  const ownerId = req.user.id;

  const bookings = await Booking.find({ owner: ownerId })
    .populate("car", "make model year photos location")
    .populate("customer", "fullName email phoneNumber profilePicture")
    .sort({ createdAt: -1 });

  const items = bookings.map((b) => ({
    ...mapBookingSummaryForUser(b),
    customer: b.customer
      ? {
        id: b.customer._id,
        name: b.customer.fullName,
        email: b.customer.email,
        phoneNumber: b.customer.phoneNumber,
        profilePicture: b.customer.profilePicture
      }
      : null
  }));

  sendSuccessResponse(res, httpStatus.OK, "Owner bookings fetched", {
    items
  });
});


// export const updateBookingStatus = catchAsync(async (req, res) => {
//   const ownerId = req.user.id;
//   const bookingId = req.params.id;
//   const { status } = req.body;

//   const booking = await bookingService.updateBookingStatus(
//     ownerId,
//     bookingId,
//     status
//   );

//   sendSuccessResponse(res, httpStatus.OK, "Booking status updated", { booking });
// });



export const extendBooking = catchAsync(async (req, res) => {
  const booking = await bookingService.extendBooking(
    req.params.bookingId,
    req.user.id,
    req.body.newEndTime
  );

  sendSuccessResponse(res, httpStatus.OK, "Booking extended", { booking });
});


// export const downloadInvoice = catchAsync(async (req, res) => {
//   const booking = await Booking.findById(req.params.bookingId);

//   if (!booking || !booking.pdfPath) {
//     throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
//   }

//   return res.download(booking.pdfPath);
// });




export const downloadInvoice = catchAsync(async (req, res) => {
  const { bookingId } = req.params;
  const booking = await Booking.findById(bookingId);

  if (!booking || !booking.pdfPath) {
    throw new ApiError(httpStatus.NOT_FOUND, "Invoice not available");
  }

  // Check if it's a Cloudinary URL (or any remote URL)
  if (booking.pdfPath.startsWith("http")) {
    return res.json({
      data: {
        url: booking.pdfPath
      }
    });
  }

  // Fallback for local files (legacy support)
  return res.download(booking.pdfPath);
});


export const getBookingDetailForUser = catchAsync(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const booking = await Booking.findById(bookingId)
    .select("+handoverSecret")
    .populate("car", "make model year photos location color plateNumber")
    .populate("customer", "fullName email phoneNumber profilePicture")
    .populate("owner", "fullName email");
  // Lazy Generation of Secret for Legacy Bookings
  if (booking && !booking.handoverSecret && (booking.status === 'confirmed' || booking.status === 'ongoing')) {
    const { randomBytes } = await import('crypto');
    booking.handoverSecret = randomBytes(32).toString('hex');
    await booking.save();
  }

  if (!booking) {
    throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
  }

  // Only customer, owner, or admin can see
  const isCustomer = booking.customer?.id?.toString() === userId.toString();
  const isOwner = booking.owner?.id?.toString() === userId.toString();
  const isAdmin = userRole === "admin";

  if (!isCustomer && !isOwner && !isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You are not allowed to view this booking"
    );
  }

  const data = mapBookingDetailForUser(booking);

  // For owner/admin, add earnings info
  if (isOwner || isAdmin) {
    data.ownerEarningAmount = booking.ownerEarningAmount;
    data.platformCommissionAmount = booking.platformCommissionAmount;
    data.platformCommissionPercent = booking.platformCommissionPercent;
    // Hide secret from Host/Admin (they strictly SCAN it, not VIEW it)
    delete data.handoverSecret;
  }

  sendSuccessResponse(res, httpStatus.OK, "Booking detail fetched", {
    booking: data
  });
});

// Update location from background (HTTP fallback when socket unavailable)
export const updateLocation = catchAsync(async (req, res) => {
  const { bookingId } = req.params;
  const { lat, lng, heading, speed, timestamp } = req.body;

  // Validate
  if (!lat || !lng) {
    return sendSuccessResponse(res, httpStatus.BAD_REQUEST, "lat and lng are required");
  }

  // Update booking's currentLocation in DB
  const booking = await bookingService.updateBookingLocation(bookingId, {
    lat,
    lng,
    heading: heading || 0,
    speed: speed || 0,
    updatedAt: timestamp || new Date(),
  });

  if (!booking) {
    return sendSuccessResponse(res, httpStatus.NOT_FOUND, "Booking not found");
  }

  // Broadcast to socket room for real-time tracking on host's device
  const { getIO } = await import("../socket/socket.server.js");
  try {
    const io = getIO();
    io.to(bookingId).emit("receive_location", {
      bookingId,
      lat,
      lng,
      heading: heading || 0,
      speed: speed || 0,
      timestamp: timestamp || new Date().toISOString(),
    });
    console.log("📍 Background location received & broadcasted:", bookingId, lat, lng);
  } catch (err) {
    console.log("Socket broadcast skipped:", err.message);
  }

  sendSuccessResponse(res, httpStatus.OK, "Location updated");
});

export const cancelBooking = catchAsync(async (req, res) => {
  const { bookingId } = req.params;
  const customerId = req.user.id;

  const booking = await bookingService.cancelBooking(bookingId, customerId);

  sendSuccessResponse(res, httpStatus.OK, "Booking cancelled successfully", {
    booking,
  });
});
