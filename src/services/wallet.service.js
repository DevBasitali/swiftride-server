import { Wallet } from "../models/wallet.model.js";
import { WalletTransaction } from "../models/walletTransaction.model.js";
import { Booking } from "../models/booking.model.js";

import { WithdrawalRequest } from "../models/withdrawalRequest.model.js";
import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const COMMISSION_PERCENT = Number(
  process.env.WALLET_PLATFORM_COMMISSION_PERCENT || 10
);

const getOrCreateWallet = async (userId) => {
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return wallet;
};

/**
 * Called when PAYMENT SUCCESS (Easypaisa success) – money is received by SwiftRide.
 * We calculate:
 *  - platformCommissionAmount
 *  - ownerEarningAmount
 * And put owner's earnings into PENDING balance.
 */
export const createBookingEarning = async (booking) => {
  const commissionAmount = (booking.totalPrice * COMMISSION_PERCENT) / 100;
  const ownerEarning = booking.totalPrice - commissionAmount;

  booking.platformCommissionPercent = COMMISSION_PERCENT;
  booking.platformCommissionAmount = commissionAmount;
  booking.ownerEarningAmount = ownerEarning;
  await booking.save();

  const wallet = await getOrCreateWallet(booking.owner);

  wallet.balancePending += ownerEarning;
  await wallet.save();

  await WalletTransaction.create({
    user: booking.owner,
    booking: booking._id,
    type: "earning",
    status: "pending",
    amount: ownerEarning,
    description: `Booking earning (pending) for booking ${booking._id}`,
    balanceAfterAvailable: wallet.balanceAvailable,
    balanceAfterPending: wallet.balancePending
  });

  return { wallet, booking };
};

/**
 * Called when BOOKING COMPLETED – earnings move from pending to available.
 */
export const releaseBookingEarning = async (bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) return;

  const earning = booking.ownerEarningAmount || 0;
  if (earning <= 0) return;

  const wallet = await getOrCreateWallet(booking.owner);

  // Find transaction(s) for this booking
  const tx = await WalletTransaction.findOne({
    user: booking.owner,
    booking: bookingId,
    type: "earning",
    status: "pending"
  });

  if (!tx) return;

  wallet.balancePending -= earning;
  wallet.balanceAvailable += earning;
  await wallet.save();

  tx.status = "available";
  tx.balanceAfterAvailable = wallet.balanceAvailable;
  tx.balanceAfterPending = wallet.balancePending;
  await tx.save();

  return { wallet, booking, transaction: tx };
};

export const getWalletForUser = async (userId) => {
  const wallet = await getOrCreateWallet(userId);
  return wallet;
};

export const getTransactionsForUser = async (userId, limit = 50) => {
  const txs = await WalletTransaction.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("booking", "invoiceNumber status totalPrice");

  return txs;
};

// --- WITHDRAWAL LOGIC ---
export const requestWithdrawal = async (userId, amount, bankDetails) => {
  const wallet = await getOrCreateWallet(userId);

  if (wallet.balanceAvailable < amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Insufficient available balance");
  }

  // Deduct immediately (hold funds)
  wallet.balanceAvailable -= amount;
  await wallet.save();

  // Create Transaction Record (Processing)
  const transaction = await WalletTransaction.create({
    user: userId,
    type: "withdrawal",
    status: "processing",
    amount: amount,
    description: `Withdrawal request to ${bankDetails.bankName} (${bankDetails.accountNumber})`,
    balanceAfterAvailable: wallet.balanceAvailable,
    balanceAfterPending: wallet.balancePending
  });

  // Create Request Record
  const request = await WithdrawalRequest.create({
    user: userId,
    amount,
    bankDetails,
    status: "pending",
    transaction: transaction._id
  });

  return request;
};

export const getWithdrawalRequests = async (filter = {}) => {
  const requests = await WithdrawalRequest.find(filter)
    .populate("user", "fullName email")
    .sort({ createdAt: -1 });

  // Enrich with User Stats
  const enrichedRequests = await Promise.all(requests.map(async (req) => {
    if (!req.user) return req.toObject();

    const wallet = await Wallet.findOne({ user: req.user._id });

    // Count bookings with pending payments (earning + pending)
    const pendingBookingsCount = await WalletTransaction.countDocuments({
      user: req.user._id,
      type: "earning",
      status: "pending"
    });

    return {
      ...req.toObject(),
      userStats: {
        balanceAvailable: wallet ? wallet.balanceAvailable : 0,
        balancePending: wallet ? wallet.balancePending : 0,
        pendingBookingsCount
      }
    };
  }));

  return enrichedRequests;
};



export const approveWithdrawal = async (requestId, adminNote, proofFile) => {
  const request = await WithdrawalRequest.findById(requestId).populate("transaction");
  if (!request) throw new ApiError(httpStatus.NOT_FOUND, "Request not found");
  if (request.status !== "pending") throw new ApiError(httpStatus.BAD_REQUEST, "Request already processed");

  // Upload Proof (if provided)
  if (proofFile) {
    const uploadRes = await uploadToCloudinary(proofFile.buffer);
    request.proofImage = uploadRes.secure_url;
    request.proofDate = new Date();
  }

  request.status = "approved";
  request.adminNote = adminNote;
  await request.save();

  if (request.transaction) {
    const tx = await WalletTransaction.findById(request.transaction._id);
    if (tx) {
      tx.status = "paid_out";
      await tx.save();
    }
  }

  return request;
};

/**
 * Called when a late fee payment is confirmed.
 * Credits the full lateFeeAmount directly to host's balanceAvailable.
 */
export const creditLateFeeEarning = async (bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) return;

  const wallet = await getOrCreateWallet(booking.owner);

  wallet.balanceAvailable += booking.lateFeeAmount;
  await wallet.save();

  await WalletTransaction.create({
    user: booking.owner,
    booking: booking._id,
    type: "earning",
    status: "available",
    amount: booking.lateFeeAmount,
    description: `Late Return Fee — Booking #${booking._id}`,
    balanceAfterAvailable: wallet.balanceAvailable,
    balanceAfterPending: wallet.balancePending
  });

  return { wallet, booking };
};

export const rejectWithdrawal = async (requestId, adminNote) => {
  const request = await WithdrawalRequest.findById(requestId);
  if (!request) throw new ApiError(httpStatus.NOT_FOUND, "Request not found");
  if (request.status !== "pending") throw new ApiError(httpStatus.BAD_REQUEST, "Request already processed");

  const wallet = await getOrCreateWallet(request.user);

  // Refund the held amount
  wallet.balanceAvailable += request.amount;
  await wallet.save();

  // Update Request
  request.status = "rejected";
  request.adminNote = adminNote;
  await request.save();

  // Update Transaction to Declined
  if (request.transaction) {
    await WalletTransaction.findByIdAndUpdate(request.transaction, {
      status: "declined",
      description: `Withdrawal declined: ${adminNote}`,
      balanceAfterAvailable: wallet.balanceAvailable
    });
  }

  return request;
};
