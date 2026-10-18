// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const team = require("../team");
const { createMemoryStore, HEADERS } = require("./support/memory-store");

const safeEqual = (a, b) => a === b;
const OWNER_PW = "owner-secret-123";
const owner = { username: "owner", name: "Owner", role: "owner" };

function setup() {
  const store = createMemoryStore();
  const svc = team.create(store, { now: () => "18 Oct 2026, 10:00:00", cacheMs: 0 });
  return { store, svc };
}
const rejects = (p, status, field) =>
  assert.rejects(p, (e) => {
    assert.ok(e instanceof team.TeamError, "expected a TeamError but got: " + e);
    assert.equal(e.status, status, e.message);
    if (field) assert.ok(e.fields && e.fields[field], "expected an error on " + field + ", got " + JSON.stringify(e.fields));
    return true;
  });
const newMod = (over) => ({ username: "amaka", fullName: "Amaka Obi", role: "moderator", password: "goodpass1", ...over });

test("team columns match the real sheets.js (when its dependencies are installed)", (t) => {
  assert.deepEqual(team.HEADERS, HEADERS.team);
  let real;
  try { real = require("../sheets"); } catch (e) { return t.skip("google-auth-library is not installed here"); }
  assert.deepEqual(real.EDITOR_TABS.team.headers, team.HEADERS);
});

test("roles: moderators only view; admins and the owner manage the site and the team", () => {
  assert.equal(team.can("moderator", "view"), true);
  assert.equal(team.can("moderator", "manage"), false);
  assert.equal(team.can("moderator", "team"), false);
  for (const r of ["admin", "owner"]) for (const p of ["view", "manage", "team"]) assert.equal(team.can(r, p), true, r + " " + p);
  assert.equal(team.can("nobody", "view"), false);
});

test("passwords are hashed with a salt and verified", async () => {
  const h1 = await team.hashPassword("goodpass1");
  const h2 = await team.hashPassword("goodpass1");
  assert.notEqual(h1, h2, "each hash has its own salt");
  assert.ok(!h1.includes("goodpass1"));
  assert.equal(await team.verifyPassword("goodpass1", h1), true);
  assert.equal(await team.verifyPassword("goodpass2", h1), false);
  assert.equal(await team.verifyPassword("goodpass1", ""), false);
  assert.equal(await team.verifyPassword("goodpass1", "junk$value"), false);
});

test("sign-in tokens: valid, tampered, expired, wrong secret", () => {
  const t = team.signToken("amaka", "secret", 1000);
  assert.equal(team.verifyToken(t, "secret", 2000), "amaka");
  assert.equal(team.verifyToken(t, "other", 2000), null);
  assert.equal(team.verifyToken(t + "x", "secret", 2000), null);
  assert.equal(team.verifyToken(t, "secret", 1000 + 13 * 60 * 60 * 1000), null, "expires after 12 hours");
  assert.equal(team.verifyToken("not-a-token", "secret"), null);
  assert.equal(team.verifyToken(OWNER_PW, OWNER_PW), null, "a raw password is not a token");
});

test("add: stores a hash, never the password, and lists without it", async () => {
  const { store, svc } = setup();
  const who = await svc.add(newMod(), owner);
  assert.deepEqual(who, { username: "amaka", name: "Amaka Obi", role: "moderator", active: true, createdAt: "18 Oct 2026, 10:00:00", createdBy: "owner" });
  const row = store.data.team[0];
  assert.equal(row[0], "amaka");
  assert.ok(row[3].startsWith("s1$"));
  assert.ok(!JSON.stringify(store.data.team).includes("goodpass1"));
  const list = await svc.members();
  assert.equal(list.length, 1);
  assert.equal("hash" in list[0], false);
});

test("add: checks every field and rejects duplicates and the reserved name", async () => {
  const { svc } = setup();
  await rejects(svc.add(newMod({ username: "a" }), owner), 400, "username");
  await rejects(svc.add(newMod({ username: "has space" }), owner), 400, "username");
  await rejects(svc.add(newMod({ username: "Owner" }), owner), 400, "username");
  await rejects(svc.add(newMod({ fullName: "  " }), owner), 400, "fullName");
  await rejects(svc.add(newMod({ role: "owner" }), owner), 400, "role");
  await rejects(svc.add(newMod({ role: "superuser" }), owner), 400, "role");
  await rejects(svc.add(newMod({ password: "short" }), owner), 400, "password");
  await svc.add(newMod(), owner);
  await rejects(svc.add(newMod({ username: "AMAKA" }), owner), 409, "username");
});

test("two adds of the same username at once: only one wins", async () => {
  const { store, svc } = setup();
  const results = await Promise.allSettled([svc.add(newMod(), owner), svc.add(newMod(), owner)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(store.data.team.length, 1);
});

test("login: owner password, team password, wrong, unknown, disabled", async () => {
  const { svc } = setup();
  await svc.add(newMod(), owner);
  assert.deepEqual(await svc.login("owner", OWNER_PW, OWNER_PW, safeEqual), owner);
  await rejects(svc.login("owner", "nope", OWNER_PW, safeEqual), 401);
  await rejects(svc.login("owner", "x", "", safeEqual), 503);
  const ok = await svc.login(" Amaka ", "goodpass1", OWNER_PW, safeEqual);
  assert.deepEqual(ok, { username: "amaka", name: "Amaka Obi", role: "moderator" });
  await rejects(svc.login("amaka", "wrong", OWNER_PW, safeEqual), 401);
  await rejects(svc.login("ghost", "goodpass1", OWNER_PW, safeEqual), 401);
  await svc.update("amaka", { active: false }, owner);
  await rejects(svc.login("amaka", "goodpass1", OWNER_PW, safeEqual), 403);
  assert.equal(await svc.lookup("amaka"), null, "a disabled account is locked out of existing tokens too");
});

test("lookup: role changes and removal apply immediately", async () => {
  const { svc } = setup();
  await svc.add(newMod(), owner);
  assert.equal((await svc.lookup("amaka")).role, "moderator");
  await svc.update("amaka", { role: "admin" }, owner);
  assert.equal((await svc.lookup("amaka")).role, "admin");
  await svc.remove("amaka", owner);
  assert.equal(await svc.lookup("amaka"), null);
  assert.deepEqual(await svc.lookup("owner"), owner);
});

test("an unreadable role in the sheet gets no access", async () => {
  const { store, svc } = setup();
  store.data.team.push(["sneaky", "Sneaky", "owner", await team.hashPassword("goodpass1"), "Yes", "", ""]);
  assert.equal(await svc.lookup("sneaky"), null, "owner cannot be granted by typing it in the sheet");
  await rejects(svc.login("sneaky", "goodpass1", OWNER_PW, safeEqual), 403);
});

test("update: name, role, active, password; invalid input is rejected", async () => {
  const { store, svc } = setup();
  await svc.add(newMod(), owner);
  const out = await svc.update("amaka", { fullName: "Amaka N. Obi", role: "admin", password: "brandnew99" }, owner);
  assert.equal(out.name, "Amaka N. Obi");
  assert.equal(out.role, "admin");
  assert.equal((await svc.login("amaka", "brandnew99", OWNER_PW, safeEqual)).role, "admin");
  await rejects(svc.login("amaka", "goodpass1", OWNER_PW, safeEqual), 401);
  await rejects(svc.update("amaka", { role: "owner" }, owner), 400, "role");
  await rejects(svc.update("amaka", { password: "short" }, owner), 400, "password");
  await rejects(svc.update("amaka", { fullName: "" }, owner), 400, "fullName");
  await rejects(svc.update("ghost", { active: false }, owner), 404);
  const before = store.calls.length;
  await svc.update("amaka", {}, owner);
  assert.equal(store.calls.length, before, "no change means no write");
});

test("nobody can demote, disable or remove themselves", async () => {
  const { svc } = setup();
  await svc.add(newMod({ username: "boss", role: "admin" }), owner);
  const boss = { username: "boss", name: "Boss", role: "admin" };
  await rejects(svc.update("boss", { role: "moderator" }, boss), 400);
  await rejects(svc.update("boss", { active: false }, boss), 400);
  await rejects(svc.remove("boss", boss), 400);
  assert.equal((await svc.lookup("boss")).role, "admin");
});

test("an admin can add another admin and a moderator", async () => {
  const { svc } = setup();
  await svc.add(newMod({ username: "boss", role: "admin" }), owner);
  const boss = await svc.lookup("boss");
  await svc.add(newMod({ username: "second", role: "admin" }), boss);
  await svc.add(newMod({ username: "helper", role: "moderator" }), boss);
  const list = await svc.members();
  assert.deepEqual(list.map((m) => [m.username, m.role, m.createdBy]), [["boss", "admin", "owner"], ["second", "admin", "boss"], ["helper", "moderator", "boss"]]);
});

test("remove: deletes only that account", async () => {
  const { store, svc } = setup();
  await svc.add(newMod({ username: "one" }), owner);
  await svc.add(newMod({ username: "two" }), owner);
  await svc.remove("one", owner);
  assert.deepEqual(store.data.team.map((r) => r[0]), ["two"]);
  await rejects(svc.remove("one", owner), 404);
});

test("changeOwnPassword: needs the current password and a valid new one", async () => {
  const { svc } = setup();
  await svc.add(newMod(), owner);
  await rejects(svc.changeOwnPassword("amaka", "wrong", "newpass123"), 400, "current");
  await rejects(svc.changeOwnPassword("amaka", "goodpass1", "short"), 400, "next");
  await svc.changeOwnPassword("amaka", "goodpass1", "newpass123");
  await svc.login("amaka", "newpass123", OWNER_PW, safeEqual);
  await rejects(svc.login("amaka", "goodpass1", OWNER_PW, safeEqual), 401);
});
