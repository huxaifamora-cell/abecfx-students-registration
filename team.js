// Dashboard team: named accounts with roles, and the roles themselves.
//
// Access (what a role can open) is a list of permissions:
//   view      Statistics, student lists and quiz results. Every role has it: it is what signing in needs.
//   links     Site links (social icons, Deriv link, About, Contact).
//   community Student community: the WhatsApp and Telegram groups the portal's Community page opens.
//   videos    Chapter videos.
//   quizcodes Quiz codes: make and cancel the one-time codes students need to unlock the quiz.
//   database  The Database tab: add, edit and delete records.
//   team      Team accounts and roles.
//
// Built-in roles (fixed, cannot be changed or deleted)
//   owner      Everything. The person who holds ADMIN_PASSWORD on Render is the main owner: always works, is not
//              stored in the sheet and cannot be removed or locked out by anyone. Signs in with the username "owner".
//              An owner can also give the Owner role to a team account (a co-owner). Only an owner can do that, and
//              only an owner can change, disable or remove a co-owner. A co-owner has a normal account on the "Team"
//              tab with their own username and password.
//   admin      Everything, including the team and roles.
//   editor     Statistics, site links, the student community links, chapter videos and the Database. (Not the team, and not quiz codes: give
//              someone "quizcodes" through a custom role, e.g. a "Quiz supervisor" role with only that access.)
//   moderator  Read only: statistics, student lists and quiz results.
// Custom roles are created by anyone with the "team" permission, who picks the access for each one. They live
// on the "Roles" sheet tab (a name and a list of permissions, no secrets).
//
// Accounts live on the "Team" sheet tab. Only a salted scrypt hash of each password is stored, never the
// password itself. A role change, a change to a role's access, a disable or a removal takes effect on the very
// next request, because the sign-in token only says WHO you are; your access is looked up each time.
const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

const OWNER = "owner";

const PERMS = [
  { key: "view", label: "Statistics and quiz results", help: "See statistics, student lists and quiz results. Every role has this; it is needed to sign in." },
  { key: "links", label: "Site links", help: "Change the social icons, Deriv link, About and Contact." },
  { key: "community", label: "Student community", help: "Set the WhatsApp and Telegram groups students open from the Community page of their portal." },
  { key: "videos", label: "Chapter videos", help: "Add or change the YouTube video of each handbook chapter." },
  { key: "quizcodes", label: "Quiz codes", help: "Make and cancel the one-time codes students need to unlock the quiz." },
  { key: "database", label: "Database", help: "Add, edit and delete students, codes, quiz results and other records." },
  { key: "team", label: "Team and roles", help: "Add team members, create roles and choose their access." },
];
const PERM_KEYS = PERMS.map((p) => p.key);
const ALL = PERM_KEYS.slice();

const ROLES = {
  owner: { label: "Owner", perms: ALL },
  admin: { label: "Admin", perms: ALL },
  editor: { label: "Editor", perms: ["view", "links", "community", "videos", "database"] },
  moderator: { label: "Moderator", perms: ["view"] },
};
// Built-in roles a person may be given. "owner" is in the list but only an owner may hand it out.
const ASSIGNABLE = ["owner", "admin", "editor", "moderator"];
const RESERVED_ROLE_KEYS = Object.keys(ROLES);

// Sheet columns (also listed in sheets.js, and a test checks they match).
const HEADERS = ["Username", "Full Name", "Role", "Password Hash (do not edit)", "Active", "Created At (Lagos)", "Created By"];
const COL = { username: 0, name: 1, role: 2, hash: 3, active: 4, createdAt: 5, createdBy: 6 };

// The "Roles" tab: custom roles only (the built-in ones live in this file).
const ROLE_HEADERS = ["Role Key (do not edit)", "Role Name", "Access (do not edit)", "Created At (Lagos)", "Created By"];
const RCOL = { key: 0, name: 1, perms: 2, createdAt: 3, createdBy: 4 };

class TeamError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

// Built-in roles only. Custom roles are looked up through the service (permsOf).
const can = (role, perm) => Boolean(ROLES[role] && ROLES[role].perms.includes(perm));

// ---------- Input checks ----------
function normUsername(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}
function usernameError(u) {
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(u)) return "Use 3 to 30 letters, numbers, dots, dashes or underscores.";
  if (u === OWNER) return "That username is reserved.";
  return "";
}
function passwordError(p) {
  if (typeof p !== "string" || p.length < 8) return "Use at least 8 characters.";
  if (p.length > 100) return "Use 100 characters or fewer.";
  return "";
}
function roleKeyFrom(name) {
  return oneLine(name, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/g, "");
}
// Keep only known permissions, always include "view", and put them in the standard order.
function cleanPerms(list) {
  const set = new Set(Array.isArray(list) ? list.map(String) : []);
  return PERM_KEYS.filter((k) => k === "view" || set.has(k));
}
function oneLine(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

// ---------- Passwords ----------
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return "s1$" + salt.toString("base64url") + "$" + key.toString("base64url");
}
async function verifyPassword(pw, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "s1" || typeof pw !== "string") return false;
  try {
    const salt = Buffer.from(parts[1], "base64url");
    const want = Buffer.from(parts[2], "base64url");
    const got = await scrypt(pw, salt, want.length);
    return want.length > 0 && crypto.timingSafeEqual(got, want);
  } catch (e) {
    return false;
  }
}
// Spent on unknown usernames, so "no such user" and "wrong password" take about as long.
const DUMMY_HASH_PROMISE = hashPassword("not-a-real-password");

// ---------- Sign-in tokens ----------
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const TOKEN_PREFIX = "t1.";

function mac(payload, secret) {
  return crypto.createHmac("sha256", secret).update("admin." + payload).digest("base64url");
}
function signToken(username, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: username, e: now + TOKEN_TTL_MS })).toString("base64url");
  return TOKEN_PREFIX + payload + "." + mac(payload, secret);
}
// Returns the username, or null when the token is wrong, tampered with or expired.
function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX) || token.length > 600 || !secret) return null;
  const [payload, sig, extra] = token.slice(TOKEN_PREFIX.length).split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const a = Buffer.from(mac(payload, secret));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof d.u !== "string" || !(d.e > now)) return null;
    return d.u;
  } catch (e) {
    return null;
  }
}

// ---------- Rows <-> people ----------
function fromRows(rows) {
  return rows
    .map(({ n, cells }) => ({
      n,
      username: normUsername(cells[COL.username]),
      name: cells[COL.name] || "",
      role: String(cells[COL.role] || "").trim().toLowerCase(),
      hash: cells[COL.hash] || "",
      active: String(cells[COL.active] || "").trim().toLowerCase() !== "no",
      createdAt: cells[COL.createdAt] || "",
      createdBy: cells[COL.createdBy] || "",
    }))
    .filter((u) => u.username);
}
// What the dashboard may see: everything except the hash.
function publicUser(u) {
  return { username: u.username, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt, createdBy: u.createdBy };
}

function roleFromRows(rows) {
  return rows
    .map(({ n, cells }) => ({
      n,
      key: String(cells[RCOL.key] || "").trim().toLowerCase(),
      label: cells[RCOL.name] || "",
      // only permissions that exist; "view" is always there
      perms: cleanPerms(String(cells[RCOL.perms] || "").split(",").map((x) => x.trim())),
      createdAt: cells[RCOL.createdAt] || "",
      createdBy: cells[RCOL.createdBy] || "",
    }))
    .filter((r) => r.key && !ROLES[r.key]);
}

// ---------- The service ----------
// `store` needs tabRows / appendTabRows / writeTabCells / deleteTabRow for the "team" and "roles" tabs (sheets.js,
// or the in-memory stand-in the tests use). `now` gives the "Created At" text.
function create(store, opts = {}) {
  const stamp = opts.now || (() => new Date().toISOString());
  const cacheMs = opts.cacheMs == null ? 10000 : opts.cacheMs;
  let cache = { at: 0, users: [] };
  let roleCache = { at: 0, roles: [] };
  let chain = Promise.resolve();
  // Changes go one at a time, so two admins adding the same username (or role) cannot both succeed.
  const queued = (task) => {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  };
  const forget = () => { cache = { at: 0, users: [] }; roleCache = { at: 0, roles: [] }; };

  async function listFresh() {
    const users = fromRows(await store.tabRows("team"));
    cache = { at: Date.now(), users };
    return users;
  }
  async function list() {
    if (cache.at && Date.now() - cache.at < cacheMs) return cache.users;
    return listFresh();
  }

  // ----- roles -----
  async function customFresh() {
    const roles = roleFromRows(await store.tabRows("roles"));
    roleCache = { at: Date.now(), roles };
    return roles;
  }
  async function customList() {
    if (roleCache.at && Date.now() - roleCache.at < cacheMs) return roleCache.roles;
    return customFresh();
  }
  // { key, label, perms, builtin } for a role key, or null when there is no such role.
  async function roleInfo(key) {
    if (ROLES[key]) return { key, label: ROLES[key].label, perms: ROLES[key].perms.slice(), builtin: true };
    const r = (await customList()).find((x) => x.key === key);
    return r ? { key: r.key, label: r.label, perms: r.perms.slice(), builtin: false } : null;
  }
  async function permsOf(key) {
    // The owner never depends on the sheet.
    if (key === "owner") return ALL.slice();
    const r = await roleInfo(key);
    return r ? r.perms : [];
  }
  async function allow(role, perm) {
    return (await permsOf(role)).includes(perm);
  }
  const subsetOf = (perms, have) => perms.every((p) => have.includes(p));
  async function permsOfActor(actor) {
    return permsOf(actor.role);
  }

  // Roles a person can be given, with what each allows and whether the signed-in person may hand it out.
  // `actor` is optional; without it every role is marked as grantable.
  async function roles(actor) {
    const users = await listFresh();
    const have = actor ? await permsOfActor(actor) : ALL;
    const custom = await customFresh();
    const count = (key) => users.filter((u) => u.role === key).length;
    const out = ASSIGNABLE.map((k) => ({ key: k, label: ROLES[k].label, perms: ROLES[k].perms.slice(), builtin: true }));
    custom.forEach((r) => out.push({ key: r.key, label: r.label, perms: r.perms.slice(), builtin: false, createdAt: r.createdAt, createdBy: r.createdBy }));
    return out.map((r) => ({ ...r, members: count(r.key), canGrant: subsetOf(r.perms, have) && (r.key !== "owner" || !actor || actor.role === "owner") }));
  }

  // Who is this username right now? { username, name, role } or null (unknown, disabled or an unknown role).
  async function lookup(username) {
    if (username === OWNER) return { username: OWNER, name: "Owner", role: "owner" };
    const u = (await list()).find((x) => x.username === username);
    if (!u || !u.active || !(await roleInfo(u.role))) return null;
    return { username: u.username, name: u.name, role: u.role };
  }

  async function login(username, password, ownerPassword, safeEqual) {
    const name = normUsername(username);
    if (name === OWNER) {
      if (!ownerPassword) throw new TeamError(503, "The dashboard is not set up yet. Set ADMIN_PASSWORD on Render.");
      if (!safeEqual(String(password || ""), ownerPassword)) throw new TeamError(401, "Wrong username or password.");
      return { username: OWNER, name: "Owner", role: "owner" };
    }
    const u = (await list()).find((x) => x.username === name);
    const ok = await verifyPassword(String(password || ""), u ? u.hash : await DUMMY_HASH_PROMISE);
    if (!u || !ok) throw new TeamError(401, "Wrong username or password.");
    if (!u.active) throw new TeamError(403, "This account has been disabled. Ask an admin.");
    if (!(await roleInfo(u.role))) throw new TeamError(403, "This account has no valid role. Ask an admin.");
    return { username: u.username, name: u.name, role: u.role };
  }

  // For the sign-in drop-down: the roles somebody can sign in as, and how many accounts each has.
  // Usernames are never listed.
  async function loginChoices() {
    // The main owner (ADMIN_PASSWORD) always counts as one, plus any co-owners on the team.
    const out = [{ key: "owner", label: ROLES.owner.label, count: 1 }];
    const byRole = new Map();
    for (const u of await list()) {
      if (!u.active) continue;
      byRole.set(u.role, (byRole.get(u.role) || 0) + 1);
    }
    for (const [key, count] of byRole) {
      if (key === "owner") { out[0].count += count; continue; }
      const info = await roleInfo(key);
      if (info) out.push({ key, label: info.label, count });
    }
    const order = ["owner", "admin", "editor", "moderator"];
    out.sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99) || a.label.localeCompare(b.label));
    return out;
  }

  // The sign-in page picks a role, and the role name is the username. Return the accounts that hold that role;
  // the password then decides which of them is signing in.
  async function loginNames(roleKey) {
    const role = String(roleKey || "").toLowerCase();
    const names = (await list()).filter((u) => u.active && u.role === role).map((u) => u.username);
    return role === "owner" ? [OWNER, ...names] : names;
  }

  async function members() {
    return (await listFresh()).map(publicUser);
  }

  // A role the actor may give to someone: it must exist, must not be the owner, and may not allow more than the actor has.
  async function checkAssignable(role, actor, errors) {
    if (!role) { errors.role = "Choose a role."; return false; }
    const info = await roleInfo(role);
    if (!info) { errors.role = "That role does not exist."; return false; }
    if (role === "owner" && !(actor && actor.role === "owner")) {
      errors.role = "Only an owner can make someone an owner.";
      return false;
    }
    if (actor && !subsetOf(info.perms, await permsOfActor(actor))) {
      errors.role = "You cannot give a role that allows more than you can do yourself.";
      return false;
    }
    return true;
  }

  function add(input, actor) {
    return queued(async () => {
      const b = input || {};
      const username = normUsername(b.username);
      const name = oneLine(b.fullName, 80);
      const errors = {};
      const ue = usernameError(username);
      if (ue) errors.username = ue;
      if (!name) errors.fullName = "Enter their full name.";
      await checkAssignable(b.role, actor, errors);
      const pe = passwordError(b.password);
      if (pe) errors.password = pe;
      if (Object.keys(errors).length) throw new TeamError(400, "Please fix the highlighted fields.", errors);
      const users = await listFresh();
      if (users.some((u) => u.username === username)) {
        throw new TeamError(409, "That username is already taken.", { username: "That username is already taken." });
      }
      const hash = await hashPassword(b.password);
      const row = [];
      row[COL.username] = username; row[COL.name] = name; row[COL.role] = b.role; row[COL.hash] = hash;
      row[COL.active] = "Yes"; row[COL.createdAt] = stamp(); row[COL.createdBy] = actor.username;
      await store.appendTabRows("team", [row]);
      forget();
      return publicUser({ username, name, role: b.role, active: true, createdAt: row[COL.createdAt], createdBy: actor.username });
    });
  }

  // changes: any of { fullName, role, active, password }. Nobody can demote, disable or remove themselves.
  function update(username, changes, actor) {
    return queued(async () => {
      const target = normUsername(username);
      const c = changes || {};
      const u = (await listFresh()).find((x) => x.username === target);
      if (!u) throw new TeamError(404, "That account no longer exists.");
      const self = target === actor.username;
      const errors = {};
      const write = {};
      if (c.fullName !== undefined) {
        const name = oneLine(c.fullName, 80);
        if (!name) errors.fullName = "Enter their full name."; else write[COL.name] = name;
      }
      if (c.role !== undefined && c.role !== u.role) {
        if (self) throw new TeamError(400, "You cannot change your own role.");
        if (await checkAssignable(c.role, actor, errors)) write[COL.role] = c.role;
      }
      // A co-owner is out of reach of everyone who is not an owner (an admin has the same access, so the access
      // comparison below would not stop them).
      if (!self && u.role === "owner" && actor.role !== "owner") {
        throw new TeamError(403, "Only an owner can change an owner's account.");
      }
      // Someone whose current role allows more than the actor can do is out of the actor's reach.
      if (!self && (write[COL.role] !== undefined || c.active !== undefined || (c.password !== undefined && c.password !== ""))) {
        const theirs = await permsOf(u.role);
        if (!subsetOf(theirs, await permsOfActor(actor))) {
          throw new TeamError(403, "This person can do more than you can, so you cannot change their account.");
        }
      }
      if (c.active !== undefined && Boolean(c.active) !== u.active) {
        if (self) throw new TeamError(400, "You cannot disable your own account.");
        write[COL.active] = c.active ? "Yes" : "No";
      }
      if (c.password !== undefined && c.password !== "") {
        const pe = passwordError(c.password);
        if (pe) errors.password = pe; else write[COL.hash] = await hashPassword(c.password);
      }
      if (Object.keys(errors).length) throw new TeamError(400, "Please fix the highlighted fields.", errors);
      if (Object.keys(write).length) {
        await store.writeTabCells("team", u.n, write);
        forget();
      }
      return publicUser((await listFresh()).find((x) => x.username === target));
    });
  }

  function remove(username, actor) {
    return queued(async () => {
      const target = normUsername(username);
      if (target === actor.username) throw new TeamError(400, "You cannot remove your own account.");
      const u = (await listFresh()).find((x) => x.username === target);
      if (!u) throw new TeamError(404, "That account no longer exists.");
      if (u.role === "owner" && actor.role !== "owner") throw new TeamError(403, "Only an owner can remove an owner.");
      if (!subsetOf(await permsOf(u.role), await permsOfActor(actor))) {
        throw new TeamError(403, "This person can do more than you can, so you cannot remove them.");
      }
      await store.deleteTabRow("team", u.n);
      forget();
      return { removed: target };
    });
  }

  // A team member changes their own password (the owner's lives on Render, not here).
  function changeOwnPassword(username, current, next) {
    return queued(async () => {
      const target = normUsername(username);
      const u = (await listFresh()).find((x) => x.username === target);
      if (!u) throw new TeamError(404, "Account not found.");
      if (!(await verifyPassword(String(current || ""), u.hash))) {
        throw new TeamError(400, "Your current password is not right.", { current: "Your current password is not right." });
      }
      const pe = passwordError(next);
      if (pe) throw new TeamError(400, pe, { next: pe });
      await store.writeTabCells("team", u.n, { [COL.hash]: await hashPassword(next) });
      forget();
      return { ok: true };
    });
  }

  // ----- creating and changing roles -----
  // input: { name, perms: [permission keys] }. "view" is always included.
  // Nobody can give a role access they do not have themselves, and nobody changes the role they hold.
  function checkRoleInput(input, actorPerms, errors) {
    const b = input || {};
    const label = oneLine(b.name, 40);
    if (!label) errors.name = "Enter a name for the role.";
    const asked = Array.isArray(b.perms) ? b.perms.map(String) : [];
    const unknown = asked.filter((k) => !PERM_KEYS.includes(k));
    if (unknown.length) errors.perms = "Unknown access: " + unknown.join(", ") + ".";
    const perms = cleanPerms(asked);
    if (!errors.perms && !subsetOf(perms, actorPerms)) errors.perms = "You can only give access that you have yourself.";
    return { label, perms };
  }

  function addRole(input, actor) {
    return queued(async () => {
      const errors = {};
      const { label, perms } = checkRoleInput(input, await permsOfActor(actor), errors);
      const key = roleKeyFrom(label);
      if (label && key.length < 3) errors.name = "Use at least 3 letters or numbers in the name.";
      else if (label && RESERVED_ROLE_KEYS.includes(key)) errors.name = "That name is taken by a built-in role. Choose another.";
      if (Object.keys(errors).length) throw new TeamError(400, "Please fix the highlighted fields.", errors);
      if ((await customFresh()).some((r) => r.key === key)) {
        throw new TeamError(409, "A role with that name already exists.", { name: "A role with that name already exists." });
      }
      const row = [];
      row[RCOL.key] = key; row[RCOL.name] = label; row[RCOL.perms] = perms.join(",");
      row[RCOL.createdAt] = stamp(); row[RCOL.createdBy] = actor.username;
      await store.appendTabRows("roles", [row]);
      forget();
      return { key, label, perms, builtin: false, createdAt: row[RCOL.createdAt], createdBy: actor.username };
    });
  }

  function updateRole(key, input, actor) {
    return queued(async () => {
      if (ROLES[key]) throw new TeamError(400, "Built-in roles cannot be changed.");
      const r = (await customFresh()).find((x) => x.key === key);
      if (!r) throw new TeamError(404, "That role no longer exists.");
      if (actor.role === key) throw new TeamError(400, "You cannot change the role you hold. Ask someone else with access to the team.");
      const have = await permsOfActor(actor);
      // A role that allows more than the actor cannot be reduced or renamed by the actor either.
      if (!subsetOf(r.perms, have)) throw new TeamError(403, "This role allows more than you can do, so you cannot change it.");
      const errors = {};
      const { label, perms } = checkRoleInput(input, have, errors);
      if (Object.keys(errors).length) throw new TeamError(400, "Please fix the highlighted fields.", errors);
      const write = {};
      if (label !== r.label) write[RCOL.name] = label;
      if (perms.join(",") !== r.perms.join(",")) write[RCOL.perms] = perms.join(",");
      if (Object.keys(write).length) {
        await store.writeTabCells("roles", r.n, write);
        forget();
      }
      return { key, label, perms, builtin: false, createdAt: r.createdAt, createdBy: r.createdBy };
    });
  }

  function removeRole(key, actor) {
    return queued(async () => {
      if (ROLES[key]) throw new TeamError(400, "Built-in roles cannot be removed.");
      const r = (await customFresh()).find((x) => x.key === key);
      if (!r) throw new TeamError(404, "That role no longer exists.");
      if (actor.role === key) throw new TeamError(400, "You cannot remove the role you hold.");
      if (!subsetOf(r.perms, await permsOfActor(actor))) throw new TeamError(403, "This role allows more than you can do, so you cannot remove it.");
      const using = (await listFresh()).filter((u) => u.role === key).length;
      if (using) {
        throw new TeamError(409, using === 1
          ? "One team member still has this role. Give them another role first."
          : using + " team members still have this role. Give them another role first.");
      }
      await store.deleteTabRow("roles", r.n);
      forget();
      return { removed: key };
    });
  }

  return {
    lookup, login, loginChoices, loginNames, members, add, update, remove, changeOwnPassword,
    roles, roleInfo, permsOf, allow, addRole, updateRole, removeRole,
  };
}

module.exports = {
  OWNER, ROLES, ASSIGNABLE, PERMS, PERM_KEYS, RESERVED_ROLE_KEYS, HEADERS, COL, ROLE_HEADERS, RCOL, TeamError, can, create,
  hashPassword, verifyPassword, signToken, verifyToken, normUsername, usernameError, passwordError, fromRows, publicUser,
  roleKeyFrom, cleanPerms, roleFromRows,
};
