const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/user");

function flashFieldError(req, field, message, value) {
  const error = { field, message };
  if (typeof value === "string" && !["password", "confirmPassword", "otp"].includes(field)) error.value = value;
  req.flash("fieldError", JSON.stringify(error));
}

async function postForm(url, values) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Google sign-in request failed.");
  return response.json();
}

module.exports.startGoogleLogin = (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    req.flash("error", "Google sign-in setup is not finished yet. You can use your email or mobile number for now.");
    return res.redirect("/login");
  }

  const state = crypto.randomBytes(32).toString("hex");
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const intent = req.query.intent === "signup" ? "signup" : "login";
  req.session.googleOAuth = {
    state,
    codeVerifier,
    intent,
    createdAt: Date.now(),
  };

  const redirectUri = process.env.GOOGLE_REDIRECT_URI
    || `${req.protocol}://${req.get("host")}/auth/google/callback`;
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  res.redirect(authorizationUrl.toString());
};

module.exports.finishGoogleLogin = async (req, res) => {
  const oauth = req.session.googleOAuth;
  delete req.session.googleOAuth;
  const { code, state, error } = req.query;
  const validState = typeof state === "string"
    && typeof oauth?.state === "string"
    && state.length === oauth.state.length
    && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(oauth.state));

  if (error || !code || !validState || !oauth?.codeVerifier
    || Date.now() - oauth.createdAt > 10 * 60 * 1000) {
    req.flash("error", "Google sign-in was cancelled or expired. Please try again.");
    return res.redirect("/login");
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI
      || `${req.protocol}://${req.get("host")}/auth/google/callback`;
    if (!clientId || !clientSecret) throw new Error("Google sign-in is not configured.");

    const tokens = await postForm("https://oauth2.googleapis.com/token", {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: oauth.codeVerifier,
    });
    if (!tokens.access_token) throw new Error("Google did not return an access token.");

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!profileResponse.ok) throw new Error("Could not verify the Google account.");
    const profile = await profileResponse.json();
    const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
    if (!profile.sub || !email || profile.email_verified !== true) {
      throw new Error("Google account email is not verified.");
    }

    let user = await User.findOne({ googleId: profile.sub });
    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        if (user.googleId && user.googleId !== profile.sub) {
          throw new Error("This email is linked to a different Google account.");
        }
        user.googleId = profile.sub;
        await user.save();
      } else if (oauth.intent === "signup") {
        req.session.pendingGoogleSignup = {
          googleId: profile.sub,
          email,
          createdAt: Date.now(),
        };
        return res.redirect("/complete-google-signup");
      } else {
        req.flash("error", "No Wanderlust account is linked to this Google account. Create an account first.");
        return res.redirect("/login");
      }
    }

    const redirectUrl = req.session.redirectUrl || "/listings";
    delete req.session.redirectUrl;
    await new Promise((resolve, reject) => {
      req.login(user, (loginError) => loginError ? reject(loginError) : resolve());
    });
    req.flash("success", "Signed in with Google. Welcome to Wanderlust!");
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("Google sign-in failed:", err.message);
    req.flash("error", "We couldn't sign you in with Google. Please try again or use your email/mobile and password.");
    res.redirect("/login");
  }
};

module.exports.renderCompleteGoogleSignup = (req, res) => {
  const pending = req.session.pendingGoogleSignup;
  if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
    delete req.session.pendingGoogleSignup;
    req.flash("error", "Google signup expired. Please start again.");
    return res.redirect("/signup");
  }
  res.render("users/complete-google-signup.ejs", { email: pending.email, username: "" });
};

module.exports.completeGoogleSignup = async (req, res, next) => {
  const pending = req.session.pendingGoogleSignup;
  if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
    delete req.session.pendingGoogleSignup;
    req.flash("error", "Google signup expired. Please start again.");
    return res.redirect("/signup");
  }

  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!username || username.length > 40) {
    flashFieldError(req, "username", "Choose a username up to 40 characters long.", username);
    return res.redirect("/complete-google-signup");
  }
  if (password.length < 8) {
    flashFieldError(req, "password", "Use at least 8 characters for your password.");
    return res.redirect("/complete-google-signup");
  }
  if (await User.findOne({ username })) {
    flashFieldError(req, "username", "That username is already taken.", username);
    return res.redirect("/complete-google-signup");
  }
  if (await User.findOne({ $or: [{ email: pending.email }, { googleId: pending.googleId }] })) {
    delete req.session.pendingGoogleSignup;
    req.flash("error", "An account with these details already exists. Please log in.");
    return res.redirect("/login");
  }

  try {
    const user = await User.register(new User({
      username,
      email: pending.email,
      googleId: pending.googleId,
    }), password);
    delete req.session.pendingGoogleSignup;
    const redirectUrl = req.session.redirectUrl || "/listings";
    delete req.session.redirectUrl;
    req.login(user, (err) => {
      if (err) return next(err);
      req.flash("success", "Your Wanderlust account is ready. Welcome!");
      res.redirect(redirectUrl);
    });
  } catch (err) {
    if (err.name === "UserExistsError") {
      flashFieldError(req, "username", "That username is already taken.", username);
      return res.redirect("/complete-google-signup");
    }
    next(err);
  }
};

module.exports.renderSignupForm = (req, res) => res.render("users/signup.ejs");

function getTwilioVerifyConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  return accountSid && authToken && serviceSid ? { accountSid, authToken, serviceSid } : null;
}

async function callTwilioVerify(endpoint, values) {
  const config = getTwilioVerifyConfig();
  if (!config) throw new Error("Phone verification is not configured.");
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${config.serviceSid}/${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(values),
      signal: AbortSignal.timeout(15000),
    }
  );
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.message || "Phone verification request failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function normalizePhoneNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[+0-9\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

module.exports.sendPhoneSignupOtp = async (req, res) => {
  try {
    const rawPhone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : "";

    if (!phone) {
      flashFieldError(req, "phone", "Enter a valid mobile number, including the country code.", rawPhone);
      return res.redirect("/signup");
    }
    if (phone && await User.findOne({ phone })) {
      flashFieldError(req, "phone", "An account already uses this number. Please log in.", rawPhone);
      return res.redirect("/signup");
    }

    if (!getTwilioVerifyConfig()) {
      flashFieldError(req, "phone", "Phone verification is temporarily unavailable. Please try Google signup.", rawPhone);
      return res.redirect("/signup");
    }

    await callTwilioVerify("Verifications", { To: phone, Channel: "sms" });
    req.session.pendingPhoneSignup = {
      phone,
      createdAt: Date.now(),
      otpSentAt: Date.now(),
    };
    res.redirect("/verify-phone");
  } catch (e) {
    console.error("Phone signup OTP could not be sent:", e.message);
    flashFieldError(req, "phone", "We couldn't send a code to this number. Try Google signup instead.", req.body.phone || "");
    res.redirect("/signup");
  }
};

module.exports.resendPhoneSignupOtp = async (req, res) => {
  const pending = req.session.pendingPhoneSignup;
  if (!pending || pending.verified || Date.now() - pending.createdAt > 10 * 60 * 1000) {
    delete req.session.pendingPhoneSignup;
    flashFieldError(req, "phone", "Start signup again to request a fresh phone verification code.");
    return res.redirect("/signup");
  }
  if (Date.now() - pending.otpSentAt < 30 * 1000) {
    flashFieldError(req, "otp", "Please wait 30 seconds before requesting another code.");
    return res.redirect("/verify-phone");
  }
  try {
    await callTwilioVerify("Verifications", { To: pending.phone, Channel: "sms" });
    pending.otpSentAt = Date.now();
    req.flash("success", "A new verification code has been sent.");
    res.redirect("/verify-phone");
  } catch (e) {
    console.error("Phone signup OTP resend failed:", e.message);
    flashFieldError(req, "otp", "We couldn't send another code. Please try again shortly.");
    res.redirect("/verify-phone");
  }
};

module.exports.renderPhoneSignupOtp = (req, res) => {
  const pending = req.session.pendingPhoneSignup;
  if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
    delete req.session.pendingPhoneSignup;
    flashFieldError(req, "phone", "Start signup again to request a fresh phone verification code.");
    return res.redirect("/signup");
  }
  res.render("users/verify-phone.ejs", { phone: pending.phone });
};

module.exports.verifyPhoneSignupOtp = async (req, res) => {
  const pending = req.session.pendingPhoneSignup;
  const code = typeof req.body.otp === "string" ? req.body.otp.trim() : "";
  if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
    delete req.session.pendingPhoneSignup;
    flashFieldError(req, "phone", "That verification code expired. Start signup again.");
    return res.redirect("/signup");
  }
  if (!/^\d{6}$/.test(code)) {
    flashFieldError(req, "otp", "Enter the 6-digit code sent to your mobile number.");
    return res.redirect("/verify-phone");
  }

  try {
    const result = await callTwilioVerify("VerificationCheck", { To: pending.phone, Code: code });
    if (result.status !== "approved") {
      flashFieldError(req, "otp", "That code is incorrect or expired. Please try again.");
      return res.redirect("/verify-phone");
    }
    pending.verified = true;
    pending.verifiedAt = Date.now();
    res.redirect("/complete-phone-signup");
  } catch (e) {
    console.error("Phone signup OTP verification failed:", e.message);
    flashFieldError(req, "otp", "We couldn't verify that code. Please try again.");
    res.redirect("/verify-phone");
  }
};

module.exports.renderCompletePhoneSignup = (req, res) => {
  const pending = req.session.pendingPhoneSignup;
  if (!pending?.verified || Date.now() - pending.verifiedAt > 10 * 60 * 1000) {
    delete req.session.pendingPhoneSignup;
    flashFieldError(req, "phone", "Verify your mobile number before finishing signup.");
    return res.redirect("/signup");
  }
  res.render("users/complete-phone-signup.ejs", { username: pending.username || "", phone: pending.phone });
};

module.exports.completePhoneSignup = async (req, res, next) => {
  const pending = req.session.pendingPhoneSignup;
  if (!pending?.verified || Date.now() - pending.verifiedAt > 10 * 60 * 1000) {
    delete req.session.pendingPhoneSignup;
    flashFieldError(req, "phone", "Your verification expired. Please start signup again.");
    return res.redirect("/signup");
  }
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!username) {
    flashFieldError(req, "username", "Choose a username to finish creating your account.");
    return res.redirect("/complete-phone-signup");
  }
  if (username.length > 40) {
    pending.username = username.slice(0, 40);
    flashFieldError(req, "username", "Your username must be 40 characters or fewer.", username);
    return res.redirect("/complete-phone-signup");
  }
  if (password.length < 8) {
    pending.username = username;
    flashFieldError(req, "password", "Use at least 8 characters for your password.");
    return res.redirect("/complete-phone-signup");
  }
  if (await User.findOne({ username })) {
    pending.username = username;
    flashFieldError(req, "username", "That username is already taken.", username);
    return res.redirect("/complete-phone-signup");
  }
  if (await User.findOne({ phone: pending.phone })) {
    delete req.session.pendingPhoneSignup;
    flashFieldError(req, "identifier", "An account already uses this number. Please log in.", pending.phone);
    return res.redirect("/login");
  }

  try {
    const registerUser = await User.register(new User({
      username,
      phone: pending.phone,
    }), password);
    delete req.session.pendingPhoneSignup;
    req.login(registerUser, (err) => {
      if (err) return next(err);
      req.flash("success", "Mobile number verified. Welcome to Wanderlust!");
      res.redirect("/listings");
    });
  } catch (e) {
    if (e.name === "UserExistsError") {
      flashFieldError(req, "username", "That username is already taken.", username);
    } else {
      req.flash("error", e.message);
    }
    res.redirect("/complete-phone-signup");
  }
};
module.exports.renderLogin = (req, res) => res.render("users/login.ejs");

module.exports.prepareLogin = async (req, res, next) => {
  const identifier = typeof req.body.identifier === "string"
    ? req.body.identifier.trim()
    : (typeof req.body.username === "string" ? req.body.username.trim() : "");
  if (!identifier) {
    flashFieldError(req, "identifier", "Enter your username or mobile number.");
    return res.redirect("/login");
  }

  const matches = [{ username: identifier }];
  const phone = normalizePhoneNumber(identifier);
  if (phone) matches.push({ phone });

  const user = await User.findOne({ $or: matches });
  if (!user) {
    flashFieldError(req, "identifier", "We couldn't find an account with those details.", identifier);
    return res.redirect("/login");
  }
  req.body.username = user.username;
  next();
};

module.exports.login = async (req, res) => {
  req.flash("success", "Welcome back to Wanderlust!");
  res.redirect(res.locals.redirectUrl || "/listings");
};
module.exports.renderForgotPassword = (req, res) => res.render("users/forgot-password.ejs");

module.exports.requestPasswordReset = async (req, res) => {
  const identifier = typeof req.body.identifier === "string"
    ? req.body.identifier.trim()
    : (typeof req.body.email === "string" ? req.body.email.trim() : "");
  if (!identifier) {
    flashFieldError(req, "identifier", "Enter your username or mobile number.");
    return res.redirect("/forgot-password");
  }

  const matches = [{ username: identifier }];
  if (/^\S+@\S+\.\S+$/.test(identifier)) matches.push({ email: identifier.toLowerCase() });
  const phone = normalizePhoneNumber(identifier);
  if (phone) matches.push({ phone });
  const user = await User.findOne({ $or: matches }).select("+passwordResetToken +passwordResetExpires +passwordResetAttempts");
  if (!user) {
    req.flash("success", "If an account with those details exists, an OTP will be sent shortly.");
    return res.redirect("/forgot-password");
  }
  if (!user.email) {
    flashFieldError(req, "identifier", "This account has no recovery email. Please contact support to reset your password.", identifier);
    return res.redirect("/forgot-password");
  }

  // Prefer an HTTPS email API because Render Free blocks outbound SMTP ports.
  const resendApiKey = process.env.RESEND_API_KEY;
  const mailFrom = process.env.MAIL_FROM;
  if (!resendApiKey || !mailFrom) {
    console.error("Password reset email is not configured. Set RESEND_API_KEY and MAIL_FROM in Render.");
    flashFieldError(req, "identifier", "Email verification is temporarily unavailable. Please try again later.", identifier);
    return res.redirect("/forgot-password");
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  user.passwordResetToken = crypto.createHash("sha256").update(otp).digest("hex");
  user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.passwordResetAttempts = 0;
  await user.save();

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [user.email],
        subject: "Your Wanderlust password reset OTP",
        text: `Your Wanderlust password reset code is ${otp}. It expires in 10 minutes and can be used only once. If you did not request this, ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#18241f"><h2>Reset your Wanderlust password</h2><p>Your one-time code expires in 10 minutes.</p><div style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f3f6f4;padding:18px;text-align:center;border-radius:12px">${otp}</div><p>If you did not request this code, ignore this email.</p></div>`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Email API returned HTTP ${response.status}: ${details.slice(0, 500)}`);
    }

    req.session.passwordResetEmail = user.email;
    delete req.session.passwordResetUserId;
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetAttempts = 0;
    await user.save();
    console.error("Password reset OTP could not be sent:", err.message);
    flashFieldError(req, "identifier", "We couldn't send an OTP to this account's recovery email. Please try again.", identifier);
    return res.redirect("/forgot-password");
  }

  req.flash("success", "An OTP has been sent to your email address.");
  res.redirect("/verify-otp");
};

module.exports.renderVerifyOtp = (req, res) => {
  if (!req.session.passwordResetEmail) {
    flashFieldError(req, "identifier", "Enter your username or mobile number first to request an OTP.");
    return res.redirect("/forgot-password");
  }
  res.render("users/verify-otp.ejs", { email: req.session.passwordResetEmail });
};

module.exports.verifyPasswordResetOtp = async (req, res) => {
  const email = req.session.passwordResetEmail;
  const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";
  if (!email || !/^\d{6}$/.test(otp)) {
    flashFieldError(req, "otp", "Enter the 6-digit OTP sent to your email.");
    return res.redirect("/verify-otp");
  }
  const user = await User.findOne({ email }).select("+passwordResetToken +passwordResetExpires +passwordResetAttempts");
  if (!user || !user.passwordResetToken || !user.passwordResetExpires || user.passwordResetExpires <= new Date()) {
    const expiredEmail = email;
    delete req.session.passwordResetEmail;
    flashFieldError(req, "identifier", "Your OTP has expired. Request a new one.", expiredEmail);
    return res.redirect("/forgot-password");
  }
  if ((user.passwordResetAttempts || 0) >= 5) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetAttempts = 0;
    await user.save();
    const expiredEmail = email;
    delete req.session.passwordResetEmail;
    flashFieldError(req, "identifier", "Too many incorrect attempts. Request a new OTP.", expiredEmail);
    return res.redirect("/forgot-password");
  }
  const submittedHash = crypto.createHash("sha256").update(otp).digest("hex");
  const matches = crypto.timingSafeEqual(Buffer.from(submittedHash, "hex"), Buffer.from(user.passwordResetToken, "hex"));
  if (!matches) {
    user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1;
    await user.save();
    flashFieldError(req, "otp", "That OTP is incorrect. Please try again.");
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
    flashFieldError(req, "identifier", "That reset link is invalid or expired. Enter your username or mobile number to request a new code.");
    return res.redirect("/forgot-password");
  }
  res.render("users/reset-password.ejs", { token: req.params.token });
};

module.exports.renderResetPasswordFromOtp = async (req, res) => {
  const user = req.session.passwordResetUserId
    ? await User.findById(req.session.passwordResetUserId)
    : null;
  if (!user) {
    delete req.session.passwordResetUserId;
    flashFieldError(req, "identifier", "Verify a new OTP before choosing a password.");
    return res.redirect("/forgot-password");
  }
  res.render("users/reset-password.ejs", { otpVerified: true });
};

module.exports.resetPassword = async (req, res) => {
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const confirmPassword = typeof req.body.confirmPassword === "string" ? req.body.confirmPassword : "";
  const backUrl = req.params.token ? `/reset-password/${encodeURIComponent(req.params.token)}` : "/reset-password";
  if (password.length < 8) {
    flashFieldError(req, "password", "Use at least 8 characters for your password.");
    return res.redirect(backUrl);
  }
  if (password !== confirmPassword) {
    flashFieldError(req, "confirmPassword", "The passwords do not match.");
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
    flashFieldError(req, "identifier", "Please verify a valid OTP before choosing a new password.");
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
