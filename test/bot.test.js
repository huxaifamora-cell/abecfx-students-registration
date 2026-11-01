// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const bot = require("../bot");
const { createMemoryStore } = require("./support/memory-store");

const A = "ABECFX/26/0005";
const B = "ABECFX/26/0006";
const ACC = { login: "40001", name: "Ada", server: "Deriv-Demo", company: "Deriv", currency: "USD", leverage: 500, real: false, balance: 1000, equity: 1010, margin: 5, freeMargin: 1005, profit: 10 };
const alert = (over = {}) => ({ market: "Boom 1000", group: "boom", type: "SELL", tf: "M30", first: true, ...over });

function setup(over = {}) {
  const store = createMemoryStore();
  const clock = { t: Date.parse("2026-11-02T10:00:00Z") };
  const svc = bot.create(store, { enabled: true, now: () => clock.t, today: () => "2026-11-02", stamp: () => "02 Nov 2026, 11:00:00", log: () => {}, ...over });
  return { store, svc, clock };
}
const on = { on: true, acceptRisk: true, lot: 0.5, sl: 20, tp: 40, positions: 2, daily: 3, groups: ["boom", "crash"] };
// a member with a linked, connected account and the bot on
async function member(s, reg = A, settings = on) {
  await s.svc.saveSettings(reg, settings);
  const { key } = await s.svc.link(reg);
  await s.svc.report(s.svc.regOfKey(key), { account: ACC, positions: [] });
  return key;
}

test("settings: limits are checked, and the bot needs a stop loss and the risk box before it can be switched on", async () => {
  const { svc } = setup();
  await assert.rejects(svc.saveSettings(A, { lot: 0, sl: 5, positions: 2.5, daily: 0, groups: [] }), (e) => e.status === 400 && Boolean(e.fields.lot && e.fields.positions && e.fields.daily && e.fields.groups));
  await assert.rejects(svc.saveSettings(A, { on: true }), (e) => Boolean(e.fields.acceptRisk));
  await assert.rejects(svc.saveSettings(A, { on: true, acceptRisk: true, sl: 0 }), (e) => Boolean(e.fields.sl));
  const v = await svc.saveSettings(A, on);
  assert.equal(v.settings.on, true);
  assert.equal(v.settings.accepted, true);
  assert.deepEqual(v.settings.groups, ["boom", "crash"]);
  const again = await svc.saveSettings(A, { lot: 1 }); // no need to tick the box again
  assert.equal(again.settings.lot, 1);
});

test("linking gives a key shown once; a new key replaces the old one; disconnecting cancels it and switches the bot off", async () => {
  const { svc } = setup();
  await svc.saveSettings(A, on);
  const { key } = await svc.link(A);
  assert.match(key, /^BK-/);
  assert.equal(svc.regOfKey(key), A);
  assert.equal((await svc.view(A)).linked, true);
  const second = await svc.link(A);
  assert.equal(svc.regOfKey(key), "", "the old key stops working");
  assert.equal(svc.regOfKey(second.key), A);
  const v = await svc.disconnect(A);
  assert.equal(v.linked, false);
  assert.equal(v.settings.on, false);
  assert.equal(svc.regOfKey(second.key), "");
  await assert.rejects(svc.report(A, { account: ACC }), (e) => e.status === 401);
});

test("the connector's report fills in the account, open trades and floating profit; closed trades are kept once", async () => {
  const s = setup();
  const key = await member(s);
  const reg = s.svc.regOfKey(key);
  const body = {
    account: ACC,
    positions: [{ ticket: "1", symbol: "Boom 1000 Index", type: "SELL", lots: 0.5, openTime: 1790000000, openPrice: 100, sl: 110, tp: 90, profit: 4.5, swap: -0.5, comment: "O1" }],
    closed: [{ position: "9", deal: "77", symbol: "Crash 500 Index", type: "BUY", lots: 0.2, openTime: 1789990000, openPrice: 50, closeTime: 1789999000, closePrice: 52, profit: 8, swap: 0, comment: "O0" }],
  };
  await s.svc.report(reg, body);
  await s.svc.report(reg, body); // sent again: not saved twice
  const v = await s.svc.view(A);
  assert.equal(v.connected, true);
  assert.equal(v.account.login, "40001");
  assert.equal(v.account.real, false);
  assert.equal(v.positions.length, 1);
  assert.equal(v.floating, 4);
  assert.equal(v.history.length, 1);
  assert.equal(v.historyProfit, 8);
  assert.equal(s.store.data.bottrades.length, 1);
  s.clock.t += 31000;
  assert.equal((await s.svc.view(A)).connected, false, "not reporting for 30 seconds: offline");
});

test("a first alert becomes one order for the member, sent to the connector once, and the result is recorded", async () => {
  const s = setup();
  const key = await member(s);
  const reg = s.svc.regOfKey(key);
  assert.equal(await s.svc.onAlert(alert({ first: false })), 0, "reminders place no trades");
  assert.equal(await s.svc.onAlert(alert({ group: "volatility", market: "Volatility 75 Index" })), 0, "index type not chosen");
  assert.equal(await s.svc.onAlert(alert()), 1);
  assert.equal(await s.svc.onAlert(alert({ tf: "H1" })), 0, "already waiting for this market");
  const lines = await s.svc.report(reg, { account: ACC, positions: [] });
  assert.equal(lines.length, 1);
  const p = lines[0].split("|");
  assert.deepEqual(p.slice(0, 2).map((x, i) => (i === 0 ? x : "id")), ["ORDER", "id"]);
  assert.deepEqual(p.slice(2, 8), ["Boom 1000 Index", "SELL", "0.50", "20.00", "40.00", "2"]);
  assert.equal((await s.svc.report(reg, { account: ACC, positions: [] })).length, 0, "an order goes out once");
  await s.svc.report(reg, { account: ACC, positions: [], results: [{ id: p[1], opened: 2, error: "" }] });
  const v = await s.svc.view(A);
  assert.match(v.activity[0].message, /Opened 2 positions/);
  assert.equal(v.today.used, 1);
  assert.equal(s.store.data.botorders.length, 1);
  assert.equal(s.store.data.botorders[0][10], "Opened");
});

test("no order while the member is already in that market, offline, switched off, or past the daily limit", async () => {
  const s = setup();
  const key = await member(s, A, { ...on, daily: 1 });
  const reg = s.svc.regOfKey(key);
  await s.svc.report(reg, { account: ACC, positions: [{ ticket: "1", symbol: "Boom 1000 Index", type: "SELL", lots: 0.5, profit: 0, swap: 0 }] });
  assert.equal(await s.svc.onAlert(alert()), 0, "already holds a Boom 1000 position");
  assert.equal(await s.svc.onAlert(alert({ market: "Boom 500" })), 1);
  assert.equal(await s.svc.onAlert(alert({ market: "Boom 300" })), 0, "max daily trades is 1");
  s.clock.t += 40000;
  assert.equal(await s.svc.onAlert(alert({ market: "Crash 500", group: "crash", type: "BUY" })), 0, "connector offline");
  const off = setup({ enabled: false });
  assert.equal(await off.svc.onAlert(alert()), 0, "bot trading switched off on the server");
});

test("a failed order frees the day's count; an order nobody collects expires", async () => {
  const s = setup();
  const key = await member(s, A, { ...on, daily: 1 });
  const reg = s.svc.regOfKey(key);
  assert.equal(await s.svc.onAlert(alert()), 1);
  const id = (await s.svc.report(reg, { account: ACC, positions: [] }))[0].split("|")[1];
  await s.svc.report(reg, { account: ACC, positions: [], results: [{ id, opened: 0, error: "Not enough free margin" }] });
  let v = await s.svc.view(A);
  assert.equal(v.today.used, 0);
  assert.match(v.activity[0].message, /Not enough free margin/);
  assert.equal(await s.svc.onAlert(alert({ market: "Boom 500" })), 1, "the failed trade did not use the day's allowance");
  s.clock.t += 61000; // never collected
  await s.svc.report(reg, { account: ACC, positions: [] });
  v = await s.svc.view(A);
  assert.equal(v.today.used, 0);
  assert.equal(s.store.data.botorders.filter((r) => r[10] === "Expired").length, 1);
});

test("only Alumni members are traded for, and one member's key cannot read another's results", async () => {
  const s = setup({ isAlumni: async (reg) => reg === A });
  const ka = await member(s, A);
  const kb = await member(s, B);
  assert.equal(await s.svc.onAlert(alert()), 1, "only the Alumni member gets an order");
  const regB = s.svc.regOfKey(kb);
  const regA = s.svc.regOfKey(ka);
  const id = (await s.svc.report(regA, { account: ACC, positions: [] }))[0].split("|")[1];
  await s.svc.report(regB, { account: ACC, positions: [], results: [{ id, opened: 1, error: "" }] }); // B claims A's order
  const v = await s.svc.view(A);
  assert.equal(v.activity.filter((e) => /Opened/.test(e.message)).length, 0, "ignored");
});

test("the MT5 market name: Boom and Crash get ' Index', the rest keep their name", () => {
  assert.equal(bot.mt5Symbol("Boom 1000"), "Boom 1000 Index");
  assert.equal(bot.mt5Symbol("Crash 300"), "Crash 300 Index");
  assert.equal(bot.mt5Symbol("Volatility 10 (1s) Index"), "Volatility 10 (1s) Index");
  assert.equal(bot.mt5Symbol("Step Index"), "Step Index");
});

test("website: Alumni members set risk, link, report from MT5 and download the connector; others are turned away", async () => {
  const { boot } = require("./support/boot-server");
  const s = await boot({ FAKE_ALUMNI: "1", BOT_TRADING: "on", PUBLIC_URL: "https://example.test" });
  try {
    const alumni = await s.studentToken("ABECFX/26/0005");
    const student = await s.studentToken("ABECFX/26/0001");
    assert.equal((await s.call("GET", "/api/portal/bot")).status, 401);
    assert.equal((await s.call("GET", "/api/portal/bot", { token: student })).status, 403);
    assert.equal((await s.call("POST", "/api/portal/bot/link", { token: student, body: {} })).status, 403);

    const v = await s.call("GET", "/api/portal/bot", { token: alumni });
    assert.equal(v.status, 200);
    assert.equal(v.body.enabled, true);
    assert.equal(v.body.linked, false);

    const bad = await s.call("PUT", "/api/portal/bot/settings", { token: alumni, body: { lot: 0 } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.errors.lot);
    const saved = await s.call("PUT", "/api/portal/bot/settings", { token: alumni, body: { on: true, acceptRisk: true, lot: 0.2, sl: 10, tp: 0, positions: 1, daily: 3, groups: ["boom"] } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.on, true);

    const link = await s.call("POST", "/api/portal/bot/link", { token: alumni, body: {} });
    assert.equal(link.status, 200);
    const key = link.body.key;

    const noKey = await fetch(s.base + "/api/bot/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(noKey.status, 401);
    assert.match(await noKey.text(), /^ERR\|/);
    const ok = await fetch(s.base + "/api/bot/report", { method: "POST", headers: { "Content-Type": "application/json", "X-Bot-Key": key }, body: JSON.stringify({ account: { login: "123", currency: "USD", balance: 50 }, positions: [] }) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.text()).split("\n")[0], "OK");
    const after = await s.call("GET", "/api/portal/bot", { token: alumni });
    assert.equal(after.body.connected, true);
    assert.equal(after.body.account.login, "123");

    const file = await fetch(s.base + "/api/portal/bot/connector", { headers: { Authorization: "Bearer " + alumni } });
    assert.equal(file.status, 200);
    const src = await file.text();
    assert.match(src, /https:\/\/example\.test/);
    assert.doesNotMatch(src, /__SERVER_URL__/);
    assert.equal((await fetch(s.base + "/api/portal/bot/connector", { headers: { Authorization: "Bearer " + student } })).status, 403);

    const gone = await s.call("POST", "/api/portal/bot/disconnect", { token: alumni, body: {} });
    assert.equal(gone.body.linked, false);
    const old = await fetch(s.base + "/api/bot/report", { method: "POST", headers: { "Content-Type": "application/json", "X-Bot-Key": key }, body: "{}" });
    assert.equal(old.status, 401);
  } finally {
    s.stop();
  }
});

test("website: with BOT_TRADING off nothing can be linked or reported", async () => {
  const { boot } = require("./support/boot-server");
  const s = await boot({ FAKE_ALUMNI: "1" });
  try {
    const alumni = await s.studentToken("ABECFX/26/0005");
    assert.equal((await s.call("GET", "/api/portal/bot", { token: alumni })).body.enabled, false);
    assert.equal((await s.call("POST", "/api/portal/bot/link", { token: alumni, body: {} })).status, 403);
    assert.equal((await s.call("PUT", "/api/portal/bot/settings", { token: alumni, body: { on: true } })).status, 403);
    const r = await fetch(s.base + "/api/bot/report", { method: "POST", headers: { "Content-Type": "application/json", "X-Bot-Key": "BK-x" }, body: "{}" });
    assert.equal(r.status, 503);
  } finally {
    s.stop();
  }
});
