// Copy trading for alumni members.
//
// A MASTER is any mentor or staff member (someone who holds the Staff ID card) who links their own MetaTrader 5
// account with the ABECFX connector. The connector reports the master's open and closed trades to the website. An
// ALUMNI member chooses one master to follow; the website then tells that member's own connector (the same one used
// for Bot trading) to open the same trade, and keeps it in step:
//   - OPEN    a new trade of the master is opened on the follower's account with the follower's own FIXED LOT SIZE,
//             and the master's stop loss and take profit.
//   - MODIFY  when the master moves the stop loss or take profit, the follower's trade follows.
//   - CLOSE   when the master closes the trade, the follower's copy is closed.
//
// Everything is kept in the Google Sheet (see sheets.js): "Copy Masters", "Copy Follows", "Copy Master Trades" and
// "Copy Orders". Live things (what is open right now, who is online) are kept in memory only, so the sheet is not
// written every few seconds, and are rebuilt from the next report of each connector after a restart.
//
// Safety rules enforced HERE (the connector only carries out what it is told):
//   - Only trades the master opens AFTER the follower started following, and that the website saw being opened, are
//     copied. Trades already open are never copied, and neither are trades opened while the website was not
//     receiving the master's reports (the first report after a restart only records what is open). A copy is only
//     opened within OPEN_WINDOW_MS of the master's trade being seen: a late entry is a bad entry.
//   - A trade is only copied once it has a stop loss, so no copy is ever opened without one.
//   - Nothing is opened, changed or closed while the master's connector is offline (a silent connector never closes
//     anybody's trades by mistake).
//   - The follower's own limits: lot size, most copied trades open at once, most copied trades a day, and the
//     follower must accept the risk once. A follower follows ONE master at a time and cannot follow themselves.
//   - Both the follower (Alumni ID card) and the master (Staff ID card) are checked against the Students sheet.
//   - A copied trade is tagged in MT5 with the comment C<masterCode>-<masterTicket> (for example CM1-1234567), which
//     is how the website finds it again. Stopping to follow, or switching master, leaves the open copies open:
//     they are no longer managed, and the member manages them in MT5.
const crypto = require("crypto");

const MASTER_HEADERS = [
  "Master Code", "Reg Number", "Key Hash (do not edit)", "Linked At (Lagos)", "Display Name", "About", "Listed (Yes/No)",
  "Active (No blocks this master)", "Last Account Details (do not edit)", "Updated At (Lagos)", "Hosted On ABEC-FX VPS (Yes/No)",
];
const M = { code: 0, reg: 1, keyHash: 2, linkedAt: 3, name: 4, about: 5, listed: 6, active: 7, account: 8, updated: 9, hosted: 10 };
const FOLLOW_HEADERS = [
  "Reg Number", "Master Code", "Following (Yes/No)", "Lot Size", "Max Open Copied Trades", "Max Daily Copied Trades",
  "Followed At (UTC)", "Risk Accepted At (Lagos)", "Updated At (Lagos)",
];
const F = { reg: 0, master: 1, on: 2, lot: 3, maxOpen: 4, maxDaily: 5, since: 6, accepted: 7, updated: 8 };
const TRADE_HEADERS = [
  "Master Code", "Ticket", "Symbol", "Side", "Lots", "Open Time (UTC)", "Open Price", "Stop Loss", "Take Profit", "Status",
  "Close Time (UTC)", "Close Price", "Profit", "Recorded At (Lagos)", "Closing Deals (do not edit)",
];
const T = { code: 0, ticket: 1, symbol: 2, side: 3, lots: 4, openTime: 5, openPrice: 6, sl: 7, tp: 8, status: 9, closeTime: 10, closePrice: 11, profit: 12, recorded: 13, deals: 14 };
const ORDER_HEADERS = [
  "Reg Number", "Order ID", "Created At (UTC)", "Lagos Date", "Master Code", "Master Ticket", "Action", "Symbol", "Side", "Lot Size",
  "Stop Loss", "Take Profit", "Result", "Detail",
];

const KEY_PREFIX = "MK-";
const LIMITS = { lot: [0.01, 100], maxOpen: [1, 20], maxDaily: [1, 100] };
const DEFAULTS = { lot: 0.2, maxOpen: 3, maxDaily: 10 };
const OPEN_WINDOW_MS = 60 * 1000; // a copy is only opened this soon after the master's trade is seen
const ONLINE_MS = 30 * 1000; // a connector counts as online when it reported this recently
const RETRY_MS = 15 * 1000; // a change or close that got no answer is sent again after this
const MAX_TRIES = 5;
const RESULT_WAIT_MS = 3 * 60 * 1000;
const KEEP_ACTIVITY = 30;
const NAME_MAX = 40;
const ABOUT_MAX = 200;

class CopyError extends Error {
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
const sameNum = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
const price = (v) => String(Math.round(num(v) * 1e8) / 1e8);
const isoFromEpoch = (s) => (Number(s) > 0 ? new Date(Number(s) * 1000).toISOString() : "");
const yes = (v) => /^yes$/i.test(String(v || "").trim());
const tagOf = (code, ticket) => "C" + code + "-" + ticket;
const isMasterKey = (key) => String(key || "").startsWith(KEY_PREFIX);

// What a follower may set. Returns the checked values or throws a CopyError that names each problem.
function checkFollow(input, current) {
  const b = input || {};
  const errors = {};
  const out = { ...current };
  const field = (key, label, int) => {
    if (b[key] === undefined) return;
    const n = Number(b[key]);
    const [lo, hi] = LIMITS[key];
    if (!Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) {
      errors[key] = label + " must be " + (int ? "a whole number " : "a number ") + "from " + lo + " to " + hi + ".";
    } else out[key] = Math.round(n * 100) / 100;
  };
  field("lot", "Lot size", false);
  field("maxOpen", "Most trades open at once", true);
  field("maxDaily", "Most trades a day", true);
  if (b.master !== undefined) out.master = String(b.master || "").trim().toUpperCase();
  if (b.on !== undefined) out.on = b.on === true;
  if (out.on && !out.master) errors.master = "Choose a master to follow.";
  if (out.on && b.on === true && !current.accepted && b.acceptRisk !== true) errors.acceptRisk = "Tick the box to confirm you accept the risk.";
  if (Object.keys(errors).length) throw new CopyError(400, "Please fix the highlighted fields.", errors);
  return out;
}

// opts: enabled, now() (ms), today() (Lagos date text), stamp() (Lagos time text), isAlumni(reg) async, isStaff(reg) async,
//       nameOf(reg) async, connection(reg) async -> { linked, connected }, log
function create(store, opts = {}) {
  const now = opts.now || (() => Date.now());
  const stamp = opts.stamp || (() => new Date(now()).toISOString());
  const today = opts.today || (() => new Date(now()).toISOString().slice(0, 10));
  const isAlumni = opts.isAlumni || (async () => true);
  const isStaff = opts.isStaff || (async () => true);
  const nameOf = opts.nameOf || (async (reg) => reg);
  const connection = opts.connection || (async () => ({ linked: true, connected: true }));
  const log = opts.log || ((...a) => console.log("[copy]", ...a));

  const masters = new Map(); // master code -> master
  const masterByReg = new Map();
  const byKey = new Map(); // key hash -> master code
  const liveMasters = new Map(); // master code -> { seen, account, positions: Map(ticket -> position) }
  const trades = new Map(); // "code|ticket" -> { status, profit, deals: Set } (every row of Copy Master Trades)
  const follows = new Map(); // follower reg -> settings
  const liveFollowers = new Map(); // reg -> { seen, copied: [...] }
  const orders = new Map(); // order id -> order
  const opened = new Set(); // "reg|tag" an open was already sent for: a copy is never opened twice
  const activity = new Map(); // reg -> newest first
  const used = new Map(); // reg -> { date, count } copied trades opened today
  let ready = false;
  let chain = Promise.resolve();
  const queued = (task) => { const run = chain.then(task, task); chain = run.catch(() => {}); return run; };

  // ---------- reading the sheet ----------

  function masterFromRow({ cells }) {
    const g = (i) => cells[i] || "";
    const code = text(g(M.code), 12).toUpperCase();
    if (!code) return null;
    let account = null;
    try { account = g(M.account) ? JSON.parse(g(M.account)) : null; } catch (e) { account = null; }
    return {
      code, reg: normReg(g(M.reg)), keyHash: g(M.keyHash), linkedAt: g(M.linkedAt), name: g(M.name), about: g(M.about),
      listed: yes(g(M.listed)), active: !/^no$/i.test(g(M.active).trim()), hosted: yes(g(M.hosted)), account,
    };
  }

  function followFromRow({ cells }) {
    const g = (i) => cells[i] || "";
    const reg = normReg(g(F.reg));
    if (!reg) return null;
    const lim = (v, key, d) => { const x = Number(v); return Number.isFinite(x) && v !== "" ? Math.min(LIMITS[key][1], Math.max(LIMITS[key][0], x)) : d; };
    return {
      reg, master: text(g(F.master), 12).toUpperCase(), on: yes(g(F.on)), lot: lim(g(F.lot), "lot", DEFAULTS.lot),
      maxOpen: Math.round(lim(g(F.maxOpen), "maxOpen", DEFAULTS.maxOpen)), maxDaily: Math.round(lim(g(F.maxDaily), "maxDaily", DEFAULTS.maxDaily)),
      since: g(F.since), sinceMs: Date.parse(g(F.since)) || 0, accepted: g(F.accepted),
    };
  }

  async function init() {
    if (ready) return;
    for (const r of await store.tabRows("copymasters")) {
      const m = masterFromRow(r);
      if (!m) continue;
      masters.set(m.code, m);
      if (m.reg) masterByReg.set(m.reg, m.code);
      if (m.keyHash) byKey.set(m.keyHash, m.code);
    }
    for (const r of await store.tabRows("copyfollows")) {
      const f = followFromRow(r);
      if (f) follows.set(f.reg, f);
    }
    for (const { cells } of await store.tabRows("copytrades")) {
      const code = text(cells[T.code], 12).toUpperCase();
      const ticket = text(cells[T.ticket], 24);
      if (!code || !ticket) continue;
      trades.set(code + "|" + ticket, {
        status: /^closed$/i.test(cells[T.status] || "") ? "Closed" : "Open",
        profit: num(cells[T.profit]),
        hasProfit: String(cells[T.profit] || "") !== "",
        deals: new Set(String(cells[T.deals] || "").split(",").map((x) => x.trim()).filter(Boolean)),
      });
    }
    // what was already sent: a copy is never opened twice, and the day's count survives a restart
    const day = today();
    for (const { cells } of await store.tabRows("copyorders")) {
      const reg = normReg(cells[0]);
      if (!reg || cells[6] !== "Open") continue;
      opened.add(reg + "|" + tagOf(text(cells[4], 12).toUpperCase(), text(cells[5], 24)));
      if (cells[3] === day && /^Opened/i.test(cells[12] || "")) bump(reg, 1);
    }
    ready = true;
  }
  const ensure = async () => { if (!ready) await init(); };

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

  // Find a row by what it holds, fresh from the sheet: row numbers move when someone deletes a row by hand.
  async function locate(key, match) {
    const rows = await store.tabRows(key);
    for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i].cells)) return rows[i];
    return null;
  }

  // ---------- masters (staff and mentors) ----------

  const masterOfKey = (key) => byKey.get(hashKey(String(key || ""))) || "";

  function tradeStats(code) {
    let count = 0, wins = 0, profit = 0;
    for (const [k, t] of trades) {
      if (!k.startsWith(code + "|") || t.status !== "Closed" || !t.hasProfit) continue;
      count++;
      if (t.profit > 0) wins++;
      profit += t.profit;
    }
    return { trades: count, wins, winRate: count ? Math.round((wins / count) * 100) : null, profit: Math.round(profit * 100) / 100 };
  }
  const followerCount = (code) => [...follows.values()].filter((f) => f.on && f.master === code).length;

  async function masterView(regInput) {
    await ensure();
    const reg = normReg(regInput);
    const m = masters.get(masterByReg.get(reg));
    const base = { enabled: Boolean(opts.enabled), limits: { name: NAME_MAX, about: ABOUT_MAX }, exists: Boolean(m) };
    if (!m) return { ...base, linked: false, listed: false, name: await nameOf(reg), about: "", positions: [], followers: 0, stats: tradeStats("") };
    const l = liveMasters.get(m.code);
    const online = Boolean(l && now() - l.seen < ONLINE_MS);
    return {
      ...base, code: m.code, linked: Boolean(m.keyHash), linkedAt: m.linkedAt, name: m.name, about: m.about, listed: m.listed, active: m.active, hosted: m.hosted,
      connected: online, lastSeen: l ? new Date(l.seen).toISOString() : "", account: (l && l.account) || m.account || null,
      positions: l ? [...l.positions.values()].map((p) => ({ ticket: p.ticket, symbol: p.symbol, side: p.side, lots: p.lots, sl: p.sl, tp: p.tp, profit: p.profit })) : [],
      followers: followerCount(m.code), stats: tradeStats(m.code),
    };
  }

  // A new connection key for the master's own MT5. Shown once; only a hash is kept. Linking again replaces the old key.
  function masterLink(regInput) {
    return queued(async () => {
      await ensure();
      const reg = normReg(regInput);
      let m = masters.get(masterByReg.get(reg));
      const key = KEY_PREFIX + crypto.randomBytes(24).toString("base64url");
      if (!m) {
        let n = 0;
        for (const c of masters.keys()) n = Math.max(n, parseInt(c.slice(1), 10) || 0);
        const name = text(await nameOf(reg), NAME_MAX) || reg;
        m = { code: "M" + (n + 1), reg, keyHash: hashKey(key), linkedAt: stamp(), name, about: "", listed: false, active: true, hosted: false, account: null };
        await store.appendTabRows("copymasters", [[m.code, reg, m.keyHash, m.linkedAt, name, "", "No", "Yes", "", stamp(), "No"]]);
        masters.set(m.code, m);
        masterByReg.set(reg, m.code);
      } else {
        if (m.keyHash) byKey.delete(m.keyHash);
        m.keyHash = hashKey(key);
        m.linkedAt = stamp();
        m.account = null;
        liveMasters.delete(m.code);
        const row = await locate("copymasters", (c) => text(c[M.code], 12).toUpperCase() === m.code);
        if (row) await store.writeTabCells("copymasters", row.n, { [M.keyHash]: m.keyHash, [M.linkedAt]: m.linkedAt, [M.account]: "", [M.updated]: stamp() });
      }
      byKey.set(m.keyHash, m.code);
      return { key, code: m.code };
    });
  }

  function masterSettings(regInput, input) {
    return queued(async () => {
      await ensure();
      const reg = normReg(regInput);
      const m = masters.get(masterByReg.get(reg));
      if (!m || !m.keyHash) throw new CopyError(400, "Link your MetaTrader 5 account first.");
      const b = input || {};
      const errors = {};
      const next = { name: m.name, about: m.about, listed: m.listed };
      if (b.name !== undefined) {
        const n = text(b.name, NAME_MAX);
        if (n.length < 2) errors.name = "Enter the name followers will see (2 to " + NAME_MAX + " characters).";
        else next.name = n;
      }
      if (b.about !== undefined) next.about = text(b.about, ABOUT_MAX);
      if (b.listed !== undefined) next.listed = b.listed === true;
      if (next.listed && !m.active) errors.listed = "An admin has blocked this master.";
      if (Object.keys(errors).length) throw new CopyError(400, "Please fix the highlighted fields.", errors);
      Object.assign(m, next);
      const row = await locate("copymasters", (c) => text(c[M.code], 12).toUpperCase() === m.code);
      if (row) await store.writeTabCells("copymasters", row.n, { [M.name]: m.name, [M.about]: m.about, [M.listed]: m.listed ? "Yes" : "No", [M.updated]: stamp() });
      return masterView(reg);
    });
  }

  function masterDisconnect(regInput) {
    return queued(async () => {
      await ensure();
      const m = masters.get(masterByReg.get(normReg(regInput)));
      if (!m || !m.keyHash) return masterView(regInput);
      byKey.delete(m.keyHash);
      m.keyHash = "";
      m.listed = false;
      m.account = null;
      liveMasters.delete(m.code);
      const row = await locate("copymasters", (c) => text(c[M.code], 12).toUpperCase() === m.code);
      if (row) await store.writeTabCells("copymasters", row.n, { [M.keyHash]: "", [M.linkedAt]: "", [M.listed]: "No", [M.account]: "", [M.updated]: stamp() });
      return masterView(regInput);
    });
  }

  // The master's connector report. Records new trades, changes and closes in the sheet and keeps what is open
  // right now in memory for the followers' reports.
  function masterReport(code, body) {
    return queued(async () => {
      await ensure();
      const m = masters.get(code);
      if (!m || !m.keyHash) throw new CopyError(401, "This key is no longer valid.");
      const b = body || {};
      const acc = b.account || {};
      const account = {
        login: text(acc.login, 20), name: text(acc.name, 60), server: text(acc.server, 60), company: text(acc.company, 60), currency: text(acc.currency, 8),
        real: acc.real === true, balance: num(acc.balance), equity: num(acc.equity),
      };
      const list = (Array.isArray(b.positions) ? b.positions : []).slice(0, 100).map((p) => ({
        ticket: text(p.ticket, 24), symbol: text(p.symbol, 40), side: /sell/i.test(p.type) ? "SELL" : "BUY", lots: num(p.lots),
        openTime: isoFromEpoch(p.openTime), openPrice: num(p.openPrice), sl: num(p.sl), tp: num(p.tp), profit: num(p.profit), swap: num(p.swap),
      })).filter((p) => p.ticket);
      const prev = liveMasters.get(code);
      const first = !prev; // the first report since the website started: record what is open, copy none of it
      const map = new Map();
      const fresh = [];
      for (const p of list) {
        const old = prev && prev.positions.get(p.ticket);
        const known = trades.get(code + "|" + p.ticket);
        if (old) {
          map.set(p.ticket, { ...p, firstSeen: old.firstSeen, copyable: old.copyable });
          if (!sameNum(old.sl, p.sl) || !sameNum(old.tp, p.tp)) {
            try {
              const row = await locate("copytrades", (c) => text(c[T.code], 12).toUpperCase() === code && c[T.ticket] === p.ticket);
              if (row) await store.writeTabCells("copytrades", row.n, { [T.sl]: p.sl, [T.tp]: p.tp });
            } catch (e) { log("Could not save the stop loss change for", p.ticket, e.message); }
          }
        } else {
          map.set(p.ticket, { ...p, firstSeen: now(), copyable: !first && !known });
          if (!known) {
            fresh.push([code, p.ticket, p.symbol, p.side, p.lots, p.openTime, p.openPrice, p.sl, p.tp, "Open", "", "", "", stamp(), ""]);
            trades.set(code + "|" + p.ticket, { status: "Open", profit: 0, hasProfit: false, deals: new Set() });
          }
        }
      }
      if (fresh.length) {
        try { await store.appendTabRows("copytrades", fresh); } catch (e) { log("Could not save the master's new trades:", e.message); }
      }
      // trades that are no longer open: closed
      const gone = [];
      for (const [k, t] of trades) {
        if (!k.startsWith(code + "|") || t.status !== "Open") continue;
        if (!map.has(k.slice(code.length + 1))) gone.push(k.slice(code.length + 1));
      }
      for (const ticket of gone) {
        trades.get(code + "|" + ticket).status = "Closed";
        try {
          const row = await locate("copytrades", (c) => text(c[T.code], 12).toUpperCase() === code && c[T.ticket] === ticket);
          if (row) await store.writeTabCells("copytrades", row.n, { [T.status]: "Closed", [T.closeTime]: new Date(now()).toISOString() });
        } catch (e) { log("Could not mark the master's trade", ticket, "closed:", e.message); }
      }
      // closing deals give the close price and the profit; each deal is counted once
      for (const c of (Array.isArray(b.closed) ? b.closed : []).slice(0, 200)) {
        const ticket = text(c.position, 24);
        const deal = text(c.deal, 24);
        const t = trades.get(code + "|" + ticket);
        if (!t || !deal || t.deals.has(deal)) continue;
        t.deals.add(deal);
        t.profit = Math.round((t.profit + num(c.profit) + num(c.swap)) * 100) / 100;
        t.hasProfit = true;
        if (!map.has(ticket)) t.status = "Closed";
        try {
          const row = await locate("copytrades", (x) => text(x[T.code], 12).toUpperCase() === code && x[T.ticket] === ticket);
          if (row) {
            await store.writeTabCells("copytrades", row.n, {
              [T.status]: map.has(ticket) ? "Open" : "Closed", [T.closeTime]: isoFromEpoch(c.closeTime), [T.closePrice]: num(c.closePrice),
              [T.profit]: t.profit, [T.deals]: [...t.deals].join(","),
            });
          }
        } catch (e) { log("Could not save the profit of", ticket, e.message); }
      }
      liveMasters.set(code, { seen: now(), account, positions: map });
      if (account.login && (!m.account || m.account.login !== account.login || !m.savedAt || now() - m.savedAt > 10 * 60 * 1000)) {
        m.account = account;
        m.savedAt = now();
        try {
          const row = await locate("copymasters", (c) => text(c[M.code], 12).toUpperCase() === code);
          if (row) await store.writeTabCells("copymasters", row.n, { [M.account]: JSON.stringify(account) });
        } catch (e) { log("Could not save the master's account details:", e.message); }
      }
    });
  }

  // ---------- followers (alumni members) ----------

  async function followView(regInput) {
    await ensure();
    const reg = normReg(regInput);
    const f = follows.get(reg);
    const list = [];
    for (const m of masters.values()) {
      if (!m.keyHash || !m.listed || !m.active) continue;
      const l = liveMasters.get(m.code);
      list.push({
        code: m.code, name: m.name, about: m.about, hosted: m.hosted, online: Boolean(l && now() - l.seen < ONLINE_MS), openNow: l ? l.positions.size : 0,
        currency: (l && l.account && l.account.currency) || (m.account && m.account.currency) || "",
        followers: followerCount(m.code), stats: tradeStats(m.code), mine: Boolean(f && f.on && f.master === m.code),
        self: m.reg === reg,
      });
    }
    list.sort((a, b) => Number(b.online) - Number(a.online) || b.followers - a.followers || a.name.localeCompare(b.name));
    const lf = liveFollowers.get(reg);
    const master = f && masters.get(f.master);
    return {
      enabled: Boolean(opts.enabled),
      limits: LIMITS,
      masters: list,
      settings: f
        ? { master: f.master, masterName: master ? master.name : "", on: f.on, lot: f.lot, maxOpen: f.maxOpen, maxDaily: f.maxDaily, accepted: Boolean(f.accepted), since: f.since }
        : { master: "", masterName: "", on: false, ...DEFAULTS, accepted: false, since: "" },
      connection: await connection(reg),
      copied: lf ? lf.copied : [],
      activity: activity.get(reg) || [],
      today: { used: usedToday(reg), max: f ? f.maxDaily : DEFAULTS.maxDaily },
    };
  }

  // Start, change or stop following. input: { master, on, lot, maxOpen, maxDaily, acceptRisk }
  function saveFollow(regInput, input) {
    return queued(async () => {
      await ensure();
      const reg = normReg(regInput);
      const cur = follows.get(reg) || { reg, master: "", on: false, ...DEFAULTS, since: "", sinceMs: 0, accepted: "" };
      const next = checkFollow(input, cur);
      const errors = {};
      if (next.on) {
        const m = masters.get(next.master);
        if (!m || !m.keyHash || !m.listed || !m.active) errors.master = "That master is not available to follow.";
        else if (m.reg === reg) errors.master = "You cannot follow yourself.";
        const c = await connection(reg);
        if (!c.linked) errors.connection = "Link your MetaTrader 5 account first (Bot trading page, Account link).";
      }
      if (Object.keys(errors).length) throw new CopyError(400, "Please fix the highlighted fields.", errors);
      const startingNow = next.on && (!cur.on || cur.master !== next.master);
      const wasOn = cur.on;
      Object.assign(cur, { master: next.master, on: next.on, lot: next.lot, maxOpen: next.maxOpen, maxDaily: next.maxDaily });
      if (next.on && !cur.accepted) cur.accepted = stamp();
      if (startingNow) { cur.sinceMs = now(); cur.since = new Date(cur.sinceMs).toISOString(); }
      const cells = [reg, cur.master, cur.on ? "Yes" : "No", cur.lot, cur.maxOpen, cur.maxDaily, cur.since, cur.accepted, stamp()];
      const row = await locate("copyfollows", (c) => normReg(c[F.reg]) === reg);
      if (row) await store.writeTabCells("copyfollows", row.n, Object.fromEntries(cells.map((v, i) => [i, v])));
      else await store.appendTabRows("copyfollows", [cells]);
      follows.set(reg, cur);
      if (startingNow) note(reg, "info", "Now following " + (masters.get(cur.master) || {}).name + ". Only trades they open from now on are copied.");
      else if (wasOn && !cur.on) note(reg, "info", "Stopped following. Trades already open stay open: manage them in MT5.");
      else note(reg, "info", "Copy settings saved.");
      return followView(reg);
    });
  }

  // ---------- copying ----------

  function finishOrder(o, result, detail) {
    if (o.logged) return;
    o.logged = true;
    store.appendTabRows("copyorders", [[o.reg, o.id, new Date(o.createdAt).toISOString(), o.day, o.master, o.ticket, o.action, o.symbol, o.side, o.lots, o.sl, o.tp, result, text(detail, 200)]])
      .catch((e) => log("Could not save order", o.id, e.message));
  }

  function expire() {
    const t = now();
    for (const o of orders.values()) {
      if (o.status === "sent" && t > o.sentAt + RESULT_WAIT_MS) {
        o.status = "unknown";
        note(o.reg, "warn", "No answer from MT5 for the " + o.action.toLowerCase() + " of " + o.symbol + ". Check your MT5.");
        finishOrder(o, "No answer", "MT5 did not report back.");
      }
      if (o.status !== "sent" && t > o.createdAt + 10 * 60 * 1000) orders.delete(o.id);
    }
  }

  // An answer for a change or close is still awaited, or was sent too recently to send again; or it has failed too often.
  function holdBack(reg, tag, action, target) {
    const t = now();
    let tries = 0;
    for (const o of orders.values()) {
      if (o.reg !== reg || o.tag !== tag || o.action !== action || o.target !== target) continue;
      tries++;
      if (o.status === "sent" && t - o.sentAt < RETRY_MS) return true;
    }
    return tries >= MAX_TRIES;
  }

  function issue(f, mp, master, action, extra) {
    const id = "C" + now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();
    const o = {
      id, reg: f.reg, master: master.code, ticket: mp.ticket, tag: tagOf(master.code, mp.ticket), action, symbol: mp.symbol, side: mp.side,
      lots: action === "Open" ? f.lot : 0, sl: mp.sl, tp: mp.tp, createdAt: now(), sentAt: now(), status: "sent", day: today(), logged: false, target: "", ...extra,
    };
    orders.set(id, o);
    return o;
  }

  // Called with each report of an alumni member's connector (right after the Bot trading report). `body` is the same
  // report. Returns the lines to send back: COPYOPEN, COPYMOD or COPYCLOSE.
  function followerLines(regInput, body) {
    return queued(async () => {
      if (!opts.enabled) return [];
      await ensure();
      const reg = normReg(regInput);
      const b = body || {};
      const t = now();
      const copied = (Array.isArray(b.positions) ? b.positions : [])
        .filter((p) => /^C/.test(String(p.comment || "")))
        .map((p) => ({ ticket: text(p.ticket, 24), tag: text(p.comment, 31), symbol: text(p.symbol, 40), side: /sell/i.test(p.type) ? "SELL" : "BUY", lots: num(p.lots), sl: num(p.sl), tp: num(p.tp), profit: num(p.profit) }));
      liveFollowers.set(reg, { seen: t, copied });

      // what happened to the orders sent earlier
      for (const r of (Array.isArray(b.results) ? b.results : []).slice(0, 50)) {
        const o = orders.get(text(r.id, 40));
        if (!o || o.reg !== reg || (o.status !== "sent" && o.status !== "unknown")) continue;
        const ok = num(r.opened) > 0;
        o.status = ok ? "done" : "failed";
        const what = o.action === "Open" ? "Opened" : o.action === "Modify" ? "Updated" : "Closed";
        if (ok) {
          note(reg, "ok", what + " " + o.symbol + " " + o.side + (o.action === "Open" ? " " + o.lots + " lots" : "") + " (copying " + (masters.get(o.master) || {}).name + ").");
          finishOrder(o, what, r.error || "");
        } else {
          if (o.action === "Open") bump(reg, -1);
          note(reg, "error", "Could not " + o.action.toLowerCase() + " " + o.symbol + " " + o.side + ": " + text(r.error, 120));
          finishOrder(o, "Failed", r.error || "");
        }
      }
      expire();

      const f = follows.get(reg);
      if (!f || !f.on) return [];
      const m = masters.get(f.master);
      if (!m || !m.keyHash || !m.active) return [];
      const live = liveMasters.get(m.code);
      if (!live || t - live.seen > ONLINE_MS) return []; // the master is offline: change nothing
      if (!(await isAlumni(reg))) return [];
      const masterIsStaff = await isStaff(m.reg); // a master who lost the Staff ID card is no longer copied from

      const lines = [];
      const prefix = "C" + m.code + "-";
      const mine = copied.filter((p) => p.tag.startsWith(prefix));

      // follow the master's changes and closes
      for (const p of mine) {
        const mp = live.positions.get(p.tag.slice(prefix.length));
        if (!mp) {
          if (holdBack(reg, p.tag, "Close", "")) continue;
          const o = issue(f, { ticket: p.tag.slice(prefix.length), symbol: p.symbol, side: p.side, sl: p.sl, tp: p.tp }, m, "Close", {});
          lines.push(["COPYCLOSE", o.id, p.tag].join("|"));
          note(reg, "info", "The master closed " + p.symbol + ": closing your copy.");
        } else if (!sameNum(p.sl, mp.sl) || !sameNum(p.tp, mp.tp)) {
          const target = price(mp.sl) + "/" + price(mp.tp);
          if (holdBack(reg, p.tag, "Modify", target)) continue;
          const o = issue(f, mp, m, "Modify", { target });
          lines.push(["COPYMOD", o.id, p.tag, price(mp.sl), price(mp.tp)].join("|"));
          note(reg, "info", "The master changed the stop loss or take profit of " + mp.symbol + ": updating your copy.");
        }
      }

      // copy the master's new trades
      if (m.listed && masterIsStaff) {
        const openNow = copied.length + [...orders.values()].filter((o) => o.reg === reg && o.action === "Open" && o.status === "sent").length;
        let slots = f.maxOpen - openNow;
        for (const mp of live.positions.values()) {
          if (!mp.copyable || t - mp.firstSeen > OPEN_WINDOW_MS || mp.firstSeen < f.sinceMs) continue;
          if (!(mp.sl > 0)) continue; // a copy needs the master's stop loss: it is copied once the master has set one (still within the window)
          const tag = tagOf(m.code, mp.ticket);
          if (opened.has(reg + "|" + tag) || copied.some((p) => p.tag === tag)) continue;
          if (slots <= 0) { opened.add(reg + "|" + tag); note(reg, "warn", "Skipped " + mp.symbol + ": you already have " + f.maxOpen + " copied trades open."); continue; }
          if (usedToday(reg) >= f.maxDaily) { opened.add(reg + "|" + tag); note(reg, "warn", "Skipped " + mp.symbol + ": you reached your limit of " + f.maxDaily + " copied trades today."); continue; }
          opened.add(reg + "|" + tag);
          bump(reg, 1);
          slots--;
          const o = issue(f, mp, m, "Open", {});
          const ttl = Math.max(5, Math.ceil((OPEN_WINDOW_MS - (t - mp.firstSeen)) / 1000));
          lines.push(["COPYOPEN", o.id, mp.symbol, mp.side, f.lot.toFixed(2), price(mp.sl), price(mp.tp), ttl, tag].join("|"));
          note(reg, "info", "Copying " + m.name + ": " + mp.symbol + " " + mp.side + " " + f.lot.toFixed(2) + " lots.");
        }
      }
      return lines;
    });
  }

  return { init, masterOfKey, masterView, masterLink, masterSettings, masterDisconnect, masterReport, followView, saveFollow, followerLines };
}

module.exports = {
  create, checkFollow, tagOf, isMasterKey, KEY_PREFIX, LIMITS, DEFAULTS, OPEN_WINDOW_MS, ONLINE_MS,
  MASTER_HEADERS, FOLLOW_HEADERS, TRADE_HEADERS, ORDER_HEADERS, CopyError,
};
