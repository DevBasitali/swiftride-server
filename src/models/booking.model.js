import mongoose from "mongoose";

const extensionSchema = new mongoose.Schema({
  oldEnd: Date,
  newEnd: Date,
  extraHours: Number,
  extraAmount: Number,
  extendedAt: { type: Date, default: Date.now }
});

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["pending", "confirmed", "ongoing", "completed", "cancelled"]
  },
  changedAt: { type: Date, default: Date.now },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  note: String
});

const bookingSchema = new mongoose.Schema(
  {
    car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },

    durationHours: Number,
    totalPrice: Number,
    currency: {
      type: String,
      default: process.env.INVOICE_CURRENCY || "PKR"
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "ongoing", "completed", "cancelled"],
      default: "pending"
    },
    statusHistory: [statusHistorySchema],

    invoiceNumber: String,
    pdfPath: String,

    isExtended: { type: Boolean, default: false },
    extensions: [extensionSchema],
      platformCommissionPercent: {
    type: Number,
    default: Number(process.env.WALLET_PLATFORM_COMMISSION_PERCENT || 10) // 10% default
  },
  platformCommissionAmount: {
    type: Number,
    default: 0
  },
  ownerEarningAmount: {
    type: Number,
    default: 0
  },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "processing", "paid", "failed"],
      default: "unpaid"
    },
    
    currentLocation: {
      lat: Number,
      lng: Number,
      heading: Number,
      updatedAt: Date
    },
    paymentReference: String,
    
    // --- QR Handover & Claims ---
    handoverSecret: { type: String, select: false }, // Hidden by default for security
    
    pickupImages: [{ type: String }], // Array of image URLs
    returnImages: [{ type: String }],
    
    handoverStatus: {
      type: String,
      enum: ["pending", "pickup_scanned", "active", "return_scanned", "completed"],
      default: "pending"
    },

    // --- Late Return Fees ---
    actualReturnDateTime: { type: Date },
    lateFeeAmount:        { type: Number, default: 0 },
    isLateFeePaid:        { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Booking = mongoose.model("Booking", bookingSchema);
