const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/user");

module.exports.renderSignupForm = (req, res) => res.render("users/signup.ejs");

module.exports.signup = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const registerUser = await User.register(new User({ email, username }), password);
    req.login(registerUser, (err) => {
      if (err) return next(err);
      req.flash("success", "Welcome to Wanderlust!");
      res.redirect("/listings");
    });
  } catch (e) {
    req.flash("error", e.message);
    res.redirect("/signup");
  }
};

module.exports.renderLogin = (req, res) => res.render("users/login.ejs");
module.exports.login = async (req, res) => {
  req.flash("success", "Welcome back to Wanderlust!");
  res.redirect(res.locals.redirectUrl || "/listings");
};
module.exports.renderForgotPassword = (req, res) => res.render("users/forgot-password.ejs");

module.exports.requestPasswordReset = async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.MAIL_FROM) {
    console.error("Password reset email is not configured. Set SMTP_USER, SMTP_PASS, and MAIL_FROM.");
    req.flash("error", "Email OTP is not configured yet. The site administrator must add Gmail SMTP settings.");
    return res.redirect("/forgot-password");
  }

  const user = email ? await User.findOne({ email }).select("+passwordResetToken +passwordResetExpires +passwordResetAttempts") : null;
  if (!user) {
    req.flash("success", "If an account with that email exists, an OTP will be sent shortly.");
    return res.redirect("/forgot-password");
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  user.passwordResetToken = crypto.createHash("sha256").update(otp).digest("hex");
  user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.passwordResetAttempts = 0;
  await user.save();

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: user.email,
      subject: "Your Wanderlust password reset OTP",
      text: `Your Wanderlust password reset code is ${otp}. It expires in 10 minutes and can be used only once. If you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18241f"><h2>Reset your Wanderlust password</h2><p>Your one-time code expires in 10 minutes.</p><div style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f3f6f4;padding:18px;text-align:center;border-radius:12px">${otp}</div><p>If you did not request this code, ignore this email.</p></div>`,
    });
    req.session.passwordResetEmail = user.email;
    delete req.session.passwordResetUserId;
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetAttempts = 0;
    await user.save();
    console.error("Password reset OTP could not be sent:", err.message);
    req.flash("error", "We couldn't send the OTP. Please check the email settings and try again.");
    return res.redirect("/forgot-password");
  }
  req.flash("success", "An OTP has been sent to your email address.");
  res.redirect("/verify-otp");
};

module.exports.renderVerifyOtp = (req, res) => {
  if (!req.session.passwordResetEmail) {
    req.flash("error", "Enter your account email first to request an OTP.");
    return res.redirect("/forgot-password");
  }
  res.render("users/verify-otp.ejs", { email: req.session.passwordResetEmail });
};

module.exports.verifyPasswordResetOtp = async (req, res) => {
  const email = req.session.passwordResetEmail;
  const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";
  if (!email || !/^\d{6}$/.test(otp)) {
    req.flash("error", "Enter the 6-digit OTP sent to your email.");
    return res.redirect("/verify-otp");
  }
  const user = await User.findOne({ email }).select("+passwordResetToken +passwordResetExpires +passwordResetAttempts");
  if (!user || !user.passwordResetToken || !user.passwordResetExpires || user.passwordResetExpires <= new Date()) {
    delete req.session.passwordResetEmail;
    req.flash("error", "Your OTP has expired. Please request a new one.");
    return res.redirect("/forgot-password");
  }
  if ((user.passwordResetAttempts || 0) >= 5) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetAttempts = 0;
    await user.save();
    delete req.session.passwordResetEmail;
    req.flash("error", "Too many incorrect attempts. Please request a new OTP.");
    return res.redirect("/forgot-password");
  }
  const submittedHash = crypto.createHash("sha256").update(otp).digest("hex");
  const matches = crypto.timingSafeEqual(Buffer.from(submittedHash, "hex"), Buffer.from(user.passwordResetToken, "hex"));
  if (!matches) {
    user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1;
    await user.save();
    req.flash("error", "That OTP is incorrect. Please try again.");
    return res.redirect("/verify-otp");
  }
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordResetAttempts = 0;
  await user.save();
  req.session.passwordResetUserId = String(user._id);
  delete req.session.passwordResetEmail;
  res.render("users/reset-password.ejs", { otpVerified: true });
};

module.exports.renderResetPassword = async (req, res) => {
  const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
  const user = await User.findOne({ passwordResetToken: tokenHash, passwordResetExpires: { $gt: new Date() } }).select("+passwordResetToken +passwordResetExpires");
  if (!user) {
    req.flash("error", "That password reset link is invalid or expired. Please request a new OTP.");
    return res.redirect("/forgot-password");
  }
  res.render("users/reset-password.ejs", { token: req.params.token });
};

module.exports.resetPassword = async (req, res) => {
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const confirmPassword = typeof req.body.confirmPassword === "string" ? req.body.confirmPassword : "";
  const backUrl = req.params.token ? `/reset-password/${encodeURIComponent(req.params.token)}` : "/forgot-password";
  if (password.length < 8) {
    req.flash("error", "Choose a password with at least 8 characters.");
    return res.redirect(backUrl);
  }
  if (password !== confirmPassword) {
    req.flash("error", "The passwords do not match.");
    return res.redirect(backUrl);
  }

  let user;
  if (req.params.token) {
    const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
    user = await User.findOne({ passwordResetToken: tokenHash, passwordResetExpires: { $gt: new Date() } }).select("+passwordResetToken +passwordResetExpires");
  } else if (req.session.passwordResetUserId) {
    user = await User.findById(req.session.passwordResetUserId);
  }
  if (!user) {
    delete req.session.passwordResetUserId;
    req.flash("error", "Please verify a valid OTP before choosing a new password.");
    return res.redirect("/forgot-password");
  }
  await user.setPassword(password);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordResetAttempts = 0;
  await user.save();
  delete req.session.passwordResetUserId;
  delete req.session.passwordResetEmail;
  req.flash("success", "Your password has been updated. Please log in.");
  res.redirect("/login");
};

module.exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash("success", "You are logged out!");
    res.redirect("/listings");
  });
};
