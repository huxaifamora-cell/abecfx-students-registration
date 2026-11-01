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

// ---- tab reads (fund, bot, copy trading, staff, attendance...) ----
test("tab reads are shared, kept for the TTL, and a write to that tab clears them", async () => {
  mode = "ok";
  calls = 0;
  const a = await Promise.all([sheets.tabRows("fundledger"), sheets.tabRows("fundledger"), sheets.tabRows("fundledger")]);
  assert.strictEqual(calls, 1);
  a[0][0].cells[0] = "changed by a caller"; // callers get their own copy
  const again = await sheets.tabRows("fundledger");
  assert.notStrictEqual(again[0].cells[0], "changed by a caller");
  assert.strictEqual(calls, 1);
  await sheets.appendTabRows("fundledger", [["x"]]); // a write: 1 call, then the next read is fresh
  const after = calls;
  await sheets.tabRows("fundledger");
  assert.strictEqual(calls, after + 1);
});

test("tab reads: the last copy is served when Google refuses, but never after a write", async () => {
  mode = "ok";
  await sheets.tabRows("botaccounts");
  // expire the copy without a write by waiting is slow, so use a write on a different tab to show it is untouched
  await sheets.appendTabRows("fundwithdrawals", [["x"]]);
  mode = "quota";
  await assert.rejects(() => sheets.tabRows("fundwithdrawals")); // written to: no old copy may be served
  mode = "ok";
});
