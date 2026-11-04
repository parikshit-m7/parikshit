const crypto = require("crypto");

const keyId = process.env.RAZORPAY_KEY_ID || "";
const keySecret = process.env.RAZORPAY_KEY_SECRET || "";

module.exports.isConfigured = () => Boolean(keyId && keySecret);
module.exports.keyId = keyId;

module.exports.apiRequest = async (path, { method = "GET", body } = {}) => {
  if (!module.exports.isConfigured()) throw new Error("Online payments are not configured.");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.description || "The payment service could not complete this action.");
    error.status = response.status;
    throw error;
  }
  return data;
};

module.exports.verifyCheckoutSignature = ({ orderId, paymentId, signature }) => {
  if (!module.exports.isConfigured() || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest();
  let received;
  try { received = Buffer.from(signature, "hex"); } catch (_) { return false; }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
};

module.exports.verifyWebhookSignature = (rawBody, signature) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(rawBody) || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  let received;
  try { received = Buffer.from(signature, "hex"); } catch (_) { return false; }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
};
