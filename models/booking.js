const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  guestPhone: { type: String, trim: true, required: true },
  aadhaarLast4: { type: String, trim: true, match: /^\d{4}$/ },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  guests: { type: Number, required: true, min: 1, max: 10 },
  rooms: { type: Number, required: true, min: 1, default: 1 },
  nights: { type: Number, required: true, min: 1 },
  totalPrice: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["confirmed", "cancelled", "pending", "rejected", "payment_pending"], default: "confirmed" },
}, { timestamps: true });

bookingSchema.index({ listing: 1, checkIn: 1, checkOut: 1, status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
