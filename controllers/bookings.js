const mongoose = require("mongoose");
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const ExpressError = require("../utils/ExpressError");
const razorpay = require("../utils/razorpay");

const HOLD_MINUTES = 15;

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

function priceBreakdown(listing, nights, rooms) {
  const nightlyPricePaise = Math.round(Number(listing.price || 0) * 100);
  const totalPaise = nightlyPricePaise * nights * rooms;
  const depositPaise = Math.ceil(totalPaise / 2);
  return {
    totalPrice: totalPaise / 100,
    depositAmount: depositPaise / 100,
    remainingAmount: (totalPaise - depositPaise) / 100,
    totalPaise,
    depositPaise,
  };
}

async function reservedRooms(listingId, checkIn, checkOut, session) {
  const now = new Date();
  const query = Booking.find({
    listing: listingId,
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
    $or: [
      { status: "confirmed" },
      { status: "payment_pending", holdExpiresAt: { $gt: now } },
    ],
  }).select("rooms -_id");
  if (session) query.session(session);
  const reservations = await query.lean();
  return reservations.reduce((sum, reservation) => sum + Math.max(1, Number(reservation.rooms) || 1), 0);
}

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function refundCapturedPayment(booking, paymentId, amountPaise) {
  try {
    await razorpay.apiRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST",
      body: { amount: amountPaise, notes: { booking_id: String(booking._id), reason: "Booking hold expired or was cancelled" } },
    });
    booking.razorpayPaymentId = paymentId;
    booking.amountPaid = 0;
    booking.status = "payment_refunded";
    await booking.save();
    return true;
  } catch (error) {
    console.error("Could not refund a captured booking payment:", error.message);
    booking.razorpayPaymentId = paymentId;
    booking.status = "payment_failed";
    await booking.save();
    return false;
  }
}

module.exports.availability = async (req, res) => {
  const listing = await Listing.findById(req.params.id).select("price rooms");
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
  const price = priceBreakdown(listing, dates.nights, rooms);
  res.json({
    available: rooms <= roomsAvailable,
    roomsAvailable,
    totalRooms,
    nights: dates.nights,
    rooms,
    totalPrice: price.totalPrice,
    depositAmount: price.depositAmount,
    remainingAmount: price.remainingAmount,
    holdMinutes: HOLD_MINUTES,
  });
};

module.exports.create = async (req, res) => {
  if (!razorpay.isConfigured()) {
    return jsonError(res, 503, "Online booking is being set up. Please try again later.");
  }

  const listing = await Listing.findById(req.params.id);
  if (!listing) return jsonError(res, 404, "This stay could not be found.");
  if (listing.owner && listing.owner.equals(req.user._id)) {
    return jsonError(res, 403, "You cannot book your own stay.");
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
  if (!(Number(listing.price) > 0)) return jsonError(res, 400, "This stay does not have a valid nightly price yet.");

  const price = priceBreakdown(listing, dates.nights, rooms);
  if (!Number.isSafeInteger(price.totalPaise) || price.depositPaise < 1) {
    return jsonError(res, 400, "The booking total is invalid.");
  }

  const session = await mongoose.startSession();
  let booking;
  try {
    await session.withTransaction(async () => {
      // A write to the listing document makes concurrent room checks conflict,
      // so two checkouts cannot both reserve the last available rooms.
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
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        nights: dates.nights,
        guests,
        rooms,
        totalPrice: price.totalPrice,
        depositAmount: price.depositAmount,
        amountPaid: 0,
        status: "payment_pending",
        holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
      });
      await booking.save({ session });
    });
  } catch (error) {
    if (error.code === "ROOMS_UNAVAILABLE") return jsonError(res, 409, error.message);
    console.error("Could not reserve rooms for checkout:", error.message);
    return jsonError(res, 503, "Could not hold those rooms right now. Please check availability and try again.");
  } finally {
    await session.endSession();
  }

  try {
    const order = await razorpay.apiRequest("/orders", {
      method: "POST",
      body: {
        amount: price.depositPaise,
        currency: "INR",
        receipt: `bk_${booking._id}`,
        notes: { booking_id: String(booking._id), listing_id: String(listing._id) },
      },
    });
    booking.razorpayOrderId = order.id;
    await booking.save();
    return res.status(201).json({
      bookingId: String(booking._id),
      keyId: razorpay.keyId,
      orderId: order.id,
      amount: price.depositPaise,
      currency: "INR",
      totalPrice: price.totalPrice,
      depositAmount: price.depositAmount,
      remainingAmount: price.remainingAmount,
      holdMinutes: HOLD_MINUTES,
      listingTitle: listing.title,
      user: { name: req.user.username || "Wanderlust guest", email: req.user.email || "" },
    });
  } catch (error) {
    console.error("Could not create Razorpay order:", error.message);
    booking.status = "payment_failed";
    booking.holdExpiresAt = new Date();
    await booking.save();
    return jsonError(res, 502, "Payment could not start. Your room hold has been released; please try again.");
  }
};

async function confirmCapturedPayment(booking, payment) {
  const expectedPaise = Math.round(Number(booking.depositAmount) * 100);
  if (
    !payment || payment.order_id !== booking.razorpayOrderId ||
    payment.amount !== expectedPaise || payment.currency !== "INR"
  ) return { ok: false, status: 400, error: "Payment details did not match this booking." };

  let verifiedPayment = payment;
  if (payment.status === "authorized") {
    verifiedPayment = await razorpay.apiRequest(`/payments/${encodeURIComponent(payment.id)}/capture`, {
      method: "POST", body: { amount: expectedPaise, currency: "INR" },
    });
  }
  if (verifiedPayment.status !== "captured") {
    return { ok: false, status: 409, error: "Payment is still processing. Your room is held for 15 minutes." };
  }

  if (booking.status === "confirmed" && booking.razorpayPaymentId === verifiedPayment.id) {
    return { ok: true, booking };
  }
  if (booking.status !== "payment_pending" || !booking.holdExpiresAt || booking.holdExpiresAt <= new Date()) {
    const refunded = await refundCapturedPayment(booking, verifiedPayment.id, expectedPaise);
    return {
      ok: false,
      status: 409,
      refunded,
      error: refunded
        ? "The room hold expired, so your payment has been refunded. Please start a new booking."
        : "The room hold expired and your payment refund is being reviewed. Please contact support.",
    };
  }

  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "payment_pending", holdExpiresAt: { $gt: new Date() }, razorpayOrderId: booking.razorpayOrderId },
    { $set: { status: "confirmed", razorpayPaymentId: verifiedPayment.id, amountPaid: booking.depositAmount } },
    { new: true },
  );
  if (!confirmed) {
    const latest = await Booking.findById(booking._id);
    if (latest?.status === "confirmed" && latest.razorpayPaymentId === verifiedPayment.id) return { ok: true, booking: latest };
    const refunded = await refundCapturedPayment(latest || booking, verifiedPayment.id, expectedPaise);
    return { ok: false, status: 409, refunded, error: refunded ? "Room hold expired; your payment has been refunded." : "Payment refund needs support review." };
  }
  return { ok: true, booking: confirmed };
}

module.exports.confirm = async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.bookingId, bookedBy: req.user._id });
  if (!booking) return jsonError(res, 404, "Booking could not be found.");
  if (!razorpay.verifyCheckoutSignature({
    orderId: req.body.razorpay_order_id,
    paymentId: req.body.razorpay_payment_id,
    signature: req.body.razorpay_signature,
  }) || req.body.razorpay_order_id !== booking.razorpayOrderId) {
    return jsonError(res, 400, "Payment verification failed. The booking is not confirmed.");
  }

  try {
    const payment = await razorpay.apiRequest(`/payments/${encodeURIComponent(req.body.razorpay_payment_id)}`);
    const result = await confirmCapturedPayment(booking, payment);
    if (!result.ok) return res.status(result.status).json(result);
    res.json({ ok: true, bookingId: String(result.booking._id) });
  } catch (error) {
    console.error("Could not verify the booking payment:", error.message);
    return jsonError(res, 502, "Payment is received by the gateway but could not yet be verified. Keep this page open and check My trips shortly.");
  }
};

module.exports.webhook = async (req, res) => {
  const signature = req.get("x-razorpay-signature");
  if (!razorpay.verifyWebhookSignature(req.body, signature)) {
    return res.status(400).send("Invalid webhook signature.");
  }
  let event;
  try { event = JSON.parse(req.body.toString("utf8")); }
  catch (_) { return res.status(400).send("Invalid webhook payload."); }

  if (event.event !== "payment.captured") return res.status(200).send("Event ignored.");
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id || !payment?.id) return res.status(200).send("Payment details missing.");
  const booking = await Booking.findOne({ razorpayOrderId: payment.order_id });
  if (!booking) return res.status(200).send("Booking not found.");
  try {
    const result = await confirmCapturedPayment(booking, payment);
    if (!result.ok && !result.refunded) console.error("Captured booking payment needs review:", result.error);
    return res.status(200).send("Webhook processed.");
  } catch (error) {
    console.error("Could not process payment webhook:", error.message);
    return res.status(500).send("Webhook processing failed.");
  }
};

module.exports.index = async (req, res) => {
  const bookings = await Booking.find({ bookedBy: req.user._id })
    .populate("listing", "title location image price")
    .sort({ createdAt: -1 });
  res.render("bookings/index.ejs", { bookings, paymentReady: razorpay.isConfigured() });
};

module.exports.retryPayment = async (req, res) => {
  if (!razorpay.isConfigured()) return jsonError(res, 503, "Online payments are not configured yet.");
  const booking = await Booking.findOne({ _id: req.params.bookingId, bookedBy: req.user._id }).populate("listing", "title");
  if (!booking || booking.status !== "payment_pending" || !booking.razorpayOrderId || !booking.holdExpiresAt || booking.holdExpiresAt <= new Date()) {
    return jsonError(res, 409, "This room hold has expired. Start a new booking to check availability.");
  }
  res.json({
    bookingId: String(booking._id), keyId: razorpay.keyId,
    orderId: booking.razorpayOrderId,
    amount: Math.round(Number(booking.depositAmount) * 100), currency: "INR",
    totalPrice: booking.totalPrice, depositAmount: booking.depositAmount,
    remainingAmount: booking.totalPrice - booking.depositAmount,
    holdMinutes: Math.max(1, Math.ceil((booking.holdExpiresAt - Date.now()) / 60000)),
    listingTitle: booking.listing?.title || "Wanderlust stay",
    user: { name: req.user.username || "Wanderlust guest", email: req.user.email || "" },
  });
};

module.exports.hosting = async (req, res) => {
  const stays = await Listing.find({ owner: req.user._id }).select("_id");
  const bookings = stays.length ? await Booking.find({ listing: { $in: stays.map((stay) => stay._id) } })
    .populate("listing", "title location image")
    .populate("bookedBy", "username")
    .sort({ createdAt: -1 }) : [];
  res.render("bookings/hosting.ejs", { bookings });
};

module.exports.cancel = async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.bookingId, bookedBy: req.user._id });
  if (!booking) throw new ExpressError(404, "Booking could not be found.");
  if (booking.status !== "payment_pending" || booking.razorpayPaymentId) {
    req.flash("error", "Only an unpaid room hold can be cancelled here.");
    return res.redirect("/bookings");
  }
  booking.status = "cancelled";
  booking.holdExpiresAt = new Date();
  await booking.save();
  req.flash("success", "Unpaid room hold cancelled.");
  res.redirect("/bookings");
};
