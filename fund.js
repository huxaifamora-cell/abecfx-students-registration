// Funds: money pools that Alumni members can share in. The first one is the Palliative Fund, which sponsors new
// Alumni members so they can start trading. Later the copy-trading system will trade the pool and report its
// results here (see recordPerformance), so the pool grows and every member's share grows with it.
//
// HOW THE MONEY IS COUNTED (units, like a unit trust)
//   The fund is cut into UNITS. Whoever puts money in receives units at the current unit value. Nobody's units
//   change when the fund makes or loses money; the unit value does. So a member's share (units / all units) stays
//   the same until money moves in or out, and their amount (units x unit value) compounds with every result
//   the fund records. That is what lets a member see "how much is in the fund, and the percentage and amount
//   that is mine", and lets a member who joins later come in at a fair price instead of taking old profit.
//
//   RESERVE is a holder too: money paid into the fund that no member owns yet. The admin gives (allocates) part of
//   the reserve to a member as a sponsorship. Because the reserve holds units, the percentages always add to 100%.
//
// Everything is one append-only LEDGER (sheet tab "Fund Ledger"). The state of a fund is always worked out by
// replaying the ledger from the top, so the sheet is the single source of truth and nothing can drift. Only the
// Type, Holder and Amount columns are read back; the other columns (units, value after ...) are for human eyes.
//
//   deposit      money paid into the fund for a holder (a member or RESERVE); the holder gets units
//   allocate     a sponsorship: units move from RESERVE to a member
//   performance  the fund made (+) or lost (-) money; changes the value, not the units
//   withdrawal   money paid out to a member; their units are removed
//
// Withdrawals are asked for by the member (tab "Fund Withdrawals") and paid by the admin, who then marks them paid;
// only then does the ledger record the withdrawal, at the unit value of that moment.
const crypto = require("crypto");

// The funds that exist. To add another fund, add it here (the pages and the sheet follow).
const FUNDS = [
  {
    id: "palliative",
    name: "Palliative Fund",
    tagline: "Sponsorship for new Alumni members starting to trade",
    description:
      "The Palliative Fund sponsors new Alumni members so they can start trading with real capital behind them. The fund is grown by the ABEC-FX copy-trading system, and every member's share grows with it.",
  },
];

const RESERVE = "RESERVE";
const TYPES = ["deposit", "allocate", "performance", "withdrawal"];
const LEDGER_HEADERS = [
  "Entry ID", "Fund", "Date (Lagos)", "Type", "Holder (Reg Number or RESERVE)", "Amount", "Units",
  "Fund Value After", "Total Units After", "Unit Value After", "Source", "Ref", "Note", "By",
];
const L = { id: 0, fund: 1, date: 2, type: 3, holder: 4, amount: 5, units: 6, valueAfter: 7, unitsAfter: 8, unitValue: 9, source: 10, ref: 11, note: 12, by: 13 };

const WITHDRAWAL_HEADERS = [
  "Request ID", "Fund", "Reg Number", "Requested At (Lagos)", "Amount", "Withdraw Everything", "Payout Details",
  "Status", "Decided At (Lagos)", "Decided By", "Note", "Amount Paid", "Units Removed", "Ledger Entry",
];
const W = { id: 0, fund: 1, reg: 2, at: 3, amount: 4, all: 5, details: 6, status: 7, decidedAt: 8, decidedBy: 9, note: 10, paid: 11, units: 12, entry: 13 };
const STATUSES = ["Pending", "Paid", "Rejected", "Cancelled"];

const MIN_MONEY = 0.01;
const MAX_MONEY = 100000000;
const CACHE_MS = 8000;
const HISTORY_POINTS = 120;

class FundError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r6 = (n) => Math.round((Number(n) + Number.EPSILON) * 1e6) / 1e6;
const normReg = (v) => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "");
const oneLine = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const newId = (prefix) => prefix + "-" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString("hex").toUpperCase();

function fundById(id) {
  return FUNDS.find((f) => f.id === String(id || "").trim().toLowerCase()) || null;
}

// Read an amount of money someone typed. Returns a number rounded to 2 places, or throws a FundError for `field`.
function money(v, field, { allowNegative = false, label = "Amount" } = {}) {
  const s = typeof v === "string" ? v.replace(/[,\s]/g, "") : v;
  const n = Number(s);
  if (s === "" || s == null || !Number.isFinite(n)) throw new FundError(400, "Please fix the highlighted field.", { [field]: label + " must be a number." });
  const x = r2(n);
  if (allowNegative) {
    if (x === 0 || Math.abs(x) > MAX_MONEY) throw new FundError(400, "Please fix the highlighted field.", { [field]: label + " must not be 0, and must be under " + MAX_MONEY.toLocaleString("en-US") + "." });
  } else if (x < MIN_MONEY || x > MAX_MONEY) {
    throw new FundError(400, "Please fix the highlighted field.", { [field]: label + " must be from " + MIN_MONEY + " to " + MAX_MONEY.toLocaleString("en-US") + "." });
  }
  return x;
}

// ---------- The state of one fund, worked out from its ledger entries ----------
function emptyState() {
  return { value: 0, units: 0, holders: new Map(), history: [], applied: 0, problems: [], refs: new Set() };
}
const unitValueOf = (s) => (s.units > 0 ? s.value / s.units : 1);
function holderOf(s, h) {
  if (!s.holders.has(h)) s.holders.set(h, { units: 0, in: 0, out: 0 });
  return s.holders.get(h);
}
const holderValue = (s, h) => (s.holders.has(h) ? r2(s.holders.get(h).units * unitValueOf(s)) : 0);

// Apply one entry to the state. Returns what it did ({ amount, units }) or throws a FundError saying why it cannot be.
// Used both to replay the ledger and to check a new entry before it is written, so the two can never disagree.
function apply(s, e) {
  const nav = unitValueOf(s);
  if (e.type === "deposit") {
    if (!e.holder) throw new FundError(400, "Choose who the money is for.");
    if (s.units > 0 && s.value <= 0) throw new FundError(409, "The fund has no value left, so money cannot be added until that is sorted out.");
    const units = r6(e.amount / nav);
    if (units <= 0) throw new FundError(400, "That amount is too small.");
    const h = holderOf(s, e.holder);
    h.units = r6(h.units + units); h.in = r2(h.in + e.amount);
    s.units = r6(s.units + units); s.value = r2(s.value + e.amount);
    return { amount: e.amount, units };
  }
  if (e.type === "allocate") {
    if (!e.holder || e.holder === RESERVE) throw new FundError(400, "Choose the member to sponsor.");
    const res = holderOf(s, RESERVE);
    const worth = r2(res.units * nav);
    if (e.amount > worth + 0.005) throw new FundError(409, "The reserve only holds " + worth.toFixed(2) + ". Add money to the reserve first.");
    let units = r6(e.amount / nav);
    if (units > res.units || Math.abs(worth - e.amount) <= 0.005) units = res.units;
    if (units <= 0) throw new FundError(400, "That amount is too small.");
    const h = holderOf(s, e.holder);
    res.units = r6(res.units - units); res.out = r2(res.out + e.amount);
    h.units = r6(h.units + units); h.in = r2(h.in + e.amount);
    return { amount: e.amount, units };
  }
  if (e.type === "performance") {
    if (s.units <= 0) throw new FundError(409, "There is no money in the fund yet, so there is nothing to grow.");
    const value = r2(s.value + e.amount);
    if (value < 0) throw new FundError(409, "That loss is bigger than the fund (" + s.value.toFixed(2) + ").");
    s.value = value;
    return { amount: e.amount, units: 0 };
  }
  if (e.type === "withdrawal") {
    if (!e.holder || e.holder === RESERVE) throw new FundError(400, "Choose the member.");
    const h = holderOf(s, e.holder);
    const worth = r2(h.units * nav);
    if (e.amount > worth + 0.005) throw new FundError(409, "That is more than the member's share, which is worth " + worth.toFixed(2) + ".");
    let units = r6(e.amount / nav);
    let amount = e.amount;
    if (units >= h.units || Math.abs(worth - e.amount) <= 0.005) { units = h.units; amount = worth; }
    if (units <= 0) throw new FundError(400, "That amount is too small.");
    h.units = r6(h.units - units); h.out = r2(h.out + amount);
    s.units = r6(s.units - units); s.value = r2(Math.max(0, s.value - amount));
    if (s.units <= 0) { s.units = 0; s.value = 0; }
    return { amount, units };
  }
  throw new FundError(400, "Unknown entry type.");
}

function parseEntry(cells) {
  const type = String(cells[L.type] || "").trim().toLowerCase();
  const amount = Number(String(cells[L.amount] || "").replace(/,/g, ""));
  return {
    id: String(cells[L.id] || "").trim(), type, holder: normReg(cells[L.holder]), amount: Number.isFinite(amount) ? amount : NaN,
    date: String(cells[L.date] || ""), source: String(cells[L.source] || ""), ref: String(cells[L.ref] || ""),
    note: String(cells[L.note] || ""), by: String(cells[L.by] || ""),
  };
}

// Replay every entry of one fund, in sheet order. A row that cannot be applied (typed wrongly by hand) is skipped and
// listed in `problems` so the admin can see it, instead of breaking the whole fund.
function replay(rows, fundId) {
  const s = emptyState();
  const entries = [];
  for (const { n, cells } of rows) {
    if (String(cells[L.fund] || "").trim().toLowerCase() !== fundId) continue;
    const e = parseEntry(cells);
    e.n = n;
    if (!TYPES.includes(e.type) || !Number.isFinite(e.amount) || e.amount === 0 || (e.type !== "performance" && e.amount < 0)) {
      s.problems.push("Row " + n + ": the type or amount is not valid, so it was skipped.");
      continue;
    }
    try {
      const out = apply(s, e);
      e.units = out.units;
      e.amount = out.amount;
    } catch (err) {
      s.problems.push("Row " + n + ": " + err.message + " It was skipped.");
      continue;
    }
    e.valueAfter = s.value; e.unitsAfter = s.units; e.unitValue = r6(unitValueOf(s));
    if (e.ref) s.refs.add(e.source + "|" + e.ref);
    s.applied++;
    entries.push(e);
    if (e.type === "performance" || s.history.length === 0) s.history.push({ date: e.date, unitValue: e.unitValue, value: s.value });
  }
  s.entries = entries;
  return s;
}

// ---------- The service ----------
// opts: stamp() Lagos time text, now() ms, currency, nameOf(reg) async -> full name, isAlumni(reg) async -> bool
function create(store, opts = {}) {
  const now = opts.now || (() => Date.now());
  const stamp = opts.stamp || (() => new Date(now()).toISOString());
  const currency = opts.currency || "USD";
  const nameOf = opts.nameOf || (async () => "");
  const isAlumni = opts.isAlumni || (async () => true);
  const log = opts.log || ((...a) => console.log("[fund]", ...a));

  let chain = Promise.resolve();
  const queued = (task) => { const run = chain.then(task, task); chain = run.catch(() => {}); return run; };
  let cache = { at: 0, rows: null };
  const invalidate = () => { cache = { at: 0, rows: null }; };

  async function ledgerRows(fresh) {
    if (!fresh && cache.rows && now() - cache.at < CACHE_MS) return cache.rows;
    const rows = await store.tabRows("fundledger");
    cache = { at: now(), rows };
    return rows;
  }
  const withdrawalRows = async () => (await store.tabRows("fundwithdrawals")).map(({ n, cells }) => ({ n, ...parseRequest(cells) }));

  function parseRequest(c) {
    return {
      id: String(c[W.id] || "").trim(), fund: String(c[W.fund] || "").trim().toLowerCase(), reg: normReg(c[W.reg]), at: String(c[W.at] || ""),
      amount: Number(c[W.amount]) || 0, all: /^yes$/i.test(String(c[W.all] || "")), details: String(c[W.details] || ""),
      status: STATUSES.includes(String(c[W.status] || "").trim()) ? String(c[W.status]).trim() : "Pending",
      decidedAt: String(c[W.decidedAt] || ""), decidedBy: String(c[W.decidedBy] || ""), note: String(c[W.note] || ""),
      paid: Number(c[W.paid]) || 0, units: Number(c[W.units]) || 0, entry: String(c[W.entry] || ""),
    };
  }

  function need(fundId) {
    const f = fundById(fundId);
    if (!f) throw new FundError(404, "That fund does not exist.");
    return f;
  }

  const fundCard = (f) => ({ id: f.id, name: f.name, tagline: f.tagline, description: f.description });

  // Write one ledger entry (inside the queue). Checks it against the freshly replayed state first.
  async function post(fundId, entry, by) {
    const rows = await ledgerRows(true);
    const s = replay(rows, fundId);
    if (entry.ref && s.refs.has((entry.source || "") + "|" + entry.ref)) return { duplicate: true };
    const out = apply(s, entry); // throws a FundError if it cannot be done
    const id = newId("FL");
    const unitValue = r6(unitValueOf(s));
    await store.appendTabRows("fundledger", [[
      id, fundId, stamp(), entry.type, entry.holder || "", out.amount, out.units, s.value, s.units, unitValue,
      entry.source || "manual", entry.ref || "", oneLine(entry.note, 200), oneLine(by, 60),
    ]]);
    invalidate();
    return { id, amount: out.amount, units: out.units, fundValue: s.value, unitValue };
  }

  // ---- One member's numbers inside a replayed fund ----
  function holdingOf(s, reg, pending) {
    const nav = unitValueOf(s);
    const h = s.holders.get(reg) || { units: 0, in: 0, out: 0 };
    const value = r2(h.units * nav);
    const gain = r2(value + h.out - h.in);
    return {
      units: h.units, sharePct: s.units > 0 ? Math.round((h.units / s.units) * 1e6) / 1e4 : 0, value,
      putIn: h.in, withdrawn: h.out, gain, gainPct: h.in > 0 ? Math.round((gain / h.in) * 1e4) / 100 : 0,
      pending: r2(pending), available: r2(Math.max(0, value - pending)),
    };
  }

  const totalsOf = (s) => {
    const members = Array.from(s.holders.entries()).filter(([k, h]) => k !== RESERVE && h.units > 0).length;
    const nav = unitValueOf(s);
    return {
      value: s.value, units: s.units, unitValue: r6(nav), growthPct: Math.round((nav - 1) * 1e4) / 100, members,
      reserve: holderValue(s, RESERVE), reservePct: s.units > 0 ? Math.round(((s.holders.get(RESERVE) || { units: 0 }).units / s.units) * 1e4) / 100 : 0,
    };
  };

  const historyOf = (s) => {
    const h = s.history.length ? s.history : [];
    const start = h.length > HISTORY_POINTS ? h.slice(h.length - HISTORY_POINTS) : h;
    return start.map((p) => ({ date: p.date, unitValue: p.unitValue }));
  };

  return {
    FUNDS, RESERVE, currency,

    list() { return FUNDS.map(fundCard); },

    // What an Alumni member sees: the fund as a whole and their own share. Never anyone else's share.
    async memberView(fundId, reg) {
      const f = need(fundId);
      reg = normReg(reg);
      const [rows, wds] = await Promise.all([ledgerRows(false), withdrawalRows()]);
      const s = replay(rows, f.id);
      const mine = wds.filter((w) => w.fund === f.id && w.reg === reg);
      const pending = mine.filter((w) => w.status === "Pending");
      const pendingSum = pending.reduce((a, w) => a + (w.all ? holderValue(s, reg) : w.amount), 0);
      return {
        fund: fundCard(f), currency,
        totals: (({ value, unitValue, growthPct, members }) => ({ value, unitValue, growthPct, members }))(totalsOf(s)),
        me: holdingOf(s, reg, Math.min(pendingSum, holderValue(s, reg))),
        history: historyOf(s),
        activity: s.entries.filter((e) => e.holder === reg).slice(-40).reverse().map((e) => ({
          id: e.id, date: e.date, type: e.type, amount: e.amount, units: e.units, unitValue: e.unitValue, note: e.note,
        })),
        results: s.entries.filter((e) => e.type === "performance").slice(-20).reverse().map((e) => ({ date: e.date, amount: e.amount, unitValue: e.unitValue, source: e.source })),
        withdrawals: mine.slice().reverse().slice(0, 20).map((w) => ({
          id: w.id, at: w.at, amount: w.all && w.status === "Pending" ? holderValue(s, reg) : (w.status === "Paid" ? w.paid : w.amount), all: w.all,
          status: w.status, decidedAt: w.decidedAt, note: w.status === "Paid" || w.status === "Rejected" ? w.note : "",
        })),
        canWithdraw: holderValue(s, reg) > 0 && pending.length === 0,
      };
    },

    // Every fund with its headline numbers and this member's share (for the list on the portal page).
    async memberList(reg) {
      reg = normReg(reg);
      const rows = await ledgerRows(false);
      return FUNDS.map((f) => {
        const s = replay(rows, f.id);
        const t = totalsOf(s);
        return { ...fundCard(f), currency, value: t.value, growthPct: t.growthPct, myValue: holderValue(s, reg), mySharePct: holdingOf(s, reg, 0).sharePct };
      });
    },

    // The admin's view: every holder with their share, pending withdrawals and the latest ledger entries.
    async adminView(fundId) {
      const f = need(fundId);
      const [rows, wds] = await Promise.all([ledgerRows(true), withdrawalRows()]);
      const s = replay(rows, f.id);
      const holders = [];
      for (const [reg, h] of s.holders.entries()) {
        if (h.units <= 0 && h.in === 0 && h.out === 0) continue;
        const hold = holdingOf(s, reg, 0);
        holders.push({ reg, name: reg === RESERVE ? "Fund reserve (not yet given to a member)" : await nameOf(reg), ...hold });
      }
      holders.sort((a, b) => (a.reg === RESERVE ? -1 : b.reg === RESERVE ? 1 : b.value - a.value));
      const requests = [];
      for (const w of wds.filter((x) => x.fund === f.id).reverse().slice(0, 60)) {
        const worth = holderValue(s, w.reg);
        requests.push({ ...w, name: await nameOf(w.reg), worth, amountNow: w.all && w.status === "Pending" ? worth : w.amount });
      }
      return {
        fund: fundCard(f), currency, totals: totalsOf(s), holders, requests, problems: s.problems,
        history: historyOf(s),
        ledger: s.entries.slice(-60).reverse().map((e) => ({ id: e.id, date: e.date, type: e.type, holder: e.holder, amount: e.amount, units: e.units, valueAfter: e.valueAfter, unitValue: e.unitValue, source: e.source, note: e.note, by: e.by })),
      };
    },

    // ---- Admin actions. Each one goes through the queue so two admins can never work on stale numbers. ----
    deposit(fundId, body, by) {
      return queued(async () => {
        need(fundId);
        const b = body || {};
        const amount = money(b.amount, "amount");
        const holder = normReg(b.holder) || RESERVE;
        if (holder !== RESERVE && !(await isAlumni(holder))) throw new FundError(400, "Please fix the highlighted field.", { holder: "That registration number is not an Alumni member." });
        return post(fundId, { type: "deposit", holder, amount, note: b.note, source: "manual" }, by);
      });
    },

    allocate(fundId, body, by) {
      return queued(async () => {
        need(fundId);
        const b = body || {};
        const amount = money(b.amount, "amount");
        const holder = normReg(b.holder);
        if (!holder || holder === RESERVE || !(await isAlumni(holder))) throw new FundError(400, "Please fix the highlighted field.", { holder: "Enter the registration number of an Alumni member." });
        return post(fundId, { type: "allocate", holder, amount, note: b.note, source: "manual" }, by);
      });
    },

    // The fund made or lost money. Give `amount` (+ profit, - loss), or `newValue` (what the fund is worth now).
    // The copy-trading system will call this too, with source "copytrading" and a ref (e.g. a day or a batch id) so
    // that sending the same result twice records it once.
    performance(fundId, body, by) {
      return queued(async () => {
        need(fundId);
        const b = body || {};
        let amount;
        if (b.newValue !== undefined && b.newValue !== "" && b.newValue !== null) {
          const target = money(b.newValue, "newValue", { label: "The fund's value" });
          const s = replay(await ledgerRows(true), fundId);
          amount = r2(target - s.value);
          if (amount === 0) throw new FundError(400, "Please fix the highlighted field.", { newValue: "That is what the fund is already worth." });
        } else {
          amount = money(b.amount, "amount", { allowNegative: true, label: "The result" });
        }
        return post(fundId, { type: "performance", amount, note: b.note, source: oneLine(b.source, 30) || "manual", ref: oneLine(b.ref, 60) }, by);
      });
    },

    // The member asks to take money out. Nothing moves yet: the admin pays and then marks it paid.
    requestWithdrawal(fundId, reg, body) {
      return queued(async () => {
        need(fundId);
        reg = normReg(reg);
        const b = body || {};
        const all = b.all === true;
        const details = oneLine(b.details, 300);
        const errors = {};
        if (details.length < 5) errors.details = "Tell us where to send the money (bank account or wallet details).";
        const [rows, wds] = await Promise.all([ledgerRows(true), withdrawalRows()]);
        const s = replay(rows, fundId);
        const worth = holderValue(s, reg);
        if (worth <= 0) throw new FundError(409, "You have no money in this fund to withdraw.");
        if (wds.some((w) => w.fund === fundId && w.reg === reg && w.status === "Pending")) throw new FundError(409, "You already have a withdrawal waiting. Cancel it first if you want to change it.");
        let amount = worth;
        if (!all) {
          try { amount = money(b.amount, "amount"); } catch (e) { Object.assign(errors, e.fields || {}); }
          if (!errors.amount && amount > worth + 0.005) errors.amount = "You can withdraw up to " + worth.toFixed(2) + " " + currency + ".";
        }
        if (Object.keys(errors).length) throw new FundError(400, "Please fix the highlighted fields.", errors);
        const id = newId("WD");
        await store.appendTabRows("fundwithdrawals", [[id, fundId, reg, stamp(), amount, all ? "Yes" : "", details, "Pending", "", "", "", "", "", ""]]);
        return { id, amount, all };
      });
    },

    cancelWithdrawal(fundId, reg, requestId) {
      return queued(async () => {
        reg = normReg(reg);
        const w = (await withdrawalRows()).find((x) => x.id === String(requestId || "") && x.fund === fundId && x.reg === reg);
        if (!w) throw new FundError(404, "That withdrawal request was not found.");
        if (w.status !== "Pending") throw new FundError(409, "That request is already " + w.status.toLowerCase() + ".");
        await store.writeTabCells("fundwithdrawals", w.n, { [W.status]: "Cancelled", [W.decidedAt]: stamp(), [W.decidedBy]: reg });
        return { ok: true };
      });
    },

    // The admin has sent the money: take it out of the fund at today's unit value and mark the request Paid.
    // `body.amount` may be lower than asked (never higher than the member's share).
    payWithdrawal(fundId, requestId, body, by) {
      return queued(async () => {
        need(fundId);
        const w = (await withdrawalRows()).find((x) => x.id === String(requestId || "") && x.fund === fundId);
        if (!w) throw new FundError(404, "That withdrawal request was not found.");
        if (w.status !== "Pending") throw new FundError(409, "That request is already " + w.status.toLowerCase() + ".");
        const s = replay(await ledgerRows(true), fundId);
        const worth = holderValue(s, w.reg);
        const already = s.entries.some((e) => e.type === "withdrawal" && e.note.indexOf("Withdrawal " + w.id) === 0);
        if (worth <= 0 && !already) throw new FundError(409, "This member has no money left in the fund. Reject the request.");
        let amount = w.all ? worth : Math.min(w.amount, worth);
        if (body && body.amount !== undefined && body.amount !== "") {
          amount = money(body.amount, "amount");
          if (amount > worth + 0.005) throw new FundError(400, "Please fix the highlighted field.", { amount: "The member's share is only worth " + worth.toFixed(2) + " now." });
        }
        const note = oneLine(body && body.note, 200);
        // If an earlier attempt already took the money out of the fund but could not mark the request (a sheet hiccup),
        // finish that one instead of taking the money out twice.
        const earlier = s.entries.find((e) => e.type === "withdrawal" && e.note.indexOf("Withdrawal " + w.id) === 0);
        const done = earlier
          ? { id: earlier.id, amount: earlier.amount, units: earlier.units }
          : await post(fundId, { type: "withdrawal", holder: w.reg, amount, note: "Withdrawal " + w.id + (note ? " - " + note : "") }, by);
        await store.writeTabCells("fundwithdrawals", w.n, {
          [W.status]: "Paid", [W.decidedAt]: stamp(), [W.decidedBy]: oneLine(by, 60), [W.note]: note, [W.paid]: done.amount, [W.units]: done.units, [W.entry]: done.id,
        });
        return { ok: true, paid: done.amount, units: done.units, entry: done.id };
      });
    },

    rejectWithdrawal(fundId, requestId, body, by) {
      return queued(async () => {
        need(fundId);
        const w = (await withdrawalRows()).find((x) => x.id === String(requestId || "") && x.fund === fundId);
        if (!w) throw new FundError(404, "That withdrawal request was not found.");
        if (w.status !== "Pending") throw new FundError(409, "That request is already " + w.status.toLowerCase() + ".");
        const note = oneLine(body && body.note, 200);
        if (note.length < 3) throw new FundError(400, "Please fix the highlighted field.", { note: "Say why, so the member knows." });
        await store.writeTabCells("fundwithdrawals", w.n, { [W.status]: "Rejected", [W.decidedAt]: stamp(), [W.decidedBy]: oneLine(by, 60), [W.note]: note });
        return { ok: true };
      });
    },

    // True when this registration number holds money in any fund or has any fund record. A person like that must not be
    // deleted from the Database, or the ledger would point at nobody.
    async hasRecords(reg) {
      reg = normReg(reg);
      const rows = await store.tabRows("fundledger");
      if (rows.some((r) => normReg(r.cells[L.holder]) === reg)) return true;
      return (await store.tabRows("fundwithdrawals")).some((r) => normReg(r.cells[W.reg]) === reg);
    },
  };
}

module.exports = {
  create, FundError, FUNDS, RESERVE, TYPES, STATUSES, LEDGER_HEADERS, WITHDRAWAL_HEADERS, L, W,
  // exposed for the tests
  replay, apply, money, unitValueOf,
};
