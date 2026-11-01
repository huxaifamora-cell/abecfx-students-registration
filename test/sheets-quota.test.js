// Google's per-minute read quota: reads are shared, floored, retried and fall back to the last good copy.
const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

let calls = 0;
let mode = "ok"; // ok | quota | quota-once
const realLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === "google-auth-library") {
    return {
      JWT: class {
        async request() {
          calls++;
          if (mode === "quota" || (mode === "quota-once" && calls === 1)) {
            const e = new Error("Quota exceeded for quota metric 'Read requests'");
            e.response = { status: 429 };
            throw e;
          }
          return { data: { values: [["ABECFX/26/0001", "", "", "", "Ada"]] } };
        }
      },
    };
  }
  return realLoad.call(this, req, ...rest);
};
process.env.GOOGLE_SHEET_ID = "x";
process.env.GOOGLE_CLIENT_EMAIL = "a@b.c";
process.env.GOOGLE_PRIVATE_KEY = "k";
const sheets = require("../sheets");

test("ten simultaneous stale reads make one Google call, and a 5s ask is served from the 20s floor", async () => {
  calls = 0;
  await Promise.all(Array.from({ length: 10 }, () => sheets.readCached(5000)));
  assert.strictEqual(calls, 1);
  await sheets.readCached(5000);
  assert.strictEqual(calls, 1);
});

test("a write (invalidate) forces a fresh read", async () => {
  calls = 0;
  sheets.invalidate("students");
  await sheets.readCached(5000);
  assert.strictEqual(calls, 1);
});

test("when Google refuses, the last good copy is served instead of an error", async () => {
  sheets.invalidate("students");
  mode = "quota";
  calls = 0;
  const rows = await sheets.readCached(5000);
  assert.strictEqual(rows[0][4], "Ada");
  mode = "ok";
});

test("a single 429 is retried and succeeds", async () => {
  sheets.invalidate("quiz");
  mode = "quota-once";
  calls = 0;
  const rows = await sheets.readQuiz();
  assert.strictEqual(calls, 2);
  assert.ok(rows.length >= 1);
  mode = "ok";
});
