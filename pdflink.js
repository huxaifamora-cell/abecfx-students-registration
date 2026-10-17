// Short-lived download link for the handbook PDF.
// The PDF is not in the public folder. A signed-in student asks for a link, the website signs one that
// works for 10 minutes, and /handbook.pdf only serves the file when the link's signature is valid.
const crypto = require("crypto");

const TTL_MS = 10 * 60 * 1000;

function mac(payload, secret) {
  return crypto.createHmac("sha256", secret).update("handbookpdf." + payload).digest("base64url");
}

function sign(reg, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ r: reg, e: now + TTL_MS })).toString("base64url");
  return payload + "." + mac(payload, secret);
}

// Returns the registration number, or null when the link is wrong, changed or expired.
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
