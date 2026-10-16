// Student portal sign-in session.
// After a student proves who they are (registration number + registered email) the website hands
// back a signed session token. The portal sends it with every private request. It cannot be
// changed or used for another registration number, and it expires after 30 days.
const crypto = require("crypto");

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function mac(payload, secret) {
  return crypto.createHmac("sha256", secret).update("session." + payload).digest("base64url");
}

function sign(reg, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ r: reg, e: now + TTL_MS })).toString("base64url");
  return payload + "." + mac(payload, secret);
}

// Returns the registration number, or null when the token is wrong, tampered with or expired.
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
