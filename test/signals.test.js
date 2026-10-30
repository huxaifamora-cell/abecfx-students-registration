// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const signals = require("../signals");

const falling = Array.from({ length: 80 }, (_, i) => 1000 - i * 2);
const rising = Array.from({ length: 80 }, (_, i) => 1000 + i * 2);
const flat = Array.from({ length: 80 }, () => 1000);

test("Boom needs a falling market for a SELL setup, Crash a rising one for BUY", () => {
  assert.equal(signals.setupOf(falling, true), "SELL");
  assert.equal(signals.setupOf(rising, true), "");
  assert.equal(signals.setupOf(rising, false), "BUY");
  assert.equal(signals.setupOf(falling, false), "");
  assert.equal(signals.setupOf(flat, true), "");
  assert.equal(signals.setupOf(falling.slice(0, 10), true), "", "too few candles: no setup");
});

test("trend: direction from the Bollinger middle line, strength from the EMA distance", () => {
  assert.match(signals.trendOf(rising), /Uptrend$/);
  assert.match(signals.trendOf(falling), /Downtrend$/);
  assert.equal(signals.trendOf(flat), "Sideways");
  assert.equal(signals.trendOf([1, 2]), "No Data");
});

test("the alert text has no lot size or margin, and shows a reminder only after the first alert", () => {
  const m = { name: "Boom 1000" };
  const first = signals.alertText(m, "M30", "SELL", "Weak Downtrend", "Strong Uptrend", true, 0);
  assert.match(first, /BOOM1000 SELL SETUP CONFIRMED \| TF: M30/);
  assert.match(first, /H4 trend → Weak Downtrend/);
  assert.doesNotMatch(first, /REMINDER|Margin|Lot/);
  assert.match(signals.alertText(m, "H1", "SELL", "a", "b", false, 1), /valid for the past 1 minute$/);
  assert.match(signals.alertText(m, "H1", "SELL", "a", "b", false, 5), /past 5 minutes$/);
});

// A fake Deriv: lists two markets, answers every candle request with the series given for that market.
function fakeDeriv(series) {
  const sockets = [];
  class FakeWS extends EventEmitter {
    constructor() { super(); this.sent = []; sockets.push(this); setImmediate(() => this.emit("open")); }
    send(text) {
      const r = JSON.parse(text);
      this.sent.push(r);
      if (r.active_symbols) {
        return setImmediate(() => this.emit("message", JSON.stringify({ msg_type: "active_symbols", req_id: r.req_id, active_symbols: [{ symbol: "BOOM1000" }, { symbol: "CRASH1000" }] })));
      }
      if (r.ticks_history) {
        const closes = series[r.ticks_history];
        const candles = closes.map((c, i) => ({ epoch: 1000 + i * r.granularity, close: String(c) }));
        setImmediate(() => this.emit("message", JSON.stringify({ msg_type: "candles", req_id: r.req_id, candles })));
      }
    }
    close() { this.emit("close"); }
  }
  return { FakeWS, sockets };
}

test("watches only the markets Deriv has, alerts once, then reminds, and sends it to Telegram", async () => {
  const { FakeWS } = fakeDeriv({ BOOM1000: falling, CRASH1000: flat });
  const clock = { t: 5_000_000 };
  const posts = [];
  const mon = signals.create({
    enabled: true, WebSocketImpl: FakeWS, now: () => clock.t, log: () => {}, reminderMinutes: 2,
    telegramToken: "TOKEN", telegramChat: "-100", fetchImpl: async (url, o) => { posts.push({ url, body: o.body }); return { ok: true }; },
  });
  mon.start();
  await new Promise((r) => setTimeout(r, 2500)); // the requests are spaced out a little
  let snap = mon.snapshot();
  assert.equal(snap.connected, true);
  assert.deepEqual(snap.watching, ["Boom 1000", "Crash 1000"]);
  assert.ok(snap.unavailable.includes("Boom 900") && snap.unavailable.includes("Crash 150"));

  mon.check();
  snap = mon.snapshot();
  assert.equal(snap.recent.length, 2, "M30 and H1 both alert for Boom 1000 the first time");
  assert.deepEqual(snap.active.map((a) => a.market + " " + a.type + " " + a.tf).sort(), ["Boom 1000 SELL H1", "Boom 1000 SELL M30"]);
  assert.ok(snap.recent.every((e) => e.first === true));
  assert.equal(posts.length, 2);
  assert.match(new URLSearchParams(posts[0].body).get("text"), /BOOM1000 SELL SETUP CONFIRMED/);
  assert.equal(new URLSearchParams(posts[0].body).get("chat_id"), "-100");

  mon.check(); // nothing new inside the 2 minute window
  assert.equal(mon.snapshot().recent.length, 2);

  clock.t += 3 * 60 * 1000;
  // the prices are now stale (no update for 3 minutes): no alert from old prices
  mon.check();
  assert.equal(mon.snapshot().recent.length, 2, "stale prices raise no alert");
  mon.stop();
});

test("a Deriv error saying a market does not exist moves it to the unavailable list", async () => {
  const { FakeWS, sockets } = fakeDeriv({ BOOM1000: flat, CRASH1000: flat });
  const mon = signals.create({ enabled: true, WebSocketImpl: FakeWS, now: () => 1, log: () => {} });
  mon.start();
  await new Promise((r) => setTimeout(r, 600));
  const asked = sockets[0].sent.find((x) => x.ticks_history === "BOOM1000");
  assert.ok(asked, "the market was asked for");
  mon._onMessage(JSON.stringify({ msg_type: "ticks_history", req_id: asked.req_id, error: { code: "InvalidSymbol", message: "nope" } }));
  const snap = mon.snapshot();
  assert.ok(snap.unavailable.includes("Boom 1000"));
  assert.ok(!snap.watching.includes("Boom 1000"));
  mon.stop();
});

test("the signals page is for Alumni members only, and says so when it is switched off", async () => {
  const { boot } = require("./support/boot-server");
  const s = await boot({ FAKE_ALUMNI: "1" });
  try {
    const alumni = await s.studentToken("ABECFX/26/0005");
    const student = await s.studentToken("ABECFX/26/0001");
    assert.equal((await s.call("GET", "/api/portal/signals")).status, 401, "sign in first");
    assert.equal((await s.call("GET", "/api/portal/signals", { token: student })).status, 403, "a student without the Alumni card");
    const r = await s.call("GET", "/api/portal/signals", { token: alumni });
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, false, "off unless SIGNALS=on");
    assert.deepEqual(r.body.active, []);
  } finally {
    s.stop();
  }
});
