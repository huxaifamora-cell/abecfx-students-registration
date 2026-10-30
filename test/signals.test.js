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
function fakeDeriv(series, listed, refuseSubscribe) {
  const sockets = [];
  class FakeWS extends EventEmitter {
    constructor() { super(); this.sent = []; sockets.push(this); setImmediate(() => this.emit("open")); }
    send(text) {
      const r = JSON.parse(text);
      this.sent.push(r);
      if (r.active_symbols) {
        return setImmediate(() => this.emit("message", JSON.stringify({ msg_type: "active_symbols", req_id: r.req_id, active_symbols: listed || [{ symbol: "BOOM1000" }, { symbol: "CRASH1000" }] })));
      }
      if (r.ticks_history && r.subscribe && refuseSubscribe) {
        return setImmediate(() => this.emit("message", JSON.stringify({ msg_type: "ticks_history", req_id: r.req_id, error: { code: "RateLimit", message: "subscription limit exceeded" } })));
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

test("the five index types hold the full lists", () => {
  const by = (g) => signals.MARKETS.filter((m) => m.group === g).map((m) => m.name);
  assert.deepEqual(signals.GROUPS.map((g) => g.key), ["boom", "crash", "jump", "step", "volatility"]);
  assert.deepEqual(by("boom"), ["Boom 1000", "Boom 900", "Boom 600", "Boom 500", "Boom 300", "Boom 200", "Boom 150", "Boom 100", "Boom 99", "Boom 50"]);
  assert.deepEqual(by("crash"), by("boom").map((n) => n.replace("Boom", "Crash")));
  assert.equal(by("volatility").length, 21);
  assert.ok(by("volatility").includes("Volatility 5 (1s) Index") && by("volatility").includes("Volatility 250 Index") && by("volatility").includes("Volatility 150 (1s) Index"));
  assert.equal(by("jump").length, 5);
  assert.equal(by("step").length, 5);
});

test("Jump, Step and Volatility can give BUY or SELL; Boom only SELL; Crash only BUY", () => {
  for (const g of ["jump", "step", "volatility"]) {
    const m = signals.MARKETS.find((x) => x.group === g);
    assert.equal(signals.setupOf(falling, m.mode), "SELL", g);
    assert.equal(signals.setupOf(rising, m.mode), "BUY", g);
  }
  assert.equal(signals.setupOf(rising, signals.MARKETS.find((x) => x.group === "boom").mode), "");
  assert.equal(signals.setupOf(falling, signals.MARKETS.find((x) => x.group === "crash").mode), "");
});

test("markets are matched to Deriv by code or by name, and the page data is split by index type", async () => {
  const { FakeWS } = fakeDeriv(
    { BOOM1000: flat, SOMETHING: flat, "1HZ10V": flat, R_75: flat },
    [
      { symbol: "BOOM1000", display_name: "Boom 1000 Index" },
      { symbol: "SOMETHING", display_name: "Boom 600 Index" }, // a code we did not know: found by its name
      { symbol: "1HZ10V", display_name: "Volatility 10 (1s) Index" },
      { symbol: "R_75", display_name: "Volatility 75 Index" },
      { symbol: "OTHER", display_name: "Gold" }, // not one of ours: ignored
    ]
  );
  const mon = signals.create({ enabled: true, WebSocketImpl: FakeWS, now: () => 1, log: () => {} });
  mon.start();
  await new Promise((r) => setTimeout(r, 400));
  const snap = mon.snapshot();
  mon.stop();
  const g = (k) => snap.groups.find((x) => x.key === k);
  assert.deepEqual(snap.groups.map((x) => x.key), ["boom", "crash", "jump", "step", "volatility"]);
  assert.deepEqual(g("boom").watching, ["Boom 1000", "Boom 600"]);
  assert.equal(g("boom").unavailable.length, 8);
  assert.deepEqual(g("crash").watching, []);
  assert.deepEqual(g("volatility").watching, ["Volatility 75 Index", "Volatility 10 (1s) Index"]);
  assert.equal(g("jump").watching.length, 0);
});

test("only M30 is streamed; H1 is built from it and gives the same setup", async () => {
  const { FakeWS, sockets } = fakeDeriv({ BOOM1000: falling, CRASH1000: flat });
  const mon = signals.create({ enabled: true, WebSocketImpl: FakeWS, now: () => 1_000_000, log: () => {} });
  mon.start();
  await new Promise((r) => setTimeout(r, 2500));
  const streamed = sockets[0].sent.filter((x) => x.subscribe === 1).map((x) => x.granularity);
  assert.ok(streamed.length > 0 && streamed.every((g) => g === 1800), "no H1, H4 or D1 stream");
  assert.equal(sockets[0].sent.some((x) => x.granularity === 3600), false, "H1 is never asked for");
  mon.check();
  const tfs = mon.snapshot().active.filter((a) => a.market === "Boom 1000").map((a) => a.tf).sort();
  assert.deepEqual(tfs, ["H1", "M30"]);
  mon.stop();
});

test("when Deriv refuses a stream (subscription limit) the market is asked for repeatedly instead", async () => {
  const { FakeWS } = fakeDeriv({ BOOM1000: falling, CRASH1000: flat }, undefined, true);
  const mon = signals.create({ enabled: true, WebSocketImpl: FakeWS, now: () => 1_000_000, log: () => {} });
  mon.start();
  await new Promise((r) => setTimeout(r, 2500));
  mon.check();
  assert.ok(mon.snapshot().active.some((a) => a.market === "Boom 1000" && a.type === "SELL"), "still tracked through plain requests");
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
