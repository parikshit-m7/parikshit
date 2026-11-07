const mongoose = require("mongoose");
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const ExpressError = require("../utils/ExpressError");

const parseDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

function bookingDates(body) {
  const checkIn = parseDate(body.checkIn);
  const checkOut = parseDate(body.checkOut);
  const todayISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const today = new Date(`${todayISO}T00:00:00.000Z`);
  if (!checkIn || !checkOut || checkIn < today || checkOut <= checkIn) {
    return { error: "Choose valid check-in and check-out dates." };
  }
  const nights = (checkOut - checkIn) / 86400000;
  if (!Number.isInteger(nights) || nights > 30) return { error: "Bookings can be up to 30 nights." };
  return { checkIn, checkOut, nights };
}

function normalizeBookingPhone(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[+0-9\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

function calculateTotal(listing, nights, rooms) {
  const totalPaise = Math.round(Number(listing.price || 0) * 100) * nights * rooms;
  return Number.isSafeInteger(totalPaise) ? totalPaise / 100 : NaN;
}

async function reservedRooms(listingId, checkIn, checkOut, session) {
  const query = Booking.find({
    listing: listingId,
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
    status: "confirmed",
  }).select("rooms -_id");
  if (session) query.session(session);
  const reservations = await query.lean();
  return reservations.reduce((sum, reservation) => sum + Math.max(1, Number(reservation.rooms) || 1), 0);
}

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

module.exports.availability = async (req, res) => {
  const listing = await Listing.findOne({ _id: req.params.id, isArchived: { $ne: true } }).select("price rooms");
  if (!listing) return jsonError(res, 404, "This stay could not be found.");
  const dates = bookingDates(req.query);
  if (dates.error) return jsonError(res, 400, dates.error);
  const rooms = Number(req.query.rooms || 1);
  const totalRooms = Math.max(1, Number(listing.rooms) || 1);
  if (!Number.isInteger(rooms) || rooms < 1 || rooms > totalRooms) {
    return jsonError(res, 400, "Choose a valid number of rooms.");
  }
  const usedRooms = await reservedRooms(listing._id, dates.checkIn, dates.checkOut);
  const roomsAvailable = Math.max(0, totalRooms - usedRooms);
  res.json({
    available: rooms <= roomsAvailable,
    roomsAvailable,
    totalRooms,
    nights: dates.nights,
    rooms,
    totalPrice: calculateTotal(listing, dates.nights, rooms),
  });
};

module.exports.create = async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) return jsonError(res, 404, "This stay could not be found.");
  if (listing.isArchived) return jsonError(res, 404, "This stay is no longer available for booking.");
  if (listing.owner && listing.owner.equals(req.user._id)) {
    return jsonError(res, 403, "You cannot book your own stay.");
  }

  const guestPhone = normalizeBookingPhone(req.body.guestPhone);
  if (!guestPhone) return jsonError(res, 400, "Enter a valid mobile number for this booking.");
  if (req.body.bookingContactConsent !== "yes") {
    return jsonError(res, 400, "Please agree to share your booking contact details with the stay host.");
  }
  const dates = bookingDates(req.body);
  if (dates.error) return jsonError(res, 400, dates.error);
  const rooms = Number(req.body.rooms);
  const guests = Number(req.body.guests);
  const totalRooms = Math.max(1, Number(listing.rooms) || 1);
  if (!Number.isInteger(rooms) || rooms < 1 || rooms > totalRooms) {
    return jsonError(res, 400, "Choose a valid number of rooms.");
  }
  if (!Number.isInteger(guests) || guests < 1 || guests > 10 || guests > rooms * 6) {
    return jsonError(res, 400, "Choose a valid guest count for the selected rooms.");
  }
  const totalPrice = calculateTotal(listing, dates.nights, rooms);
  if (!(totalPrice > 0) || !Number.isFinite(totalPrice)) return jsonError(res, 400, "This stay does not have a valid price yet.");

  const session = await mongoose.startSession();
  let booking;
  try {
    await session.withTransaction(async () => {
      // Updating the listing serializes overlapping bookings for the last room.
      await Listing.updateOne({ _id: listing._id }, { $inc: { reservationVersion: 1 } }, { session });
      const usedRooms = await reservedRooms(listing._id, dates.checkIn, dates.checkOut, session);
      if (usedRooms + rooms > totalRooms) {
        const error = new Error("Not enough rooms are available for those dates.");
        error.code = "ROOMS_UNAVAILABLE";
        throw error;
      }
      booking = new Booking({
        listing: listing._id,
        bookedBy: req.user._id,
        guestPhone,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        nights: dates.nights,
        guests,
        rooms,
        totalPrice,
        status: "confirmed",
      });
      await booking.save({ session });
    });
  } catch (error) {
    if (error.code === "ROOMS_UNAVAILABLE") return jsonError(res, 409, error.message);
    console.error("Could not confirm booking:", error.message);
    return jsonError(res, 503, "Could not confirm those rooms right now. Please check availability and try again.");
  } finally {
    await session.endSession();
  }

  res.status(201).json({ ok: true, bookingId: String(booking._id) });
};

module.exports.index = async (req, res) => {
  const bookings = await Booking.find({ bookedBy: req.user._id })
    .populate("listing", "title location image price")
    .sort({ createdAt: -1 });
  const todayISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  res.render("bookings/index.ejs", { bookings, todayISO });
};

module.exports.hosting = async (req, res) => {
  const stays = await Listing.find({ owner: req.user._id }).select("_id");
  if (!stays.length) {
    req.flash("error", "Pehle apni stay listing banao, phir host bookings dekh paoge.");
    return res.redirect("/listings/new");
  }
  const bookings = await Booking.find({ listing: { $in: stays.map((stay) => stay._id) } })
    .populate("listing", "title location image")
    .populate("bookedBy", "username")
    .sort({ createdAt: -1 });
  res.render("bookings/hosting.ejs", { bookings });
};

module.exports.cancel = async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.bookingId, bookedBy: req.user._id });
  if (!booking) throw new ExpressError(404, "Booking could not be found.");
  if (!["confirmed", "payment_pending"].includes(booking.status)) {
    req.flash("error", "Only confirmed bookings can be cancelled.");
    return res.redirect("/bookings");
  }

  if (booking.status === "confirmed") {
    const todayISO = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    if (booking.checkIn.toISOString().slice(0, 10) <= todayISO) {
      req.flash("error", "This booking can no longer be cancelled online because check-in has started.");
      return res.redirect("/bookings");
    }
    const cancelled = await Booking.findOneAndUpdate(
      { _id: booking._id, bookedBy: req.user._id, status: "confirmed", checkIn: { $gt: new Date(`${todayISO}T00:00:00.000Z`) } },
      { $set: { status: "cancelled" } },
      { new: true }
    );
    if (!cancelled) {
      req.flash("error", "This booking could not be cancelled. Please refresh and try again.");
      return res.redirect("/bookings");
    }
  } else {
    booking.status = "cancelled";
    await booking.save();
  }
  req.flash("success", "Booking cancelled.");
  res.redirect("/bookings");
};
