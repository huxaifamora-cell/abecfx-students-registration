// Preloaded with `node -r` by the server tests: replaces sheets.js with an in-memory stand-in, so the real
// server.js can run (and be called over HTTP) without Google. Three students are seeded:
//   ABECFX/26/0001  ada1@example.com    ABECFX/26/0002  ada2@example.com    ABECFX/26/0003  ada3@example.com
const path = require("path");
const { createMemoryStore, student } = require("./memory-store");

// FAKE_DOB_2 / FAKE_DOB_3 set the date of birth of students 2 and 3 (for the age-requirement tests).
const dobOver = (k) => (process.env["FAKE_DOB_" + k] ? { 13: process.env["FAKE_DOB_" + k] } : {});
const mem = createMemoryStore({ students: [student(1), student(2, dobOver(2)), student(3, dobOver(3))] });
const strings = (row) => row.map((c) => (c == null ? "" : String(c)));
let linksNow = { ...require("../../links").DEFAULTS };
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
  getSignature: async (reg) => { const r = mem.data.signatures.filter((x) => x[0] === reg).pop(); return r ? r[1] : null; },
  setSignature: async (reg, b64) => { mem.data.signatures = mem.data.signatures.filter((x) => x[0] !== reg); mem.data.signatures.push([reg, b64]); },
  invalidate: () => {},
});

const file = path.resolve(__dirname, "../../sheets.js");
require.cache[file] = { id: file, filename: file, loaded: true, exports: fake, children: [], paths: [] };
