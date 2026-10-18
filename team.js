// Dashboard team: named accounts with roles.
//
// Roles
//   owner      The person who holds ADMIN_PASSWORD on Render. Always works, is not stored in the sheet and
//              cannot be removed or locked out by anyone. Signs in with the username "owner".
//   admin      Sees everything, changes the site (links, videos, database) and manages the team.
//   moderator  Read only: statistics, student lists and quiz results. No site changes, no database, no team.
//
// Accounts live on the "Team" sheet tab. Only a salted scrypt hash of each password is stored, never the
// password itself. A role change, a disable or a removal takes effect on the very next request, because the
// sign-in token only says WHO you are; your role is looked up each time.
const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

const OWNER = "owner";

// To add a role later (say "editor"), add one line here and, if people may be given it, to ASSIGNABLE.
const ROLES = {
  owner: { label: "Owner", perms: ["view", "manage", "team"] },
  admin: { label: "Admin", perms: ["view", "manage", "team"] },
  moderator: { label: "Moderator", perms: ["view"] },
};
const ASSIGNABLE = ["admin", "moderator"];

// Sheet columns (also listed in sheets.js, and a test checks they match).
const HEADERS = ["Username", "Full Name", "Role", "Password Hash (do not edit)", "Active", "Created At (Lagos)", "Created By"];
const COL = { username: 0, name: 1, role: 2, hash: 3, active: 4, createdAt: 5, createdBy: 6 };

class TeamError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

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

// ---------- The service ----------
// `store` needs tabRows / appendTabRows / writeTabCells / deleteTabRow for the "team" tab (sheets.js, or the
// in-memory stand-in the tests use). `now` gives the "Created At" text.
function create(store, opts = {}) {
  const stamp = opts.now || (() => new Date().toISOString());
  const cacheMs = opts.cacheMs == null ? 10000 : opts.cacheMs;
  let cache = { at: 0, users: [] };
  let chain = Promise.resolve();
  // Changes go one at a time, so two admins adding the same username cannot both succeed.
  const queued = (task) => {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  };
  const forget = () => { cache = { at: 0, users: [] }; };

  async function listFresh() {
    const users = fromRows(await store.tabRows("team"));
    cache = { at: Date.now(), users };
    return users;
  }
  async function list() {
    if (cache.at && Date.now() - cache.at < cacheMs) return cache.users;
    return listFresh();
  }

  // Who is this username right now? { username, name, role } or null (unknown, disabled or an unknown role).
  async function lookup(username) {
    if (username === OWNER) return { username: OWNER, name: "Owner", role: "owner" };
    const u = (await list()).find((x) => x.username === username);
    if (!u || !u.active || !ROLES[u.role] || u.role === "owner") return null;
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
    if (!ROLES[u.role] || u.role === "owner") throw new TeamError(403, "This account has no valid role. Ask an admin.");
    return { username: u.username, name: u.name, role: u.role };
  }

  async function members() {
    return (await listFresh()).map(publicUser);
  }

  function checkRole(role) {
    if (!ASSIGNABLE.includes(role)) throw new TeamError(400, "Choose Admin or Moderator.", { role: "Choose Admin or Moderator." });
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
      if (!ASSIGNABLE.includes(b.role)) errors.role = "Choose Admin or Moderator.";
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
        if (!ASSIGNABLE.includes(c.role)) errors.role = "Choose Admin or Moderator.";
        else if (self) throw new TeamError(400, "You cannot change your own role.");
        else write[COL.role] = c.role;
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

  return { lookup, login, members, add, update, remove, changeOwnPassword, checkRole };
}

module.exports = {
  OWNER, ROLES, ASSIGNABLE, HEADERS, COL, TeamError, can, create,
  hashPassword, verifyPassword, signToken, verifyToken, normUsername, usernameError, passwordError, fromRows, publicUser,
};
