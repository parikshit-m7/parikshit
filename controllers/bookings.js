const Listing = require("../models/listing");
const Booking = require("../models/booking");
const ExpressError = require("../utils/ExpressError");

const parseDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

module.exports.create = async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ExpressError(404, "This stay could not be found.");
  if (listing.owner && listing.owner.equals(req.user._id)) {
    req.flash("error", "You cannot book your own stay.");
    return res.redirect(`/listings/${listing._id}`);
  }

  const checkIn = parseDate(req.body.checkIn);
  const checkOut = parseDate(req.body.checkOut);
  const guests = Number(req.body.guests);
  const todayISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const today = new Date(`${todayISO}T00:00:00.000Z`);
  if (!checkIn || !checkOut || checkIn < today || checkOut <= checkIn) {
    req.flash("error", "Choose valid check-in and check-out dates.");
    return res.redirect(`/listings/${listing._id}`);
  }
  const nights = (checkOut - checkIn) / 86400000;
  if (nights > 30 || !Number.isInteger(guests) || guests < 1 || guests > 10) {
    req.flash("error", "Choose up to 30 nights and between 1 and 10 guests.");
    return res.redirect(`/listings/${listing._id}`);
  }

  const overlap = await Booking.exists({
    listing: listing._id,
    status: { $in: ["pending", "confirmed"] },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  });
  if (overlap) {
    req.flash("error", "Those dates are no longer available. Please choose different dates.");
    return res.redirect(`/listings/${listing._id}`);
  }

  await Booking.create({
    listing: listing._id,
    bookedBy: req.user._id,
    checkIn,
    checkOut,
    guests,
    nights,
    totalPrice: Number(listing.price || 0) * nights,
  });
  req.flash("success", "Your booking request has been sent to the host.");
  res.redirect("/bookings");
};

module.exports.index = async (req, res) => {
  const bookings = await Booking.find({ bookedBy: req.user._id })
    .populate("listing", "title location image price")
    .sort({ createdAt: -1 });
  res.render("bookings/index.ejs", { bookings });
};

module.exports.hosting = async (req, res) => {
  const stays = await Listing.find({ owner: req.user._id }).select("_id");
  const bookings = stays.length ? await Booking.find({ listing: { $in: stays.map((stay) => stay._id) } })
    .populate("listing", "title location image")
    .populate("bookedBy", "username")
    .sort({ createdAt: -1 }) : [];
  res.render("bookings/hosting.ejs", { bookings });
};

module.exports.updateStatus = async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId).populate("listing", "owner");
  if (!booking || !booking.listing || !booking.listing.owner.equals(req.user._id)) {
    throw new ExpressError(404, "Reservation could not be found.");
  }
  const status = req.body.status;
  if (booking.status !== "pending" || !["confirmed", "rejected"].includes(status)) {
    req.flash("error", "This reservation can no longer be updated.");
    return res.redirect("/bookings/hosting");
  }
  if (status === "confirmed") {
    const overlap = await Booking.exists({
      _id: { $ne: booking._id }, listing: booking.listing._id,
      status: { $in: ["pending", "confirmed"] },
      checkIn: { $lt: booking.checkOut }, checkOut: { $gt: booking.checkIn },
    });
    if (overlap) {
      req.flash("error", "Another request overlaps these dates. Resolve that request before confirming.");
      return res.redirect("/bookings/hosting");
    }
  }
  booking.status = status;
  await booking.save();
  req.flash("success", status === "confirmed" ? "Booking confirmed." : "Booking request declined.");
  res.redirect("/bookings/hosting");
};

module.exports.cancel = async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.bookingId, bookedBy: req.user._id });
  if (!booking) throw new ExpressError(404, "Booking could not be found.");
  if (booking.status !== "pending") {
    req.flash("error", "Only pending booking requests can be cancelled here.");
    return res.redirect("/bookings");
  }
  booking.status = "cancelled";
  await booking.save();
  req.flash("success", "Booking request cancelled.");
  res.redirect("/bookings");
};
