// Run with:  npm test   (node --test)
const test = require("node:test");
const assert = require("node:assert/strict");
const staff = require("../staff");
const { createMemoryStore, HEADERS } = require("./support/memory-store");

const safeEqual = (a, b) => a === b;
const OWNER_PW = "owner-secret-123";
const owner = { username: "owner", name: "Owner", role: "owner" };

function setup() {
  const store = createMemoryStore();
  const svc = staff.create(store, { now: () => "18 Oct 2026, 10:00:00", cacheMs: 0 });
  return { store, svc };
}
const rejects = (p, status, field) =>
  assert.rejects(p, (e) => {
    assert.ok(e instanceof staff.StaffError, "expected a StaffError but got: " + e);
    assert.equal(e.status, status, e.message);
    if (field) assert.ok(e.fields && e.fields[field], "expected an error on " + field + ", got " + JSON.stringify(e.fields));
    return true;
  });
const newMod = (over) => ({ username: "amaka", fullName: "Amaka Obi", role: "moderator", password: "goodpass1", ...over });

test("staff columns match the real sheets.js (when its dependencies are installed)", (t) => {
  assert.deepEqual(staff.HEADERS, HEADERS.staff);
  let real;
  try { real = require("../sheets"); } catch (e) { return t.skip("google-auth-library is not installed here"); }
  assert.deepEqual(real.EDITOR_TABS.staff.headers, staff.HEADERS);
});

test("built-in roles: owner and admin everything, editor everything but the staff and quiz codes, moderator only view", () => {
  const all = ["view", "links", "community", "videos", "quizcodes", "certificates", "database", "staff"];
  assert.deepEqual(staff.PERM_KEYS, all);
  for (const r of ["admin", "owner"]) for (const p of all) assert.equal(staff.can(r, p), true, r + " " + p);
  for (const p of ["view", "links", "community", "videos", "database"]) assert.equal(staff.can("editor", p), true, "editor " + p);
  assert.equal(staff.can("editor", "staff"), false);
  assert.equal(staff.can("editor", "quizcodes"), false, "quiz codes are given through a custom role, not to every editor");
  assert.equal(staff.can("moderator", "view"), true);
  for (const p of ["links", "community", "videos", "quizcodes", "certificates", "database", "staff"]) assert.equal(staff.can("moderator", p), false, "moderator " + p);
  assert.equal(staff.can("editor", "certificates"), false, "certificates are given through a custom role, not to every editor");
  assert.equal(staff.can("nobody", "view"), false);
  assert.deepEqual(staff.ASSIGNABLE, ["owner", "admin", "editor", "moderator"]);
});

test("passwords are hashed with a salt and verified", async () => {
  const h1 = await staff.hashPassword("goodpass1");
  const h2 = await staff.hashPassword("goodpass1");
  assert.notEqual(h1, h2, "each hash has its own salt");
  assert.ok(!h1.includes("goodpass1"));
  assert.equal(await staff.verifyPassword("goodpass1", h1), true);
  assert.equal(await staff.verifyPassword("goodpass2", h1), false);
  assert.equal(await staff.verifyPassword("goodpass1", ""), false);
  assert.equal(await staff.verifyPassword("goodpass1", "junk$value"), false);
});

test("sign-in tokens: valid, tampered, expired, wrong secret", () => {
  const t = staff.signToken("amaka", "secret", 1000);
  assert.equal(staff.verifyToken(t, "secret", 2000), "amaka");
  assert.equal(staff.verifyToken(t, "other", 2000), null);
  assert.equal(staff.verifyToken(t + "x", "secret", 2000), null);
  assert.equal(staff.verifyToken(t, "secret", 1000 + 13 * 60 * 60 * 1000), null, "expires after 12 hours");
  assert.equal(staff.verifyToken("not-a-token", "secret"), null);
  assert.equal(staff.verifyToken(OWNER_PW, OWNER_PW), null, "a raw password is not a token");
});

test("add: stores a hash, never the password, and lists without it", async () => {
  const { store, svc } = setup();
  const who = await svc.add(newMod(), owner);
  assert.deepEqual(who, { username: "amaka", name: "Amaka Obi", role: "moderator", active: true, createdAt: "18 Oct 2026, 10:00:00", createdBy: "owner" });
  const row = store.data.staff[0];
  assert.equal(row[0], "amaka");
  assert.ok(row[3].startsWith("s1$"));
  assert.ok(!JSON.stringify(store.data.staff).includes("goodpass1"));
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
  await rejects(svc.add(newMod({ role: "superuser" }), owner), 400, "role");
  await rejects(svc.add(newMod({ password: "short" }), owner), 400, "password");
  await svc.add(newMod(), owner);
  await rejects(svc.add(newMod({ username: "AMAKA" }), owner), 409, "username");
});

test("two adds of the same username at once: only one wins", async () => {
  const { store, svc } = setup();
  const results = await Promise.allSettled([svc.add(newMod(), owner), svc.add(newMod(), owner)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(store.data.staff.length, 1);
});

test("login: owner password, staff password, wrong, unknown, disabled", async () => {
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

test("an owner can make a co-owner, who signs in with their own password and has full access", async () => {
  const { svc } = setup();
  const made = await svc.add(newMod({ username: "coowner", fullName: "Co Owner", role: "owner" }), owner);
  assert.equal(made.role, "owner");
  const who = await svc.login("coowner", "goodpass1", OWNER_PW, safeEqual);
  assert.deepEqual(who, { username: "coowner", name: "Co Owner", role: "owner" });
  assert.deepEqual(await svc.lookup("coowner"), who);
  assert.deepEqual(await svc.permsOf("owner"), staff.PERM_KEYS);
  // the role picker on the sign-in page: one Owner entry, counting the main owner and the co-owner
  assert.equal((await svc.loginChoices()).find((c) => c.key === "owner").count, 2);
  assert.deepEqual(await svc.loginNames("owner"), ["owner", "coowner"]);
  // an existing member can be promoted too
  await svc.add(newMod({ username: "amaka" }), owner);
  assert.equal((await svc.update("amaka", { role: "owner" }, owner)).role, "owner");
  // the main owner is unaffected: still works, still cannot be removed or edited through the staff
  assert.deepEqual(await svc.lookup("owner"), owner);
  await rejects(svc.remove("owner", who), 404);
});

test("only an owner can give the Owner role or touch a co-owner (not an admin, not a custom role with the staff access)", async () => {
  const { svc } = setup();
  await svc.add(newMod({ username: "coowner", role: "owner" }), owner);
  const admin = await adminOf(svc);
  await svc.add(newMod({ username: "amaka" }), owner);
  await rejects(svc.add(newMod({ username: "sneaky", role: "owner" }), admin), 400, "role");
  await rejects(svc.update("amaka", { role: "owner" }, admin), 400, "role");
  await rejects(svc.update("coowner", { active: false }, admin), 403);
  await rejects(svc.update("coowner", { password: "hijacked99" }, admin), 403);
  await rejects(svc.update("coowner", { role: "moderator" }, admin), 403);
  await rejects(svc.remove("coowner", admin), 403);
  await svc.login("coowner", "goodpass1", OWNER_PW, safeEqual);
  // a custom role with every access except being an owner has the same limits
  await svc.addRole({ name: "Everything", perms: staff.PERM_KEYS }, owner);
  await svc.add(newMod({ username: "everyone", role: "everything" }), owner);
  const every = await svc.lookup("everyone");
  await rejects(svc.update("coowner", { active: false }, every), 403);
  await rejects(svc.remove("coowner", every), 403);
});

test("co-owners can manage other owners but not themselves; demoting takes effect at once", async () => {
  const { svc } = setup();
  await svc.add(newMod({ username: "co1", role: "owner" }), owner);
  await svc.add(newMod({ username: "co2", fullName: "Co Two", role: "owner" }), owner);
  const co1 = await svc.lookup("co1");
  await rejects(svc.update("co1", { role: "admin" }, co1), 400);
  await rejects(svc.update("co1", { active: false }, co1), 400);
  await rejects(svc.remove("co1", co1), 400);
  assert.equal((await svc.add(newMod({ username: "co3", role: "owner" }), co1)).role, "owner");
  assert.equal((await svc.update("co2", { role: "admin" }, co1)).role, "admin");
  assert.equal((await svc.lookup("co2")).role, "admin");
  assert.deepEqual(await svc.remove("co2", co1), { removed: "co2" });
  // a co-owner changes their own password like any member
  await svc.changeOwnPassword("co1", "goodpass1", "newpass123");
  await svc.login("co1", "newpass123", OWNER_PW, safeEqual);
});

test("update: name, role, active, password; invalid input is rejected", async () => {
  const { store, svc } = setup();
  await svc.add(newMod(), owner);
  const out = await svc.update("amaka", { fullName: "Amaka N. Obi", role: "admin", password: "brandnew99" }, owner);
  assert.equal(out.name, "Amaka N. Obi");
  assert.equal(out.role, "admin");
  assert.equal((await svc.login("amaka", "brandnew99", OWNER_PW, safeEqual)).role, "admin");
  await rejects(svc.login("amaka", "goodpass1", OWNER_PW, safeEqual), 401);
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
  assert.deepEqual(store.data.staff.map((r) => r[0]), ["two"]);
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
  assert.equal(await svc.allow("editor", "staff"), false);
  assert.equal((await svc.login("edna", "goodpass1", OWNER_PW, safeEqual)).role, "editor");
});

test("roles list: built-in roles plus custom ones, with member counts; only an owner can grant Owner", async () => {
  const { svc } = setup();
  await svc.add(newMod({ username: "edna", role: "editor" }), owner);
  await svc.addRole({ name: "Support", perms: ["links"] }, owner);
  const list = await svc.roles(owner);
  assert.deepEqual(list.map((r) => r.key), ["owner", "admin", "editor", "moderator", "support"]);
  assert.equal(list.find((r) => r.key === "editor").members, 1);
  assert.equal(list.find((r) => r.key === "support").builtin, false);
  assert.ok(list.every((r) => r.canGrant));
  const admin = await adminOf(svc);
  const forAdmin = await svc.roles(admin);
  assert.equal(forAdmin.find((r) => r.key === "owner").canGrant, false);
  assert.ok(forAdmin.filter((r) => r.key !== "owner").every((r) => r.canGrant));
});

test("addRole: stores a name and the picked access; \"view\" is always included; order is standard", async () => {
  const { store, svc } = setup();
  const r = await svc.addRole({ name: "  Video   Staff ", perms: ["videos", "links"] }, owner);
  assert.deepEqual(r, { key: "video-staff", label: "Video Staff", perms: ["view", "links", "videos"], builtin: false, createdAt: "18 Oct 2026, 10:00:00", createdBy: "owner" });
  assert.deepEqual(store.data.roles[0].slice(0, 3), ["video-staff", "Video Staff", "view,links,videos"]);
  assert.deepEqual(await svc.permsOf("video-staff"), ["view", "links", "videos"]);
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
  await svc.addRole({ name: "Video staff", perms: ["videos"] }, owner);
  await svc.add(newMod({ username: "vid", role: "video-staff" }), owner);
  const vid = await svc.lookup("vid");
  assert.equal(vid.role, "video-staff");
  assert.equal(await svc.allow("video-staff", "view"), true);
  assert.equal(await svc.allow("video-staff", "videos"), true);
  assert.equal(await svc.allow("video-staff", "links"), false);
  assert.equal(await svc.allow("video-staff", "database"), false);
  assert.equal((await svc.roleInfo("video-staff")).label, "Video staff");
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
    await rejects(svc.updateRole(k, { name: "Hacked", perms: ["staff"] }, owner), 400);
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
  store.data.staff.push(["lost", "Lost", "ghost-role", await staff.hashPassword("goodpass1"), "Yes", "", ""]);
  assert.equal(await svc.lookup("lost"), null);
  await rejects(svc.login("lost", "goodpass1", OWNER_PW, safeEqual), 403);
  assert.deepEqual(await svc.permsOf("ghost-role"), []);
});

test("roles typed into the sheet cannot raise anyone: unknown access is ignored, built-in keys are ignored, view is forced", async () => {
  const { store, svc } = setup();
  store.data.roles.push(["sneaky", "Sneaky", "links,sudo,root", "", ""]);
  store.data.roles.push(["admin", "Fake admin", "view,staff", "", ""]);
  assert.deepEqual(await svc.permsOf("sneaky"), ["view", "links"]);
  assert.deepEqual(await svc.permsOf("admin"), staff.PERM_KEYS, "the built-in admin wins over a row in the sheet");
  assert.deepEqual((await svc.roles(owner)).map((r) => r.key), ["owner", "admin", "editor", "moderator", "sneaky"]);
});

test("nobody can give access they do not have: roles, assignments", async () => {
  const { svc } = setup();
  // an admin-made custom role that may manage the staff and the links, but not the database
  await svc.addRole({ name: "Staff lead", perms: ["staff", "links"] }, owner);
  await svc.add(newMod({ username: "lead", role: "staff-lead" }), owner);
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
  assert.deepEqual(marks, { owner: false, admin: false, editor: false, moderator: true, "staff-lead": true, "links-only": true });
});

test("a person with less access cannot change, disable, re-role or remove someone with more", async () => {
  const { svc } = setup();
  await svc.addRole({ name: "Staff lead", perms: ["staff"] }, owner);
  await svc.add(newMod({ username: "lead", role: "staff-lead" }), owner);
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
  await svc.addRole({ name: "Staff lead", perms: ["staff", "links"] }, owner);
  await svc.addRole({ name: "Big role", perms: ["staff", "links", "database"] }, owner);
  await svc.add(newMod({ username: "lead", role: "staff-lead" }), owner);
  const lead = await svc.lookup("lead");
  await rejects(svc.updateRole("staff-lead", { name: "Staff lead", perms: ["staff", "links", "videos"] }, lead), 400);
  await rejects(svc.removeRole("staff-lead", lead), 400);
  await rejects(svc.updateRole("big-role", { name: "Big role", perms: ["staff"] }, lead), 403);
  await rejects(svc.removeRole("big-role", lead), 403);
  assert.deepEqual(await svc.permsOf("big-role"), ["view", "links", "database", "staff"]);
});

test("role changes do not touch the sheet when nothing changed", async () => {
  const { store, svc } = setup();
  await svc.addRole({ name: "Support", perms: ["links"] }, owner);
  const before = store.calls.length;
  await svc.updateRole("support", { name: "Support", perms: ["links"] }, owner);
  assert.equal(store.calls.length, before);
});

test("the roles sheet columns match the real sheets.js", (t) => {
  assert.deepEqual(staff.ROLE_HEADERS, HEADERS.roles);
  let real;
  try { real = require("../sheets"); } catch (e) { return t.skip("google-auth-library is not installed here"); }
  assert.deepEqual(real.EDITOR_TABS.roles.headers, staff.ROLE_HEADERS);
});
