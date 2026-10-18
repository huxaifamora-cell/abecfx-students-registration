// Preloaded with `node -r` by the server tests: replaces sheets.js with an in-memory stand-in, so the real
// server.js can run (and be called over HTTP) without Google. Three students are seeded:
//   ABECFX/26/0001  ada1@example.com    ABECFX/26/0002  ada2@example.com    ABECFX/26/0003  ada3@example.com
const path = require("path");
const { createMemoryStore, student } = require("./memory-store");

const mem = createMemoryStore({ students: [student(1), student(2), student(3)] });
const strings = (row) => row.map((c) => (c == null ? "" : String(c)));
const fake = Object.assign(mem, {
  init: async () => {},
  readAll: async () => mem.data.students.map((r) => r.slice()),
  readCached: async () => mem.data.students.map((r) => r.slice()),
  readQuiz: async () => mem.data.quiz.map((r) => r.slice()),
  appendQuiz: async (row) => { mem.data.quiz.push(strings(row)); },
  readLinks: async () => require("../../links").DEFAULTS,
  readVideos: async () => ({}),
  getProgressCell: async () => "",
  getPhoto: async () => null,
  invalidate: () => {},
});

const file = path.resolve(__dirname, "../../sheets.js");
require.cache[file] = { id: file, filename: file, loaded: true, exports: fake, children: [], paths: [] };
