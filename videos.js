// Video tutorials: one YouTube video per handbook chapter (chapters 01-12), added by the editor on /admin.
// Only a real YouTube video address is accepted; the page then embeds it from youtube-nocookie.com.
const { CHAPTERS } = require("./handbook-content");

const VIDEO_CHAPTERS = CHAPTERS.filter((c) => c.id !== "00").map((c) => ({ id: c.id, title: c.title }));

// Returns the 11-character video id for the usual YouTube address shapes, or "".
function videoId(input) {
  const v = String(input == null ? "" : input).trim();
  if (!v) return "";
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v); } catch (e) { return ""; }
  if (u.protocol !== "https:") return "";
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id = "";
  if (host === "youtu.be") id = u.pathname.split("/")[1] || "";
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = u.searchParams.get("v") || "";
    else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1] || "";
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
}

// input: { "01": "https://youtu.be/...", ... } -> { values: {id: canonical url or ""}, errors: {id: message} }
function sanitize(input) {
  const src = input && typeof input === "object" ? input : {};
  const values = {};
  const errors = {};
  for (const c of VIDEO_CHAPTERS) {
    const raw = String(src[c.id] == null ? "" : src[c.id]).trim();
    if (!raw) { values[c.id] = ""; continue; }
    const id = videoId(raw);
    if (!id) errors[c.id] = "Paste a YouTube video address, e.g. https://youtu.be/abc123XYZ_0";
    else values[c.id] = "https://youtu.be/" + id;
  }
  return { values, errors };
}

function fromRows(rows) {
  const out = {};
  for (const r of rows || []) {
    const k = String((r && r[0]) || "").trim().padStart(2, "0");
    if (VIDEO_CHAPTERS.some((c) => c.id === k)) out[k] = (r[2] || "").trim();
  }
  return sanitize(out).values; // a hand-typed bad address is dropped, not shown
}

function toRows(values) {
  return VIDEO_CHAPTERS.map((c) => [c.id, c.title, values[c.id] || ""]);
}

// What a signed-in student gets: chapter id -> video id, only for chapters that have a video.
function forStudents(values) {
  const out = {};
  for (const c of VIDEO_CHAPTERS) {
    const id = videoId(values[c.id]);
    if (id) out[c.id] = id;
  }
  return out;
}

module.exports = { VIDEO_CHAPTERS, videoId, sanitize, fromRows, toRows, forStudents };
