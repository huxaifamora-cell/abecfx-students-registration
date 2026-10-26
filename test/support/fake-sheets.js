// Preloaded with `node -r` by the server tests: replaces sheets.js with an in-memory stand-in, so the real
// server.js can run (and be called over HTTP) without Google. Three students are seeded:
//   ABECFX/26/0001  ada1@example.com    ABECFX/26/0002  ada2@example.com    ABECFX/26/0003  ada3@example.com
const path = require("path");
const { createMemoryStore, student } = require("./memory-store");

// With FAKE_CERTIFIED=1 a fourth student, ABECFX/26/0004 (ada4@example.com), is already Certified (status date "1 Jun 2026").
const seeded = [student(1), student(2), student(3)];
if (process.env.FAKE_CERTIFIED) seeded.push(student(4, { 4: "Alaba Emmanuel Akindejoye", 9: "Certified", 10: "1 Jun 2026" }));
const mem = createMemoryStore({ students: seeded });
const strings = (row) => row.map((c) => (c == null ? "" : String(c)));
let linksNow = { ...require("../../links").DEFAULTS };
const sigs = new Map();
const fake = Object.assign(mem, {
  init: async () => {},
  readAll: async () => mem.data.students.map((r) => r.slice()),
  readCached: async () => mem.data.students.map((r) => r.slice()),
  readQuiz: async () => mem.data.quiz.map((r) => r.slice()),
  appendQuiz: async (row) => { mem.data.quiz.push(strings(row)); },
  readLinks: async () => linksNow,
  saveLinks: async (values) => { linksNow = { ...values }; },
  readVideos: async () => ({}),
  getProgressCell: async () => "",
  getPhoto: async () => null,
  getSignature: async (reg) => sigs.get(reg) || null,
  setSignature: async (reg, b64) => { sigs.set(reg, b64); },
  invalidate: () => {},
});

const file = path.resolve(__dirname, "../../sheets.js");
require.cache[file] = { id: file, filename: file, loaded: true, exports: fake, children: [], paths: [] };
