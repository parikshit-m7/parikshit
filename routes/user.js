const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const { saveRedirectUrl } = require("../middleware.js");
const userController = require("../controllers/users.js");

router.route("/signup")
  .get(userController.renderSignupForm)
  .post(wrapAsync(userController.signup));

router.route("/login")
  .get(userController.renderLogin)
  .post(
    saveRedirectUrl,
    passport.authenticate("local", {
      failureRedirect: "/login",
      failureFlash: true,
    }),
    userController.login
  );

router.get("/forgot-password", userController.renderForgotPassword);
router.post("/forgot-password", wrapAsync(userController.requestPasswordReset));
router.get("/reset-password/:token", wrapAsync(userController.renderResetPassword));
router.post("/reset-password/:token", wrapAsync(userController.resetPassword));

router.get("/logout", userController.logout);

module.exports = router;