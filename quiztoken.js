// Short-lived "quiz pass" for the in-portal quiz.
// The website signs a pass for one registration number; the quiz service (which holds the same
// QUIZ_API_KEY) checks the signature. The pass cannot be changed or reused for another number.
const crypto = require("crypto");

const TTL_MS = 4 * 60 * 60 * 1000; // a full quiz is long; 4 hours is plenty

function mac(payload, secret) {
  return crypto.createHmac("sha256", secret).update("portal." + payload).digest("base64url");
}

function sign(reg, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ r: reg, e: now + TTL_MS })).toString("base64url");
  return payload + "." + mac(payload, secret);
}

// Returns the registration number, or null when the pass is wrong, tampered with or expired.
function verify(token, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 600 || !secret) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const a = Buffer.from(mac(payload, secret));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!/^ABECFX\/\d{2}\/\d{4}$/.test(d.r) || !(d.e > now)) return null;
    return d.r;
  } catch (e) {
    return null;
  }
}

module.exports = { sign, verify, TTL_MS };
