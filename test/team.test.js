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

test("built-in roles: owner and admin everything, editor everything but the team and quiz codes, moderator only view", () => {
  const all = ["view", "links", "community", "videos", "quizcodes", "database", "team"];
  assert.deepEqual(team.PERM_KEYS, all);
  for (const r of ["admin", "owner"]) for (const p of all) assert.equal(team.can(r, p), true, r + " " + p);
  for (const p of ["view", "links", "community", "videos", "database"]) assert.equal(team.can("editor", p), true, "editor " + p);
  assert.equal(team.can("editor", "team"), false);
  assert.equal(team.can("editor", "quizcodes"), false, "quiz codes are given through a custom role, not to every editor");
  assert.equal(team.can("moderator", "view"), true);
  for (const p of ["links", "community", "videos", "quizcodes", "database", "team"]) assert.equal(team.can("moderator", p), false, "moderator " + p);
  assert.equal(team.can("nobody", "view"), false);
  assert.deepEqual(team.ASSIGNABLE, ["admin", "editor", "moderator"]);
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

// ---------- Editor role and custom roles ----------
const adminOf = async (svc) => { await svc.add(newMod({ username: "boss", role: "admin" }), owner); return svc.lookup("boss"); };

test("editor: can be given to a person and gets exactly the editor access", async () => {
  const { svc } = setup();
  await svc.add(newMod({ username: "edna", role: "editor" }), owner);
  const ed = await svc.lookup("edna");
  assert.equal(ed.role, "editor");
  assert.deepEqual(await svc.permsOf("editor"), ["view", "links", "community", "videos", "database"]);
  assert.equal(await svc.allow("editor", "database"), true);
  assert.equal(await svc.allow("editor", "team"), false);
  assert.equal((await svc.login("edna", "goodpass1", OWNER_PW, safeEqual)).role, "editor");
});

test("roles list: built-in roles plus custom ones, with member counts; the owner is never listed", async () => {
  const { svc } = setup();
  await svc.add(newMod({ username: "edna", role: "editor" }), owner);
  await svc.addRole({ name: "Support", perms: ["links"] }, owner);
  const list = await svc.roles(owner);
  assert.deepEqual(list.map((r) => r.key), ["admin", "editor", "moderator", "support"]);
  assert.equal(list.find((r) => r.key === "editor").members, 1);
  assert.equal(list.find((r) => r.key === "support").builtin, false);
  assert.ok(list.every((r) => r.canGrant));
});

test("addRole: stores a name and the picked access; \"view\" is always included; order is standard", async () => {
  const { store, svc } = setup();
  const r = await svc.addRole({ name: "  Video   Team ", perms: ["videos", "links"] }, owner);
  assert.deepEqual(r, { key: "video-team", label: "Video Team", perms: ["view", "links", "videos"], builtin: false, createdAt: "18 Oct 2026, 10:00:00", createdBy: "owner" });
  assert.deepEqual(store.data.roles[0].slice(0, 3), ["video-team", "Video Team", "view,links,videos"]);
  assert.deepEqual(await svc.permsOf("video-team"), ["view", "links", "videos"]);
  const onlyView = await svc.addRole({ name: "Watcher", perms: [] }, owner);
  assert.deepEqual(onlyView.perms, ["view"]);
});

test("addRole: checks the name and the access, refuses built-in names and duplicates", async () => {
  const { svc } = setup();
  await rejects(svc.addRole({ name: "  ", perms: ["links"] }, owner), 400, "name");
  await rejects(svc.addRole({ name: "ab", perms: [] }, owner), 400, "name");
  await rejects(svc.addRole({ name: "!!!", perms: [] }, owner), 400, "name");
  for (const n of ["Admin", "EDITOR", "moderator", "Owner"]) await rejects(svc.addRole({ name: n, perms: [] }, owner), 400, "name");
  await rejects(svc.addRole({ name: "Support", perms: ["links", "sudo"] }, owner), 400, "perms");
  await svc.addRole({ name: "Support", perms: ["links"] }, owner);
  await rejects(svc.addRole({ name: "support!", perms: ["videos"] }, owner), 409, "name");
  assert.deepEqual((await svc.addRole({ name: "Plain", perms: "links" }, owner)).perms, ["view"], "perms that is not a list gives view only");
});

test("two roles with the same name at once: only one wins", async () => {
  const { store, svc } = setup();
  const res = await Promise.allSettled([svc.addRole({ name: "Support", perms: [] }, owner), svc.addRole({ name: "Support", perms: [] }, owner)]);
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(store.data.roles.length, 1);
});

test("a person can be given a custom role and gets exactly that access", async () => {
  const { svc } = setup();
  await svc.addRole({ name: "Video team", perms: ["videos"] }, owner);
  await svc.add(newMod({ username: "vid", role: "video-team" }), owner);
  const vid = await svc.lookup("vid");
  assert.equal(vid.role, "video-team");
  assert.equal(await svc.allow("video-team", "view"), true);
  assert.equal(await svc.allow("video-team", "videos"), true);
  assert.equal(await svc.allow("video-team", "links"), false);
  assert.equal(await svc.allow("video-team", "database"), false);
  assert.equal((await svc.roleInfo("video-team")).label, "Video team");
  await rejects(svc.add(newMod({ username: "xx1", role: "no-such-role" }), owner), 400, "role");
});

test("changing a role's access applies on the very next check", async () => {
  const { svc } = setup();
  await svc.addRole({ name: "Support", perms: ["links"] }, owner);
  await svc.add(newMod({ username: "sup", role: "support" }), owner);
  assert.equal(await svc.allow("support", "database"), false);
  const out = await svc.updateRole("support", { name: "Support desk", perms: ["links", "database"] }, owner);
  assert.deepEqual(out.perms, ["view", "links", "database"]);
  assert.equal(await svc.allow("support", "database"), true);
  assert.equal((await svc.lookup("sup")).role, "support", "the key stays, so the person keeps the role");
  assert.equal((await svc.roleInfo("support")).label, "Support desk");
  await svc.updateRole("support", { name: "Support desk", perms: [] }, owner);
  assert.equal(await svc.allow("support", "database"), false);
});

test("built-in roles cannot be changed or deleted; missing roles are 404", async () => {
  const { svc } = setup();
  for (const k of ["admin", "editor", "moderator", "owner"]) {
    await rejects(svc.updateRole(k, { name: "Hacked", perms: ["team"] }, owner), 400);
    await rejects(svc.removeRole(k, owner), 400);
  }
  assert.deepEqual(await svc.permsOf("moderator"), ["view"]);
  await rejects(svc.updateRole("ghost", { name: "Ghost", perms: [] }, owner), 404);
  await rejects(svc.removeRole("ghost", owner), 404);
});

test("removeRole: refused while anyone holds it; works once nobody does", async () => {
  const { store, svc } = setup();
  await svc.addRole({ name: "Support", perms: ["links"] }, owner);
  await svc.add(newMod({ username: "sup", role: "support" }), owner);
  await rejects(svc.removeRole("support", owner), 409);
  assert.equal(store.data.roles.length, 1);
  await svc.update("sup", { role: "moderator" }, owner);
  assert.deepEqual(await svc.removeRole("support", owner), { removed: "support" });
  assert.equal(store.data.roles.length, 0);
  assert.equal(await svc.roleInfo("support"), null);
});

test("a deleted or unknown custom role in the sheet gives no access and no sign-in", async () => {
  const { store, svc } = setup();
  store.data.team.push(["lost", "Lost", "ghost-role", await team.hashPassword("goodpass1"), "Yes", "", ""]);
  assert.equal(await svc.lookup("lost"), null);
  await rejects(svc.login("lost", "goodpass1", OWNER_PW, safeEqual), 403);
  assert.deepEqual(await svc.permsOf("ghost-role"), []);
});

test("roles typed into the sheet cannot raise anyone: unknown access is ignored, built-in keys are ignored, view is forced", async () => {
  const { store, svc } = setup();
  store.data.roles.push(["sneaky", "Sneaky", "links,sudo,root", "", ""]);
  store.data.roles.push(["admin", "Fake admin", "view,team", "", ""]);
  assert.deepEqual(await svc.permsOf("sneaky"), ["view", "links"]);
  assert.deepEqual(await svc.permsOf("admin"), team.PERM_KEYS, "the built-in admin wins over a row in the sheet");
  assert.deepEqual((await svc.roles(owner)).map((r) => r.key), ["admin", "editor", "moderator", "sneaky"]);
});

test("nobody can give access they do not have: roles, assignments", async () => {
  const { svc } = setup();
  // an admin-made custom role that may manage the team and the links, but not the database
  await svc.addRole({ name: "Team lead", perms: ["team", "links"] }, owner);
  await svc.add(newMod({ username: "lead", role: "team-lead" }), owner);
  const lead = await svc.lookup("lead");
  // cannot create a role with the database, or with an access it lacks
  await rejects(svc.addRole({ name: "Sneaky", perms: ["database"] }, lead), 400, "perms");
  const ok = await svc.addRole({ name: "Links only", perms: ["links"] }, lead);
  assert.deepEqual(ok.perms, ["view", "links"]);
  // cannot give the built-in admin or editor roles (they allow the database)
  await rejects(svc.add(newMod({ username: "nn1", role: "admin" }), lead), 400, "role");
  await rejects(svc.add(newMod({ username: "nn2", role: "editor" }), lead), 400, "role");
  await svc.add(newMod({ username: "nn3", role: "links-only" }), lead);
  await svc.add(newMod({ username: "nn4", role: "moderator" }), lead);
  // and the roles list marks what it may hand out
  const marks = Object.fromEntries((await svc.roles(lead)).map((r) => [r.key, r.canGrant]));
  assert.deepEqual(marks, { admin: false, editor: false, moderator: true, "team-lead": true, "links-only": true });
});

test("a person with less access cannot change, disable, re-role or remove someone with more", async () => {
  const { svc } = setup();
  await svc.addRole({ name: "Team lead", perms: ["team"] }, owner);
  await svc.add(newMod({ username: "lead", role: "team-lead" }), owner);
  await svc.add(newMod({ username: "edna", role: "editor" }), owner);
  const lead = await svc.lookup("lead");
  await rejects(svc.update("edna", { password: "takeover123" }, lead), 403);
  await rejects(svc.update("edna", { active: false }, lead), 403);
  await rejects(svc.update("edna", { role: "moderator" }, lead), 403);
  await rejects(svc.remove("edna", lead), 403);
  assert.equal((await svc.lookup("edna")).role, "editor");
  await svc.login("edna", "goodpass1", OWNER_PW, safeEqual);
  // renaming is fine for someone at or below their own level
  await svc.add(newMod({ username: "mod", role: "moderator" }), lead);
  assert.equal((await svc.update("mod", { fullName: "Mod One" }, lead)).name, "Mod One");
});

test("a person cannot change or delete the role they hold, nor a role that allows more than they have", async () => {
  const { svc } = setup();
  await svc.addRole({ name: "Team lead", perms: ["team", "links"] }, owner);
  await svc.addRole({ name: "Big role", perms: ["team", "links", "database"] }, owner);
  await svc.add(newMod({ username: "lead", role: "team-lead" }), owner);
  const lead = await svc.lookup("lead");
  await rejects(svc.updateRole("team-lead", { name: "Team lead", perms: ["team", "links", "videos"] }, lead), 400);
  await rejects(svc.removeRole("team-lead", lead), 400);
  await rejects(svc.updateRole("big-role", { name: "Big role", perms: ["team"] }, lead), 403);
  await rejects(svc.removeRole("big-role", lead), 403);
  assert.deepEqual(await svc.permsOf("big-role"), ["view", "links", "database", "team"]);
});

test("role changes do not touch the sheet when nothing changed", async () => {
  const { store, svc } = setup();
  await svc.addRole({ name: "Support", perms: ["links"] }, owner);
  const before = store.calls.length;
  await svc.updateRole("support", { name: "Support", perms: ["links"] }, owner);
  assert.equal(store.calls.length, before);
});

test("the roles sheet columns match the real sheets.js", (t) => {
  assert.deepEqual(team.ROLE_HEADERS, HEADERS.roles);
  let real;
  try { real = require("../sheets"); } catch (e) { return t.skip("google-auth-library is not installed here"); }
  assert.deepEqual(real.EDITOR_TABS.roles.headers, team.ROLE_HEADERS);
});
