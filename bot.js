// Bot trading for alumni members: the website turns each new signal into a trade order for every alumni member who
// switched the bot on, within the risk limits that member set.
//
// How it reaches MetaTrader 5 without any paid service: the member runs the small ABECFX connector inside their
// own MT5 (downloaded from the portal). Every few seconds it sends the website the account details, open trades
// and closed trades, and receives any waiting orders, which it opens in MT5. The website never sees the member's
// MT5 password. Linking gives the member a one-time key that the connector sends; "Disconnect" cancels the key.
//
// Everything about an account's risk lives here and is checked here (the connector only carries out orders):
//   lot size, stop loss and take profit (in account currency, per position), positions per trade, max trades a day,
//   which index types to trade, and the bot's on/off switch. Turning the bot on needs a stop loss and the member's
//   confirmation that they accept the risk.
//
// Three sheet tabs (see sheets.js): "Bot Accounts" (key hash and settings), "Bot Orders" (every order and how it
// ended) and "Bot Trades" (every closed trade). Live things (open trades, balance) are kept in memory only, so the
// sheet is not written to every few seconds.
const crypto = require("crypto");

const ACCOUNT_HEADERS = [
  "Reg Number", "Key Hash (do not edit)", "Linked At (Lagos)", "Bot On", "Lot Size", "Stop Loss (account currency)",
  "Take Profit (account currency, 0 = none)", "Positions Per Trade", "Max Daily Trades", "Index Types", "Risk Accepted At (Lagos)",
  "Updated At (Lagos)", "Last Account Details (do not edit)",
];
const A = { reg: 0, keyHash: 1, linkedAt: 2, on: 3, lot: 4, sl: 5, tp: 6, positions: 7, daily: 8, groups: 9, accepted: 10, updated: 11, account: 12 };
const ORDER_HEADERS = ["Reg Number", "Order ID", "Created At (UTC)", "Lagos Date", "Signal", "Symbol", "Side", "Lot Size", "Positions Asked", "Positions Opened", "Result", "Detail"];
const TRADE_HEADERS = ["Reg Number", "Position", "Deal", "Symbol", "Type", "Lots", "Open Time (UTC)", "Open Price", "Close Time (UTC)", "Close Price", "Profit", "Swap", "Order", "Recorded At (Lagos)"];

const GROUPS = ["boom", "crash", "jump", "step", "volatility"];
const LIMITS = { lot: [0.01, 100], sl: [1, 1000000], tp: [0, 1000000], positions: [1, 10], daily: [1, 100] };
const DEFAULTS = { on: false, lot: 0.2, sl: 10, tp: 0, positions: 1, daily: 5, groups: ["boom", "crash"] };
const ORDER_LIFE_MS = 60 * 1000; // an order nobody picked up in this time is dropped (a late entry is a bad entry)
const RESULT_WAIT_MS = 3 * 60 * 1000; // an order sent to MT5 with no answer after this is marked unknown
const ONLINE_MS = 30 * 1000; // the connector counts as online when it reported this recently
const KEEP_HISTORY = 200;
const KEEP_ACTIVITY = 30;

class BotError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

const normReg = (v) => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "");
const hashKey = (k) => crypto.createHash("sha256").update(String(k)).digest("hex");
const text = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f|]/g, " ").trim().slice(0, max);
const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const isoFromEpoch = (s) => (Number(s) > 0 ? new Date(Number(s) * 1000).toISOString() : "");

// The name MT5 gives a market on Deriv's server: "Boom 1000" is "Boom 1000 Index"; the others already end in Index.
function mt5Symbol(marketName) {
  return /^(boom|crash)/i.test(marketName) ? marketName + " Index" : marketName;
}

function parseGroups(v) {
  const list = String(v || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => GROUPS.includes(x));
  return list.length ? list : DEFAULTS.groups.slice();
}

// Check the settings a member sends. Returns { values } or throws a BotError that names each problem.
function checkSettings(input, current) {
  const b = input || {};
  const errors = {};
  const out = { ...current };
  const field = (key, label, int) => {
    if (b[key] === undefined) return;
    const n = Number(b[key]);
    const [lo, hi] = LIMITS[key];
    if (!Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) {
      errors[key] = label + " must be " + (int ? "a whole number " : "a number ") + "from " + lo + " to " + hi + ".";
    } else out[key] = key === "lot" ? Math.round(n * 100) / 100 : Math.round(n * 100) / 100;
  };
  field("lot", "Lot size", false);
  field("sl", "Stop loss", false);
  field("tp", "Take profit", false);
  field("positions", "Positions per trade", true);
  field("daily", "Max daily trades", true);
  if (b.groups !== undefined) {
    const g = Array.isArray(b.groups) ? b.groups.map((x) => String(x).toLowerCase()).filter((x) => GROUPS.includes(x)) : [];
    if (!g.length) errors.groups = "Choose at least one type of index to trade.";
    else out.groups = GROUPS.filter((x) => g.includes(x));
  }
  if (b.on !== undefined) out.on = b.on === true;
  if (out.on) {
    if (!(out.sl >= LIMITS.sl[0])) errors.sl = "A stop loss is required to turn the bot on.";
    if (b.on === true && !current.accepted && b.acceptRisk !== true) errors.acceptRisk = "Tick the box to confirm you accept the risk.";
  }
  if (Object.keys(errors).length) throw new BotError(400, "Please fix the highlighted fields.", errors);
  return out;
}

// opts: enabled, now() (ms), today() (Lagos date text), stamp() (Lagos time text), isAlumni(reg) async, log
function create(store, opts = {}) {
  const now = opts.now || (() => Date.now());
  const stamp = opts.stamp || (() => new Date(now()).toISOString());
  const today = opts.today || (() => new Date(now()).toISOString().slice(0, 10));
  const isAlumni = opts.isAlumni || (async () => true);
  const log = opts.log || ((...a) => console.log("[bot]", ...a));

  const accounts = new Map(); // reg -> settings and row number
  const byKey = new Map(); // key hash -> reg
  const live = new Map(); // reg -> { seen, account, positions }
  const orders = new Map(); // order id -> order
  const activity = new Map(); // reg -> newest first
  const used = new Map(); // reg -> { date, count } trades today (executed and waiting)
  const seenDeals = new Set(); // "reg|deal"
  const history = new Map(); // reg -> newest first
  let ready = false;
  let chain = Promise.resolve();
  const queued = (task) => { const run = chain.then(task, task); chain = run.catch(() => {}); return run; };

  const settingsOf = (a) => ({ on: a.on, lot: a.lot, sl: a.sl, tp: a.tp, positions: a.positions, daily: a.daily, groups: a.groups, accepted: Boolean(a.accepted) });

  function fromRow({ n, cells }) {
    const g = (i) => cells[i] || "";
    const reg = normReg(g(A.reg));
    if (!reg) return null;
    const lim = (v, key, d) => { const x = Number(v); return Number.isFinite(x) && v !== "" ? Math.min(LIMITS[key][1], Math.max(LIMITS[key][0], x)) : d; };
    let account = null;
    try { account = g(A.account) ? JSON.parse(g(A.account)) : null; } catch (e) { account = null; }
    return {
      n, reg, keyHash: g(A.keyHash), linkedAt: g(A.linkedAt), on: /^yes$/i.test(g(A.on)),
      lot: lim(g(A.lot), "lot", DEFAULTS.lot), sl: lim(g(A.sl), "sl", DEFAULTS.sl), tp: lim(g(A.tp), "tp", DEFAULTS.tp),
      positions: Math.round(lim(g(A.positions), "positions", DEFAULTS.positions)), daily: Math.round(lim(g(A.daily), "daily", DEFAULTS.daily)),
      groups: parseGroups(g(A.groups)), accepted: g(A.accepted), account,
    };
  }
  const toCells = (a) => ({
    [A.keyHash]: a.keyHash, [A.linkedAt]: a.linkedAt, [A.on]: a.on ? "Yes" : "No", [A.lot]: a.lot, [A.sl]: a.sl, [A.tp]: a.tp,
    [A.positions]: a.positions, [A.daily]: a.daily, [A.groups]: a.groups.join(","), [A.accepted]: a.accepted || "", [A.updated]: stamp(),
  });

  // Read the sheet once at start, and again if it has not been read yet.
  async function init() {
    if (ready) return;
    for (const r of await store.tabRows("botaccounts")) {
      const a = fromRow(r);
      if (a) { accounts.set(a.reg, a); if (a.keyHash) byKey.set(a.keyHash, a.reg); }
    }
    for (const { cells } of await store.tabRows("bottrades")) {
      const reg = normReg(cells[0]);
      if (!reg) continue;
      seenDeals.add(reg + "|" + cells[2]);
      if (!history.has(reg)) history.set(reg, []);
      history.get(reg).unshift(tradeFromCells(cells));
    }
    const day = today();
    for (const { cells } of await store.tabRows("botorders")) {
      if (cells[3] === day && /^(Opened|Partly)/i.test(cells[10] || "")) bump(normReg(cells[0]), 1);
    }
    for (const [reg, list] of history) history.set(reg, list.sort((x, y) => String(y.closeTime).localeCompare(String(x.closeTime))).slice(0, KEEP_HISTORY));
    ready = true;
  }
  const ensure = async () => { if (!ready) await init(); };

  function tradeFromCells(c) {
    return { position: c[1], deal: c[2], symbol: c[3], type: c[4], lots: num(c[5]), openTime: c[6], openPrice: num(c[7]), closeTime: c[8], closePrice: num(c[9]), profit: num(c[10]), swap: num(c[11]), order: c[12] };
  }

  function usedToday(reg) {
    const u = used.get(reg);
    return u && u.date === today() ? u.count : 0;
  }
  function bump(reg, by) {
    const day = today();
    const u = used.get(reg);
    const base = u && u.date === day ? u.count : 0;
    used.set(reg, { date: day, count: Math.max(0, base + by) });
  }
  function note(reg, kind, message) {
    if (!activity.has(reg)) activity.set(reg, []);
    const list = activity.get(reg);
    list.unshift({ at: new Date(now()).toISOString(), kind, message });
    if (list.length > KEEP_ACTIVITY) list.pop();
  }

  async function rowFor(reg) {
    await ensure();
    let a = accounts.get(reg);
    if (a) return a;
    a = { reg, keyHash: "", linkedAt: "", ...DEFAULTS, groups: DEFAULTS.groups.slice(), accepted: "", account: null };
    await store.appendTabRows("botaccounts", [[reg, "", "", "No", a.lot, a.sl, a.tp, a.positions, a.daily, a.groups.join(","), "", stamp(), ""]]);
    const row = (await store.tabRows("botaccounts")).find((r) => normReg(r.cells[A.reg]) === reg);
    a.n = row ? row.n : 0;
    accounts.set(reg, a);
    return a;
  }

  // ---------- The member's page ----------

  async function view(regInput) {
    await ensure();
    const reg = normReg(regInput);
    const a = accounts.get(reg) || { ...DEFAULTS, groups: DEFAULTS.groups.slice(), keyHash: "", accepted: "", account: null };
    const l = live.get(reg);
    const online = Boolean(l && now() - l.seen < ONLINE_MS);
    const positions = (l && l.positions) || [];
    const closed = history.get(reg) || [];
    return {
      enabled: Boolean(opts.enabled),
      limits: LIMITS,
      settings: settingsOf(a),
      linked: Boolean(a.keyHash),
      linkedAt: a.linkedAt || "",
      connected: online,
      lastSeen: l ? new Date(l.seen).toISOString() : "",
      account: (l && l.account) || a.account || null,
      positions,
      floating: Math.round(positions.reduce((s, p) => s + num(p.profit) + num(p.swap), 0) * 100) / 100,
      history: closed.slice(0, 100),
      historyProfit: Math.round(closed.reduce((s, t) => s + num(t.profit) + num(t.swap), 0) * 100) / 100,
      activity: activity.get(reg) || [],
      today: { used: usedToday(reg), max: a.daily },
    };
  }

  function saveSettings(regInput, input) {
    return queued(async () => {
      const reg = normReg(regInput);
      const a = await rowFor(reg);
      const next = checkSettings(input, { ...settingsOf(a), accepted: a.accepted });
      Object.assign(a, { on: next.on, lot: next.lot, sl: next.sl, tp: next.tp, positions: next.positions, daily: next.daily, groups: next.groups });
      if (next.on && !a.accepted) a.accepted = stamp();
      await store.writeTabCells("botaccounts", a.n, toCells(a));
      note(reg, "info", next.on ? "Bot switched on." : "Bot switched off.");
      return view(reg);
    });
  }

  // A new connection key. It is shown once; only a hash is kept. Linking again replaces the old key.
  function link(regInput) {
    return queued(async () => {
      const reg = normReg(regInput);
      const a = await rowFor(reg);
      if (a.keyHash) byKey.delete(a.keyHash);
      const key = "BK-" + crypto.randomBytes(24).toString("base64url");
      a.keyHash = hashKey(key);
      a.linkedAt = stamp();
      a.account = null;
      live.delete(reg);
      byKey.set(a.keyHash, reg);
      await store.writeTabCells("botaccounts", a.n, { ...toCells(a), [A.account]: "" });
      note(reg, "info", "New connection key made. Paste it into the connector in MT5.");
      return { key };
    });
  }

  // Cancel the key, switch the bot off and drop everything waiting for this member.
  function disconnect(regInput) {
    return queued(async () => {
      const reg = normReg(regInput);
      const a = accounts.get(reg);
      if (!a || !a.keyHash) return view(reg);
      byKey.delete(a.keyHash);
      a.keyHash = "";
      a.linkedAt = "";
      a.on = false;
      a.account = null;
      live.delete(reg);
      for (const o of orders.values()) if (o.reg === reg && o.status === "waiting") { o.status = "cancelled"; bump(reg, -1); }
      await store.writeTabCells("botaccounts", a.n, { ...toCells(a), [A.account]: "" });
      note(reg, "info", "Account disconnected. The bot is off.");
      return view(reg);
    });
  }

  // ---------- The MT5 connector ----------

  const regOfKey = (key) => byKey.get(hashKey(String(key || ""))) || "";

  function expire() {
    const t = now();
    for (const o of orders.values()) {
      if (o.status === "waiting" && t > o.expiresAt) { o.status = "expired"; bump(o.reg, -1); note(o.reg, "warn", "Order for " + o.symbol + " was not picked up in time and was dropped."); finishOrder(o, "Expired", "The connector did not collect it in time."); }
      else if (o.status === "sent" && t > o.sentAt + RESULT_WAIT_MS) { o.status = "unknown"; note(o.reg, "warn", "No answer from MT5 for the " + o.symbol + " order. Check your MT5."); finishOrder(o, "No answer", "MT5 did not report back."); }
      if (["done", "failed", "expired", "unknown", "cancelled"].includes(o.status) && t > o.createdAt + 10 * 60 * 1000) orders.delete(o.id);
    }
  }

  function finishOrder(o, result, detail, opened) {
    if (o.logged) return;
    o.logged = true;
    store.appendTabRows("botorders", [[o.reg, o.id, new Date(o.createdAt).toISOString(), o.day, o.signal, o.symbol, o.side, o.lots, o.count, opened || 0, result, text(detail, 200)]])
      .catch((e) => log("Could not save order", o.id, e.message));
  }

  // The connector's report (account, open trades, closed trades, order results). Returns the lines to send back:
  // one "ORDER|..." line for each waiting order.
  function report(regInput, body) {
    return queued(async () => {
      await ensure();
      const reg = normReg(regInput);
      const a = accounts.get(reg);
      if (!a || !a.keyHash) throw new BotError(401, "This key is no longer valid.");
      const b = body || {};
      const acc = b.account || {};
      const account = {
        login: text(acc.login, 20), name: text(acc.name, 60), server: text(acc.server, 60), company: text(acc.company, 60), currency: text(acc.currency, 8),
        leverage: Math.round(num(acc.leverage)), real: acc.real === true, balance: num(acc.balance), equity: num(acc.equity), margin: num(acc.margin),
        freeMargin: num(acc.freeMargin), profit: num(acc.profit),
      };
      const positions = (Array.isArray(b.positions) ? b.positions : []).slice(0, 100).map((p) => ({
        ticket: text(p.ticket, 24), symbol: text(p.symbol, 40), type: /sell/i.test(p.type) ? "SELL" : "BUY", lots: num(p.lots), openTime: isoFromEpoch(p.openTime),
        openPrice: num(p.openPrice), sl: num(p.sl), tp: num(p.tp), profit: num(p.profit), swap: num(p.swap), order: text(p.comment, 40),
      }));
      const previous = live.get(reg);
      live.set(reg, { seen: now(), account, positions });
      if (account.login && (!previous || !a.account || a.account.login !== account.login || !a.lastSaved || now() - a.lastSaved > 10 * 60 * 1000)) {
        a.account = account;
        a.lastSaved = now();
        store.writeTabCells("botaccounts", a.n, { [A.account]: JSON.stringify(account) }).catch((e) => log("Could not save account details", e.message));
      }

      // closed trades: each deal is saved once
      const fresh = [];
      for (const c of (Array.isArray(b.closed) ? b.closed : []).slice(0, 200)) {
        const deal = text(c.deal, 24);
        if (!deal || seenDeals.has(reg + "|" + deal)) continue;
        seenDeals.add(reg + "|" + deal);
        const t = {
          position: text(c.position, 24), deal, symbol: text(c.symbol, 40), type: /sell/i.test(c.type) ? "SELL" : "BUY", lots: num(c.lots),
          openTime: isoFromEpoch(c.openTime), openPrice: num(c.openPrice), closeTime: isoFromEpoch(c.closeTime), closePrice: num(c.closePrice),
          profit: num(c.profit), swap: num(c.swap), order: text(c.comment, 40),
        };
        fresh.push(t);
      }
      if (fresh.length) {
        await store.appendTabRows("bottrades", fresh.map((t) => [reg, t.position, t.deal, t.symbol, t.type, t.lots, t.openTime, t.openPrice, t.closeTime, t.closePrice, t.profit, t.swap, t.order, stamp()]));
        const list = (history.get(reg) || []).concat(fresh);
        list.sort((x, y) => String(y.closeTime).localeCompare(String(x.closeTime)));
        history.set(reg, list.slice(0, KEEP_HISTORY));
      }

      // what happened to the orders sent earlier
      for (const r of (Array.isArray(b.results) ? b.results : []).slice(0, 50)) {
        const o = orders.get(text(r.id, 40));
        if (!o || o.reg !== reg || (o.status !== "sent" && o.status !== "unknown")) continue;
        const opened = Math.max(0, Math.min(o.count, Math.round(num(r.opened))));
        if (opened > 0) {
          o.status = "done";
          note(reg, "ok", "Opened " + opened + (opened === 1 ? " position" : " positions") + ": " + o.symbol + " " + o.side + " " + o.lots + " lots (" + o.signal + ").");
          finishOrder(o, opened === o.count ? "Opened" : "Partly opened", r.error || "", opened);
        } else {
          o.status = "failed";
          bump(reg, -1);
          note(reg, "error", "Could not open " + o.symbol + " " + o.side + ": " + text(r.error, 120));
          finishOrder(o, "Failed", r.error || "", 0);
        }
      }

      expire();
      // orders waiting for this member go out once
      const lines = [];
      for (const o of orders.values()) {
        if (o.reg !== reg || o.status !== "waiting") continue;
        o.status = "sent";
        o.sentAt = now();
        const ttl = Math.max(5, Math.ceil((o.expiresAt - now()) / 1000));
        lines.push(["ORDER", o.id, o.symbol, o.side, o.lots.toFixed(2), o.sl.toFixed(2), o.tp.toFixed(2), o.count, ttl].join("|"));
      }
      return lines;
    });
  }

  // ---------- Signals become orders ----------

  // alert: { market, group, type: "BUY" | "SELL", tf, first }. Only the first alert of a setup places trades.
  function onAlert(alert) {
    return queued(async () => {
      if (!opts.enabled || !alert || !alert.first) return 0;
      await ensure();
      expire();
      const symbol = mt5Symbol(alert.market);
      const signal = alert.market + " " + alert.type + " " + alert.tf;
      let made = 0;
      for (const a of accounts.values()) {
        if (!a.on || !a.keyHash || !a.groups.includes(alert.group)) continue;
        const l = live.get(a.reg);
        if (!l || now() - l.seen > ONLINE_MS) continue; // their MT5 is not connected right now
        if (l.positions.some((p) => p.symbol === symbol)) continue; // already in this market
        if ([...orders.values()].some((o) => o.reg === a.reg && o.symbol === symbol && (o.status === "waiting" || o.status === "sent"))) continue;
        if (usedToday(a.reg) >= a.daily) continue;
        if (!(await isAlumni(a.reg))) continue;
        bump(a.reg, 1);
        const id = "O" + now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();
        orders.set(id, {
          id, reg: a.reg, symbol, side: alert.type, signal, lots: a.lot, sl: a.sl, tp: a.tp, count: a.positions,
          createdAt: now(), expiresAt: now() + ORDER_LIFE_MS, status: "waiting", day: today(), logged: false,
        });
        note(a.reg, "info", "Signal " + signal + ": order queued for " + a.positions + (a.positions === 1 ? " position" : " positions") + ".");
        made++;
      }
      if (made) log("Signal " + signal + ": " + made + " order" + (made === 1 ? "" : "s") + " queued");
      return made;
    });
  }

  return { init, view, saveSettings, link, disconnect, report, onAlert, regOfKey };
}

module.exports = { create, checkSettings, mt5Symbol, ACCOUNT_HEADERS, ORDER_HEADERS, TRADE_HEADERS, LIMITS, DEFAULTS, GROUPS, BotError };
