const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/user");

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
  req.session.googleOAuth = {
    state,
    codeVerifier,
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
      } else {
        user = await User.register(
          new User({ username: email, email, googleId: profile.sub }),
          crypto.randomBytes(32).toString("hex")
        );
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

module.exports.renderSignupForm = (req, res) => res.render("users/signup.ejs");

function normalizePhoneNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[+0-9\\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

module.exports.signup = async (req, res, next) => {
  try {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const rawPhone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : "";

    if (!email && !phone) {
      req.flash("error", "Enter an email address or mobile number to create your account.");
      return res.redirect("/signup");
    }
    if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      req.flash("error", "Enter a valid email address.");
      return res.redirect("/signup");
    }
    if (rawPhone && !phone) {
      req.flash("error", "Enter a valid mobile number with country code.");
      return res.redirect("/signup");
    }
    if (password.length < 8) {
      req.flash("error", "Choose a password with at least 8 characters.");
      return res.redirect("/signup");
    }

    const accountMatch = [];
    if (email) accountMatch.push({ email });
    if (phone) accountMatch.push({ phone });
    if (await User.findOne({ $or: accountMatch })) {
      req.flash("error", "An account already uses that email or mobile number. Please log in.");
      return res.redirect("/signup");
    }

    const registerUser = await User.register(
      new User({
        username: username || email || phone,
        email: email || undefined,
        phone: phone || undefined,
      }),
      password
    );
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

module.exports.prepareLogin = async (req, res, next) => {
  const identifier = typeof req.body.identifier === "string"
    ? req.body.identifier.trim()
    : (typeof req.body.username === "string" ? req.body.username.trim() : "");
  if (!identifier) {
    req.flash("error", "Enter your username, email, or mobile number.");
    return res.redirect("/login");
  }

  const matches = [{ username: identifier }];
  if (identifier.includes("@")) matches.push({ email: identifier.toLowerCase() });
  const phone = normalizePhoneNumber(identifier);
  if (phone) matches.push({ phone });

  const user = await User.findOne({ $or: matches });
  if (!user) {
    req.flash("error", "We couldn't find an account with those details.");
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
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";

  // Prefer an HTTPS email API because Render Free blocks outbound SMTP ports.
  const resendApiKey = process.env.RESEND_API_KEY;
  const mailFrom = process.env.MAIL_FROM;
  if (!resendApiKey || !mailFrom) {
    console.error("Password reset email is not configured. Set RESEND_API_KEY and MAIL_FROM in Render.");
    req.flash("error", "Email OTP is not configured yet. The site administrator must configure the email API.");
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
    req.flash("error", "We couldn't send the OTP. Please check the email API settings and sender verification.");
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
