const test = require("node:test");
const assert = require("node:assert/strict");
const copy = require("../copy");
const { createMemoryStore } = require("./support/memory-store");
let sheets = null;
try { sheets = require("../sheets"); } catch (e) { /* google-auth-library is not installed in some sandboxes: the check below is skipped */ }

const MASTER_REG = "ABECFX/26/0001";
const A = "ABECFX/26/0002"; // an alumni follower
const B = "ABECFX/26/0003"; // another alumni follower

// A fake clock and a copy service on an in-memory sheet. `who` says which students hold which card.
function setup(over = {}) {
  const store = over.store || createMemoryStore();
  const clock = { t: Date.parse("2026-11-01T10:00:00Z") };
  const who = over.who || { alumni: new Set([A, B]), staff: new Set([MASTER_REG]) };
  const make = () => copy.create(store, {
    enabled: true,
    now: () => clock.t,
    today: () => "2026-11-01",
    stamp: () => "1 Nov 2026, 10:00:00",
    isAlumni: async (r) => who.alumni.has(r),
    isStaff: async (r) => who.staff.has(r),
    nameOf: async (r) => (r === MASTER_REG ? "Mentor Ade" : "Member " + r.slice(-1)),
    connection: async () => ({ linked: over.linked !== false, connected: true }),
    log: () => {},
  });
  return { store, clock, who, svc: make(), make };
}

const pos = (ticket, over = {}) => ({ ticket, symbol: "Boom 1000 Index", type: "SELL", lots: 0.2, openTime: 1790000000, openPrice: 10000, sl: 10050, tp: 9900, profit: 0, swap: 0, ...over });
const report = (positions, extra = {}) => ({ account: { login: "111", currency: "USD", balance: 500, equity: 500 }, positions, closed: [], results: [], ...extra });

// A master with a key and a listing; returns its code and key.
async function listedMaster(s) {
  const { key, code } = await s.svc.masterLink(MASTER_REG);
  await s.svc.masterSettings(MASTER_REG, { name: "Mentor Ade", about: "Boom and Crash", listed: true });
  await s.svc.masterReport(code, report([])); // the first report: nothing is open
  return { key, code };
}
const follow = (s, reg, code, over = {}) => s.svc.saveFollow(reg, { master: code, on: true, lot: 0.5, maxOpen: 3, maxDaily: 10, acceptRisk: true, ...over });
const advance = (s, ms) => { s.clock.t += ms; };

test("a master links, lists, and only then appears to followers", async () => {
  const s = setup();
  const { key, code } = await s.svc.masterLink(MASTER_REG);
  assert.match(key, /^MK-/);
  assert.equal(code, "M1");
  assert.equal(s.svc.masterOfKey(key), "M1");
  assert.deepEqual((await s.svc.followView(A)).masters, []); // linked but not listed
  await s.svc.masterSettings(MASTER_REG, { name: "Mentor Ade", about: "About me", listed: true });
  const v = await s.svc.followView(A);
  assert.equal(v.masters.length, 1);
  assert.equal(v.masters[0].name, "Mentor Ade");
  assert.equal(v.masters[0].self, false);
  assert.ok(!("reg" in v.masters[0]) && !("keyHash" in v.masters[0])); // nothing private goes to followers
  assert.equal(s.store.data.copymasters.length, 1);
  assert.notEqual(s.store.data.copymasters[0][2], key); // only a hash is kept
});

test("linking again replaces the key; disconnect unlists", async () => {
  const s = setup();
  const first = await s.svc.masterLink(MASTER_REG);
  const second = await s.svc.masterLink(MASTER_REG);
  assert.equal(second.code, first.code);
  assert.equal(s.svc.masterOfKey(first.key), "");
  assert.equal(s.svc.masterOfKey(second.key), "M1");
  assert.equal(s.store.data.copymasters.length, 1);
  await s.svc.masterSettings(MASTER_REG, { listed: true });
  const v = await s.svc.masterDisconnect(MASTER_REG);
  assert.equal(v.linked, false);
  assert.equal(v.listed, false);
  assert.equal(s.svc.masterOfKey(second.key), "");
});

test("listing needs a linked account, and a name", async () => {
  const s = setup();
  await assert.rejects(s.svc.masterSettings(MASTER_REG, { listed: true }), /Link your MetaTrader 5/);
  await s.svc.masterLink(MASTER_REG);
  await assert.rejects(s.svc.masterSettings(MASTER_REG, { name: "x" }), (e) => Boolean(e.fields && e.fields.name));
});

test("following: rules for who and how", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await assert.rejects(s.svc.saveFollow(A, { master: code, on: true, lot: 0.5 }), (e) => Boolean(e.fields && e.fields.acceptRisk));
  await assert.rejects(follow(s, A, "M9"), (e) => Boolean(e.fields && e.fields.master));
  await assert.rejects(follow(s, A, code, { lot: 0 }), (e) => Boolean(e.fields && e.fields.lot));
  await assert.rejects(follow(s, A, code, { lot: 1000 }), (e) => Boolean(e.fields && e.fields.lot));
  await assert.rejects(follow(s, A, code, { maxOpen: 2.5 }), (e) => Boolean(e.fields && e.fields.maxOpen));
  await assert.rejects(follow(s, MASTER_REG, code), (e) => Boolean(e.fields && /yourself/.test(e.fields.master)));
  const v = await follow(s, A, code);
  assert.equal(v.settings.on, true);
  assert.equal(v.settings.master, code);
  assert.equal(v.settings.lot, 0.5);
  assert.equal(v.settings.accepted, true);
  assert.equal(s.store.data.copyfollows.length, 1);
  assert.equal(s.store.data.copyfollows[0][2], "Yes");
  // changing settings later needs no new acceptance and keeps one row
  const v2 = await s.svc.saveFollow(A, { lot: 0.3 });
  assert.equal(v2.settings.lot, 0.3);
  assert.equal(s.store.data.copyfollows.length, 1);
});

test("following needs a linked MetaTrader account", async () => {
  const s = setup({ linked: false });
  const { code } = await listedMaster(s);
  await assert.rejects(follow(s, A, code), (e) => Boolean(e.fields && e.fields.connection));
});

test("a follower can only follow a listed, active master", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await s.svc.masterSettings(MASTER_REG, { listed: false });
  await assert.rejects(follow(s, A, code), (e) => Boolean(e.fields && e.fields.master));
});

test("a trade the master opens after the first report is copied with the follower's own lot and the master's SL and TP", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code, { lot: 0.35 });
  advance(s, 5000);
  await s.svc.masterReport(code, report([pos("5001")]));
  const lines = await s.svc.followerLines(A, report([]));
  assert.equal(lines.length, 1);
  const f = lines[0].split("|");
  assert.equal(f[0], "COPYOPEN");
  assert.equal(f[2], "Boom 1000 Index");
  assert.equal(f[3], "SELL");
  assert.equal(f[4], "0.35"); // the follower's lot, not the master's 0.2
  assert.equal(f[5], "10050");
  assert.equal(f[6], "9900");
  assert.equal(f[8], "CM1-5001");
  // the same report again does not send it twice
  assert.deepEqual(await s.svc.followerLines(A, report([])), []);
});

test("another follower with other settings gets their own lot", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code, { lot: 0.1 });
  await follow(s, B, code, { lot: 2 });
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  assert.equal((await s.svc.followerLines(A, report([])))[0].split("|")[4], "0.10");
  assert.equal((await s.svc.followerLines(B, report([])))[0].split("|")[4], "2.00");
});

test("trades already open when the website first hears from the master are never copied", async () => {
  const s = setup();
  const { code } = await s.svc.masterLink(MASTER_REG).then((r) => r);
  await s.svc.masterSettings(MASTER_REG, { listed: true });
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("4000")])); // first report: already open
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("4000")]));
  assert.deepEqual(await s.svc.followerLines(A, report([])), []);
});

test("trades the master opened before the member started following are not copied", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  advance(s, 5000);
  await follow(s, A, code); // starts following after the trade
  assert.deepEqual(await s.svc.followerLines(A, report([])), []);
});

test("a trade seen too long ago is a late entry and is not copied", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  advance(s, copy.OPEN_WINDOW_MS + 1000);
  await s.svc.masterReport(code, report([pos("5001")])); // still open, master still online
  assert.deepEqual(await s.svc.followerLines(A, report([])), []);
});

test("the master moving the stop loss or take profit moves the follower's copy", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  const open = await s.svc.followerLines(A, report([]));
  const id = open[0].split("|")[1];
  advance(s, 2000);
  const mine = { ticket: "9001", symbol: "Boom 1000 Index", type: "SELL", lots: 0.5, sl: 10050, tp: 9900, comment: "CM1-5001", profit: 0 };
  await s.svc.masterReport(code, report([pos("5001", { sl: 10020, tp: 9850 })]));
  const mod = await s.svc.followerLines(A, report([mine], { results: [{ id, opened: 1, error: "" }] }));
  assert.equal(mod.length, 1);
  assert.deepEqual(mod[0].split("|").slice(0, 1).concat(mod[0].split("|").slice(2)), ["COPYMOD", "CM1-5001", "10020", "9850"]);
  // the master's sheet row shows the new levels
  assert.equal(s.store.data.copytrades[0][7], "10020");
  // not repeated at once, repeated if there was no answer
  assert.deepEqual(await s.svc.followerLines(A, report([mine])), []);
  advance(s, 16000);
  await s.svc.masterReport(code, report([pos("5001", { sl: 10020, tp: 9850 })]));
  assert.equal((await s.svc.followerLines(A, report([mine]))).length, 1);
  // once the follower's copy has the new levels, nothing more is sent
  const updated = { ...mine, sl: 10020, tp: 9850 };
  assert.deepEqual(await s.svc.followerLines(A, report([updated])), []);
});

test("the master closing the trade closes the follower's copy, and the master's sheet row is closed with the profit", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  await s.svc.followerLines(A, report([]));
  advance(s, 4000);
  const mine = { ticket: "9001", symbol: "Boom 1000 Index", type: "SELL", lots: 0.5, sl: 10050, tp: 9900, comment: "CM1-5001" };
  await s.svc.masterReport(code, report([], { closed: [{ position: "5001", deal: "d1", profit: 12.5, swap: 0, closeTime: 1790000100, closePrice: 9950 }] }));
  const lines = await s.svc.followerLines(A, report([mine]));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].split("|")[0], "COPYCLOSE");
  assert.equal(lines[0].split("|")[2], "CM1-5001");
  const row = s.store.data.copytrades[0];
  assert.equal(row[9], "Closed");
  assert.equal(row[12], "12.5");
  assert.equal(row[14], "d1");
  // the same deal arriving again is not counted twice
  await s.svc.masterReport(code, report([], { closed: [{ position: "5001", deal: "d1", profit: 12.5, swap: 0, closeTime: 1790000100, closePrice: 9950 }] }));
  assert.equal(s.store.data.copytrades[0][12], "12.5");
  const stats = (await s.svc.followView(A)).masters[0].stats;
  assert.deepEqual([stats.trades, stats.wins, stats.winRate, stats.profit], [1, 1, 100, 12.5]);
});

test("nothing is changed or closed while the master is offline", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  await s.svc.followerLines(A, report([]));
  advance(s, copy.ONLINE_MS + 5000); // the master's connector went quiet
  const mine = { ticket: "9001", symbol: "Boom 1000 Index", type: "SELL", lots: 0.5, sl: 1, tp: 2, comment: "CM1-5001" };
  assert.deepEqual(await s.svc.followerLines(A, report([mine])), []);
});

test("copies of a master you no longer follow are left alone", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  await s.svc.followerLines(A, report([]));
  await s.svc.saveFollow(A, { on: false });
  advance(s, 2000);
  await s.svc.masterReport(code, report([]));
  const mine = { ticket: "9001", symbol: "Boom 1000 Index", type: "SELL", lots: 0.5, sl: 1, tp: 2, comment: "CM1-5001" };
  assert.deepEqual(await s.svc.followerLines(A, report([mine])), []);
});

test("limits: most open at once and most a day", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code, { maxOpen: 1, maxDaily: 5 });
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001"), pos("5002", { symbol: "Crash 1000 Index", type: "BUY" })]));
  const lines = await s.svc.followerLines(A, report([]));
  assert.equal(lines.length, 1); // the second is skipped: one open at a time
  const v = await s.svc.followView(A);
  assert.ok(v.activity.some((a) => /already have 1 copied/.test(a.message)));

  const t = setup();
  const m = await listedMaster(t);
  await follow(t, A, m.code, { maxOpen: 5, maxDaily: 1 });
  advance(t, 1000);
  await t.svc.masterReport(m.code, report([pos("6001"), pos("6002")]));
  assert.equal((await t.svc.followerLines(A, report([]))).length, 1);
});

test("a failed copy gives the daily slot back, is never retried, and is recorded in the sheet", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code, { maxDaily: 1 });
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  const id = (await s.svc.followerLines(A, report([])))[0].split("|")[1];
  assert.equal((await s.svc.followView(A)).today.used, 1);
  await s.svc.followerLines(A, report([], { results: [{ id, opened: 0, error: "Not enough free margin" }] }));
  assert.equal((await s.svc.followView(A)).today.used, 0);
  assert.deepEqual(await s.svc.followerLines(A, report([])), []); // a late entry is never retried
  await new Promise((r) => setImmediate(r));
  const row = s.store.data.copyorders[0];
  assert.equal(row[0], A);
  assert.equal(row[6], "Open");
  assert.equal(row[12], "Failed");
  assert.match(row[13], /free margin/);
});

test("a success is recorded in the sheet and counted for the day", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  const id = (await s.svc.followerLines(A, report([])))[0].split("|")[1];
  await s.svc.followerLines(A, report([{ ticket: "9", symbol: "Boom 1000 Index", type: "SELL", lots: 0.5, comment: "CM1-5001", sl: 10050, tp: 9900 }], { results: [{ id, opened: 1, error: "" }] }));
  await new Promise((r) => setImmediate(r));
  assert.equal(s.store.data.copyorders[0][12], "Opened");
  assert.equal((await s.svc.followView(A)).copied.length, 1);
});

test("only an Alumni member is copied for", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  s.who.alumni.delete(A); // the card was taken away
  assert.deepEqual(await s.svc.followerLines(A, report([])), []);
});

test("a restart never copies what is already open, and never opens a copy twice", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  await s.svc.followerLines(A, report([])); // sent once
  const again = s.make(); // the website restarted: same sheet, empty memory
  advance(s, 3000);
  await again.masterReport(code, report([pos("5001")])); // first report after the restart
  advance(s, 1000);
  await again.masterReport(code, report([pos("5001")]));
  assert.deepEqual(await again.followerLines(A, report([])), []);
  // but a brand new trade after the restart is copied
  advance(s, 1000);
  await again.masterReport(code, report([pos("5001"), pos("5002")]));
  const lines = await again.followerLines(A, report([{ ticket: "9", symbol: "x", type: "SELL", lots: 1, comment: "CM1-5001", sl: 10050, tp: 9900 }]));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].split("|")[8], "CM1-5002");
});

test("a trade that closed while the website was away is closed in the sheet on the next report", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  const again = s.make();
  await again.masterReport(code, report([]));
  assert.equal(s.store.data.copytrades[0][9], "Closed");
});

test("a wrong or old master key is refused, and a master with Active = No gets no copies made", async () => {
  const s = setup();
  const { key, code } = await listedMaster(s);
  assert.equal(s.svc.masterOfKey("MK-nonsense"), "");
  assert.equal(s.svc.masterOfKey(key), code);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  s.store.data.copymasters[0][7] = "No";
  const fresh = s.make(); // the admin blocked the master in the sheet; the next start reads it
  await fresh.init();
  await fresh.masterReport(code, report([])).catch(() => {});
  assert.deepEqual(await fresh.followerLines(A, report([])), []);
  assert.deepEqual((await fresh.followView(B)).masters, []);
});

test("the copy trading sheet columns match sheets.js", { skip: !sheets && "google-auth-library is not installed here" }, () => {
  for (const [key, headers] of [["copymasters", copy.MASTER_HEADERS], ["copyfollows", copy.FOLLOW_HEADERS], ["copytrades", copy.TRADE_HEADERS], ["copyorders", copy.ORDER_HEADERS]]) {
    assert.deepEqual(sheets.EDITOR_TABS[key].headers, headers);
    assert.deepEqual(createMemoryStore().EDITOR_TABS[key].headers, headers);
  }
});

test("the copy tabs are never offered in the Database view", () => {
  const db = require("../admin-database");
  const d = db.create(createMemoryStore());
  for (const key of ["copymasters", "copyfollows", "copytrades", "copyorders", "hostingrequests"]) assert.ok(!d.ORDER.includes(key));
});

test("a trade without a stop loss is copied only once the master sets one, still within the window", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001", { sl: 0, tp: 0 })]));
  assert.deepEqual(await s.svc.followerLines(A, report([])), []);
  advance(s, 10000);
  await s.svc.masterReport(code, report([pos("5001", { sl: 10050, tp: 0 })]));
  const lines = await s.svc.followerLines(A, report([]));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].split("|")[5], "10050");
});

test("a master who loses the Staff ID card is no longer copied from", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  await follow(s, A, code);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  s.who.staff.delete(MASTER_REG);
  assert.deepEqual(await s.svc.followerLines(A, report([])), []);
});

test("an admin marks a master as hosted on the ABEC-FX VPS in the sheet; followers see it, masters cannot set it themselves", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  assert.equal((await s.svc.followView(A)).masters[0].hosted, false);
  await s.svc.masterSettings(MASTER_REG, { hosted: true }); // ignored: only the sheet decides
  assert.equal((await s.svc.followView(A)).masters[0].hosted, false);
  s.store.data.copymasters[0][10] = "Yes";
  const fresh = s.make();
  await fresh.init();
  assert.equal((await fresh.followView(A)).masters[0].hosted, true);
  assert.equal((await fresh.masterView(MASTER_REG)).hosted, true);
  assert.equal(code, "M1");
});

test("a master code is not reused after its master is deleted, so old trades never join a new master", async () => {
  const s = setup();
  const { code } = await listedMaster(s);
  advance(s, 1000);
  await s.svc.masterReport(code, report([pos("5001")]));
  s.store.data.copymasters.length = 0; // the person was deleted from the Database view
  const fresh = s.make();
  await fresh.init();
  const again = await fresh.masterLink("ABECFX/26/0009");
  assert.notEqual(again.code, code);
});

test("deleting a student also removes their copy trading and hosting records", async () => {
  const { create } = require("../admin-database");
  const { student } = require("./support/memory-store");
  const store = createMemoryStore({ students: [student(1), student(2)] });
  store.data.copyfollows.push(["ABECFX/26/0001", "M1", "Yes", "0.5", "3", "10", "", "", ""], ["ABECFX/26/0002", "M1", "Yes", "0.5", "3", "10", "", "", ""]);
  store.data.copyorders.push(["ABECFX/26/0001", "C1", "", "", "M1", "5", "Open", "", "", "", "", "", "Opened", ""]);
  store.data.copymasters.push(["M1", "ABECFX/26/0001", "", "", "Ade", "", "No", "Yes", "", "", "No"]);
  store.data.hostingrequests.push(["H1", "ABECFX/26/0001", "", "Requested", "123456", "Deriv-Demo", "Demo", "", "", "", "", "member"]);
  const svc = create(store);
  await svc.remove("students", 2, store.data.students[0].slice());
  assert.deepEqual(store.data.copyfollows.map((r) => r[0]), ["ABECFX/26/0002"]);
  assert.equal(store.data.copyorders.length, 0);
  assert.equal(store.data.copymasters.length, 0);
  assert.equal(store.data.hostingrequests.length, 0);
});
