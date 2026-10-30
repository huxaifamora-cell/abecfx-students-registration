// Boom / Crash trade-setup monitor for alumni members. This is the BFA Live Monitor expert advisor, moved onto the
// website: no MetaTrader and no expert advisor. The server watches the markets over Deriv's WebSocket connection,
// checks the same rules, shows live setups on the alumni "Signals" page of the portal, and (optionally) posts each
// alert to a Telegram channel.
//
// The rules (unchanged from the expert advisor), on the M30 and H1 charts. Boom, Crash, Jump, Step and Volatility
// indices are all checked; Boom gives SELL setups only and Crash BUY only (as the advisor did), the others either way:
//   Indicators: Bollinger Bands middle line (20 candles, same as a 20-candle moving average), SMA 10, EMA 10.
//   Boom  = SELL setup when the Bollinger middle line slopes down, and the EMA is below both the middle line and the SMA.
//   Crash = BUY setup when the Bollinger middle line slopes up, and the EMA is above both the middle line and the SMA.
//   The newest (still forming) candle is used, like the expert advisor did. H1 takes priority over M30.
//   While a setup stays valid it is repeated as a reminder every REMINDER_MINUTES, with how long it has been valid.
//   The alert also shows the H4 and D1 trend (direction of the Bollinger middle line and how far the EMA is from it).
//
// Which markets: Deriv does not offer every Boom and Crash index over its WebSocket connection. On every connection
// the server asks Deriv which of them exist and watches only those; the rest are listed as "not available".
//
// Turn it on with SIGNALS=on. Optional: TELEGRAM_SIGNAL_TOKEN and TELEGRAM_SIGNAL_CHAT_ID (Telegram alerts),
// DERIV_APP_ID (default 1089, Deriv's testing id: register your own at developers.deriv.com),
// DERIV_WS_URL, SIGNAL_REMINDER_MINUTES (default 2).

// The index types shown on the Signals page, in this order.
const GROUPS = [
  { key: "boom", title: "Boom" },
  { key: "crash", title: "Crash" },
  { key: "jump", title: "Jump" },
  { key: "step", title: "Step" },
  { key: "volatility", title: "Volatility" },
];

// Every market that is looked for, with the code Deriv uses for it. `mode` is which setups it can give:
//   Boom: SELL only. Crash: BUY only. Jump, Step and Volatility: both, BUY or SELL, by the same rules.
// A market is matched to Deriv by this code, or by its name (so a wrong code here does not hide a market).
const MARKETS = [];
const add = (group, mode, name, code) => MARKETS.push({ group, mode, name, code });
for (const [n, c] of [["1000", "BOOM1000"], ["900", "BOOM900"], ["600", "BOOM600"], ["500", "BOOM500"], ["300", "BOOM300N"], ["200", "BOOM200"], ["150", "BOOM150N"], ["100", "BOOM100"], ["99", "BOOM99"], ["50", "BOOM50"]]) add("boom", "SELL", "Boom " + n, c);
for (const [n, c] of [["1000", "CRASH1000"], ["900", "CRASH900"], ["600", "CRASH600"], ["500", "CRASH500"], ["300", "CRASH300N"], ["200", "CRASH200"], ["150", "CRASH150N"], ["100", "CRASH100"], ["99", "CRASH99"], ["50", "CRASH50"]]) add("crash", "BUY", "Crash " + n, c);
for (const n of ["10", "25", "50", "75", "100"]) add("jump", "BOTH", "Jump " + n + " Index", "JD" + n);
add("step", "BOTH", "Step Index", "stpRNG");
for (const [n, c] of [["200", "stpRNG2"], ["300", "stpRNG3"], ["400", "stpRNG4"], ["500", "stpRNG5"]]) add("step", "BOTH", "Step " + n + " Index", c);
for (const n of ["10", "15", "25", "30", "50", "75", "90", "100", "150", "250"]) add("volatility", "BOTH", "Volatility " + n + " Index", ["10", "25", "50", "75", "100"].includes(n) ? "R_" + n : "");
for (const n of ["5", "10", "15", "25", "30", "50", "75", "90", "100", "150", "250"]) add("volatility", "BOTH", "Volatility " + n + " (1s) Index", "1HZ" + n + "V");
// "Boom 1000" or "Boom 1000 Index", with any spacing, is the same name.
const norm = (v) => String(v || "").toLowerCase().replace(/\bindex\b/g, "").replace(/\s+/g, " ").trim();

const TF = { M30: 1800, H1: 3600, H4: 14400, D1: 86400 };
const LIVE_TFS = ["M30", "H1"]; // watched continuously
const TREND_TFS = ["H4", "D1"]; // refreshed every few minutes
const BB_PERIOD = 20;
const SMA_PERIOD = 10;
const EMA_PERIOD = 10;
const KEEP_CANDLES = 300;
const FRESH_SECONDS = 120; // a market that has not updated for this long is not checked (no alerts from stale prices)

// ---------- Indicators (pure) ----------

function smaAt(closes, i, n) {
  if (i < n - 1) return NaN;
  let sum = 0;
  for (let j = i - n + 1; j <= i; j++) sum += closes[j];
  return sum / n;
}

function emaSeries(closes, n) {
  const k = 2 / (n + 1);
  const out = [];
  closes.forEach((c, i) => out.push(i === 0 ? c : c * k + out[i - 1] * (1 - k)));
  return out;
}

// The numbers the rules use, from the closing prices (oldest first, the last one is the forming candle).
function readings(closes) {
  const n = closes.length;
  if (n < BB_PERIOD + 1) return null;
  const ema = emaSeries(closes, EMA_PERIOD);
  return {
    bbNow: smaAt(closes, n - 1, BB_PERIOD),
    bbPrev: smaAt(closes, n - 2, BB_PERIOD),
    sma: smaAt(closes, n - 1, SMA_PERIOD),
    ema: ema[n - 1],
  };
}

// Is there a setup right now? mode is "SELL" (Boom), "BUY" (Crash) or "BOTH". Returns "SELL", "BUY" or "".
// (true / false still mean Boom / Crash.)
function setupOf(closes, mode) {
  const m = mode === true ? "SELL" : mode === false ? "BUY" : mode || "BOTH";
  const r = readings(closes);
  if (!r) return "";
  if (m !== "BUY" && r.bbNow < r.bbPrev && r.ema < r.bbNow && r.ema < r.sma) return "SELL";
  if (m !== "SELL" && r.bbNow > r.bbPrev && r.ema > r.bbNow && r.ema > r.sma) return "BUY";
  return "";
}

// "Strong Uptrend", "Weak Downtrend", ... from the Bollinger middle line direction and the EMA's distance from it.
function trendOf(closes) {
  const r = readings(closes);
  if (!r) return "No Data";
  const slope = r.bbNow - r.bbPrev;
  const dist = r.bbNow ? Math.abs(((r.ema - r.bbNow) / r.bbNow) * 100) : 0;
  const strength = dist > 0.15 ? "Strong" : dist > 0.08 ? "Moderate" : dist > 0.03 ? "Weak" : "Very Weak";
  if (slope > 0) return strength + " Uptrend";
  if (slope < 0) return strength + " Downtrend";
  return "Sideways";
}

function alertText(m, tf, type, h4, d1, first, elapsed) {
  let t = "🚨 TRADE ALERT 🚨\n\n";
  t += (/^(boom|crash)/i.test(m.name) ? m.name.replace(/\s+/g, "") : m.name.replace(/ Index$/i, "")).toUpperCase() + " " + type + " SETUP CONFIRMED | TF: " + tf + "\n\n";
  t += "📊 TOP-DOWN ANALYSIS:\n• H4 trend → " + h4 + "\n• D1 trend → " + d1;
  if (!first && elapsed > 0) t += "\n\n⏰ REMINDER: valid for the past " + elapsed + (elapsed === 1 ? " minute" : " minutes");
  return t;
}

// ---------- The monitor ----------

// opts: enabled, url, appId, reminderMinutes, telegramToken, telegramChat,
//       WebSocketImpl (the tests pass a fake), now() in milliseconds, fetchImpl, log
function create(opts = {}) {
  const WS = opts.WebSocketImpl || (() => { try { return require("ws"); } catch (e) { return null; } })();
  const now = opts.now || (() => Date.now());
  const log = opts.log || ((...a) => console.log("[signals]", ...a));
  // Deriv's current public endpoint needs no sign-in. The older one needs an app id. If one cannot be reached the
  // other is tried (the connection alternates between them until one answers).
  const withApp = (u, id) => u + (u.includes("?") ? "&" : "?") + "app_id=" + encodeURIComponent(id);
  const urls = opts.url
    ? [opts.appId ? withApp(opts.url, opts.appId) : opts.url]
    : ["wss://api.derivws.com/trading/v1/options/ws/public", withApp("wss://ws.derivws.com/websockets/v3", opts.appId || "1089")];
  let urlIndex = 0;
  let gotData = false;
  let lastError = "";
  const intervalMs = Math.max(1, Number(opts.reminderMinutes) || 2) * 60 * 1000;
  const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);

  let ws = null;
  let connected = false;
  let stopped = true;
  let retry = 0;
  let timers = [];
  let checker = null;
  let nextId = 1;
  const pending = new Map(); // req_id -> { code, tf }
  const candles = new Map(); // "CODE:seconds" -> [{ t, c }]
  const touched = new Map(); // "CODE:seconds" -> ms of the last update
  let watched = []; // markets Deriv has
  let missing = []; // markets Deriv does not have over WebSocket
  const state = new Map(); // "CODE:TF" -> { first, last }
  const events = []; // recent alerts, newest first
  let eventSeq = 0;

  const key = (code, secs) => code + ":" + secs;
  const send = (obj) => { if (ws && connected) ws.send(JSON.stringify(obj)); };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); timers.push(t); return t; };

  function request(obj, meta) {
    const id = nextId++;
    if (meta) pending.set(id, meta);
    send({ ...obj, req_id: id });
  }

  function askCandles(m, tf, subscribe) {
    request(
      { ticks_history: m.code, adjust_start_time: 1, count: tf === "D1" || tf === "H4" ? 60 : 150, end: "latest", style: "candles", granularity: TF[tf], ...(subscribe ? { subscribe: 1 } : {}) },
      { code: m.code, tf }
    );
  }

  // Ask for everything, a little apart so Deriv's request limit is never hit.
  function subscribeAll() {
    let delay = 0;
    for (const m of watched) {
      for (const tf of LIVE_TFS) { later(() => askCandles(m, tf, true), delay); delay += 150; }
      for (const tf of TREND_TFS) { later(() => askCandles(m, tf, false), delay); delay += 150; }
    }
    // H4 and D1 move slowly: refresh them every 5 minutes instead of streaming them.
    later(function refresh() {
      if (!connected) return;
      let d = 0;
      for (const m of watched) for (const tf of TREND_TFS) { later(() => askCandles(m, tf, false), d); d += 150; }
      later(refresh, 5 * 60 * 1000);
    }, 5 * 60 * 1000);
  }

  function store(code, secs, list) {
    const k = key(code, secs);
    candles.set(k, list.slice(-KEEP_CANDLES));
    touched.set(k, now());
  }

  function onMessage(raw) {
    let d;
    try { d = JSON.parse(String(raw)); } catch (e) { return; }
    gotData = true;
    lastError = "";
    const meta = d.req_id ? pending.get(d.req_id) : null;

    if (d.msg_type === "active_symbols") {
      if (d.error) {
        log("Could not list Deriv markets, trying all of them that have a code:", d.error.message);
        watched = MARKETS.filter((m) => m.code);
        missing = MARKETS.filter((m) => !m.code);
      } else {
        log("Deriv listed " + (d.active_symbols || []).length + " markets");
        const list = (d.active_symbols || []).map((x) => ({ code: x.symbol || x.underlying_symbol, name: norm(x.display_name || x.underlying_symbol_name) }));
        const byCode = new Map(list.map((x) => [x.code, x]));
        const byName = new Map(list.filter((x) => x.name).map((x) => [x.name, x]));
        watched = [];
        missing = [];
        for (const m of MARKETS) {
          const hit = (m.code && byCode.get(m.code)) || byName.get(norm(m.name));
          if (hit) watched.push({ ...m, code: hit.code }); else missing.push(m);
        }
      }
      log("Watching " + watched.length + " markets: " + watched.map((m) => m.name).join(", ") + (missing.length ? ". Not on Deriv WebSocket: " + missing.map((m) => m.name).join(", ") : ""));
      subscribeAll();
      return;
    }
    if (d.error) {
      if (meta) {
        log("Deriv refused " + meta.code + " " + meta.tf + ": " + d.error.message);
        if (d.error.code === "InvalidSymbol") {
          const watchedBefore = watched;
          watched = watched.filter((m) => m.code !== meta.code);
          const gone = MARKETS.find((m) => m.name === (watchedBefore.find((w) => w.code === meta.code) || {}).name);
          if (gone && !missing.includes(gone)) missing.push(gone);
        }
      }
      return;
    }
    if (d.msg_type === "candles" && meta) {
      store(meta.code, TF[meta.tf], (d.candles || []).map((c) => ({ t: Number(c.epoch), c: Number(c.close) })));
      return;
    }
    if (d.msg_type === "ohlc" && d.ohlc) {
      const o = d.ohlc;
      const k = key(o.symbol || o.underlying_symbol, Number(o.granularity));
      const list = candles.get(k);
      if (!list) return;
      const t = Number(o.open_time || o.epoch);
      const last = list[list.length - 1];
      if (last && last.t === t) last.c = Number(o.close);
      else if (!last || t > last.t) { list.push({ t, c: Number(o.close) }); if (list.length > KEEP_CANDLES) list.shift(); }
      touched.set(k, now());
    }
  }

  const closesOf = (code, secs) => (candles.get(key(code, secs)) || []).map((x) => x.c);
  const freshEnough = (code, secs) => now() - (touched.get(key(code, secs)) || 0) < FRESH_SECONDS * 1000;
  const trendFor = (code, tf) => trendOf(closesOf(code, TF[tf]));

  function sendTelegram(text) {
    if (!opts.telegramToken || !opts.telegramChat || !fetchImpl) return;
    fetchImpl("https://api.telegram.org/bot" + opts.telegramToken + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ chat_id: String(opts.telegramChat), text }).toString(),
    }).then((r) => { if (!r.ok) log("Telegram answered " + r.status); }).catch((e) => log("Telegram send failed:", e.message));
  }

  // One look at every watched market. Runs every few seconds.
  function check() {
    if (!connected) return;
    const t = now();
    for (const m of watched) {
      for (const tf of LIVE_TFS) {
        const st = state.get(m.code + ":" + tf) || { first: 0, last: 0, type: "" };
        state.set(m.code + ":" + tf, st);
        const type = freshEnough(m.code, TF[tf]) ? setupOf(closesOf(m.code, TF[tf]), m.mode) : "";
        if (!type) { st.first = 0; st.type = ""; continue; }
        if (!st.first) { st.first = t; st.last = 0; }
        st.type = type;
        if (t - st.last < intervalMs) continue;
        // H1 takes priority: no M30 alert while the H1 one for this market is still in its reminder window.
        const h1 = state.get(m.code + ":H1");
        if (tf === "M30" && h1 && h1.type && t - h1.last < intervalMs) continue;
        const first = st.last === 0;
        const elapsed = Math.floor((t - st.first) / 60000);
        const h4 = trendFor(m.code, "H4");
        const d1 = trendFor(m.code, "D1");
        st.last = t;
        events.unshift({ id: ++eventSeq, at: new Date(t).toISOString(), group: m.group, market: m.name, type, tf, h4, d1, first, elapsed });
        if (events.length > 100) events.pop();
        sendTelegram(alertText(m, tf, type, h4, d1, first, elapsed));
        log("Alert: " + m.name + " " + type + " " + tf + (first ? " (first)" : " (reminder " + elapsed + " min)"));
      }
    }
  }

  function connect() {
    if (stopped || !WS) return;
    gotData = false;
    ws = new WS(urls[urlIndex % urls.length]);
    log("Connecting to " + urls[urlIndex % urls.length].replace(/\?.*$/, ""));
    ws.on("open", () => {
      connected = true;
      retry = 0;
      log("Connected to Deriv");
      request({ active_symbols: "brief" });
      later(function ping() { if (connected) { send({ ping: 1 }); later(ping, 30000); } }, 30000);
    });
    ws.on("message", onMessage);
    const down = (why) => {
      if (!connected && !ws) return;
      connected = false;
      ws = null;
      timers.forEach(clearTimeout);
      timers = [];
      pending.clear();
      state.clear();
      if (why) lastError = why;
      log("Disconnected from Deriv" + (why ? ": " + why : ""));
      if (!gotData) urlIndex += 1; // never heard from this address: try the other one next time
      if (stopped) return;
      retry = Math.min(retry + 1, 6);
      later(connect, Math.min(60000, 2000 * 2 ** retry));
    };
    ws.on("close", (code) => down(""));
    ws.on("unexpected-response", (req, res) => down("Deriv answered HTTP " + res.statusCode));
    ws.on("error", (e) => down(e && e.message));
  }

  function start() {
    if (!stopped) return;
    if (!WS) { log("The 'ws' package is not installed, so signals are off."); return; }
    stopped = false;
    connect();
    checker = setInterval(check, 5000);
    if (checker.unref) checker.unref();
  }

  function stop() {
    stopped = true;
    connected = false;
    timers.forEach(clearTimeout);
    timers = [];
    if (checker) { clearInterval(checker); checker = null; }
    if (ws) { try { ws.close(); } catch (e) { /* already closed */ } ws = null; }
  }

  // What the portal shows alumni members.
  function snapshot() {
    const t = now();
    const active = [];
    for (const m of watched) {
      for (const tf of LIVE_TFS) {
        const st = state.get(m.code + ":" + tf);
        if (st && st.first && st.type) {
          active.push({ group: m.group, market: m.name, type: st.type, tf, minutes: Math.floor((t - st.first) / 60000), h4: trendFor(m.code, "H4"), d1: trendFor(m.code, "D1") });
        }
      }
    }
    return {
      enabled: Boolean(opts.enabled),
      connected,
      error: connected ? "" : lastError,
      watching: watched.map((m) => m.name),
      unavailable: missing.map((m) => m.name),
      // The same lists split by index type, in display order.
      groups: GROUPS.map((g) => ({
        key: g.key,
        title: g.title,
        watching: watched.filter((m) => m.group === g.key).map((m) => m.name),
        unavailable: missing.filter((m) => m.group === g.key).map((m) => m.name),
      })),
      active,
      recent: events.slice(0, 30),
      reminderMinutes: intervalMs / 60000,
      at: new Date(t).toISOString(),
    };
  }

  return { start, stop, snapshot, check, _onMessage: onMessage };
}

module.exports = { create, setupOf, trendOf, readings, alertText, MARKETS, GROUPS, TF };
