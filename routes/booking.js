const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn } = require("../middleware");
const bookingController = require("../controllers/bookings");

router.get("/", isLoggedIn, wrapAsync(bookingController.index));
router.get("/hosting", isLoggedIn, wrapAsync(bookingController.hosting));
router.post("/:bookingId/cancel", isLoggedIn, wrapAsync(bookingController.cancel));

module.exports = router;
