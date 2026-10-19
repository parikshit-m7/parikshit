const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/user");

module.exports.renderSignupForm = (req, res) => {
  res.render("users/signup.ejs");
};

module.exports.signup = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const newUser = new User({ email, username });
    const registerUser = await User.register(newUser, password);
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

module.exports.renderLogin = (req, res) => {
  res.render("users/login.ejs");
};

module.exports.login = async (req, res) => {
  req.flash("success", "Welcome back to Wanderlust!");
  const redirectUrl = res.locals.redirectUrl || "/listings";
  res.redirect(redirectUrl);
};

module.exports.renderForgotPassword = (req, res) => {
  res.render("users/forgot-password.ejs");
};

module.exports.requestPasswordReset = async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const genericMessage = "If an account with that email exists, password reset instructions will be sent shortly.";
  const user = email ? await User.findOne({ email }).select("+passwordResetToken +passwordResetExpires") : null;

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const baseUrl = (process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const resetUrl = `${baseUrl}/reset-password/${rawToken}`;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      try {
        await transporter.sendMail({
          from: process.env.MAIL_FROM,
          to: user.email,
          subject: "Reset your Wanderlust password",
          text: `We received a request to reset your Wanderlust password. This link expires in 15 minutes and can be used once: ${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18241f"><h2>Reset your Wanderlust password</h2><p>Use the button below to choose a new password. This link expires in 15 minutes and can only be used once.</p><p><a href="${resetUrl}" style="display:inline-block;background:#244b3e;color:white;padding:13px 20px;border-radius:24px;text-decoration:none">Reset password</a></p><p>If you didn't request this, you can safely ignore this email.</p></div>`,
        });
      } catch (err) {
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        console.error("Password reset email could not be sent:", err.message);
      }
    } else {
      // Never email reset links until SMTP is configured; clear token to avoid unusable links.
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      console.warn("Password reset requested but SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM are not configured.");
    }
  }

  req.flash("success", genericMessage);
  res.redirect("/forgot-password");
};

module.exports.renderResetPassword = async (req, res) => {
  const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
  const user = await User.findOne({
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select("+passwordResetToken +passwordResetExpires");

  if (!user) {
    req.flash("error", "That password reset link is invalid or expired. Please request a new one.");
    return res.redirect("/forgot-password");
  }
  res.render("users/reset-password.ejs", { token: req.params.token });
};

module.exports.resetPassword = async (req, res) => {
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const confirmPassword = typeof req.body.confirmPassword === "string" ? req.body.confirmPassword : "";
  if (password.length < 8) {
    req.flash("error", "Choose a password with at least 8 characters.");
    return res.redirect(`/reset-password/${encodeURIComponent(req.params.token)}`);
  }
  if (password !== confirmPassword) {
    req.flash("error", "The passwords do not match.");
    return res.redirect(`/reset-password/${encodeURIComponent(req.params.token)}`);
  }

  const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
  const user = await User.findOne({
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select("+passwordResetToken +passwordResetExpires");

  if (!user) {
    req.flash("error", "That password reset link is invalid or expired. Please request a new one.");
    return res.redirect("/forgot-password");
  }

  await user.setPassword(password);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
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