const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  guests: { type: Number, required: true, min: 1, max: 10 },
  rooms: { type: Number, required: true, min: 1, default: 1 },
  nights: { type: Number, required: true, min: 1 },
  totalPrice: { type: Number, required: true, min: 0 },
  depositAmount: { type: Number, required: true, min: 0, default: 0 },
  amountPaid: { type: Number, min: 0, default: 0 },
  razorpayOrderId: { type: String, index: true, sparse: true },
  razorpayPaymentId: { type: String, index: true, sparse: true },
  holdExpiresAt: { type: Date, index: true },
  status: { type: String, enum: ["payment_pending", "confirmed", "payment_failed", "payment_refunded", "cancelled", "pending", "rejected"], default: "payment_pending" },
}, { timestamps: true });

bookingSchema.index({ listing: 1, checkIn: 1, checkOut: 1, status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
