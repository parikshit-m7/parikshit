const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const { saveRedirectUrl } = require("../middleware.js");
const userController = require("../controllers/users.js");

router.get("/auth/google", userController.startGoogleLogin);
router.get("/auth/google/callback", wrapAsync(userController.finishGoogleLogin));
router.get("/complete-google-signup", userController.renderCompleteGoogleSignup);
router.post("/complete-google-signup", wrapAsync(userController.completeGoogleSignup));

router.route("/signup")
  .get(userController.renderSignupForm)
  .post(wrapAsync(userController.sendPhoneSignupOtp));

router.get("/verify-phone", userController.renderPhoneSignupOtp);
router.post("/verify-phone", wrapAsync(userController.verifyPhoneSignupOtp));
router.post("/verify-phone/resend", wrapAsync(userController.resendPhoneSignupOtp));
router.get("/complete-phone-signup", userController.renderCompletePhoneSignup);
router.post("/complete-phone-signup", wrapAsync(userController.completePhoneSignup));

router.route("/login")
  .get(userController.renderLogin)
  .post(
    saveRedirectUrl,
    userController.prepareLogin,
    passport.authenticate("local", {
      failureRedirect: "/login",
      failureFlash: "Incorrect email, username, mobile number, or password.",
    }),
    userController.login
  );

router.get("/forgot-password", userController.renderForgotPassword);
router.post("/forgot-password", wrapAsync(userController.requestPasswordReset));
router.get("/verify-otp", userController.renderVerifyOtp);
router.post("/verify-otp", wrapAsync(userController.verifyPasswordResetOtp));
router.get("/reset-password/:token", wrapAsync(userController.renderResetPassword));
router.post("/reset-password/:token", wrapAsync(userController.resetPassword));
router.post("/reset-password", wrapAsync(userController.resetPassword));

router.get("/logout", userController.logout);

module.exports = router;
