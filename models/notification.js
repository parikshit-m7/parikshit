const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  type: { type: String, enum: ["booking_created", "cancellation_requested"], required: true },
  readAt: { type: Date, default: null, index: true },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
