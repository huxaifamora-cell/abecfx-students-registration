// Member hosting requests: an Alumni member asks for their MetaTrader 5 connector to run on the ABEC-FX VPS, so they do
// not need their own PC or VPS online. This module only keeps the REQUEST (in the "Hosting Requests" tab of the Google
// Sheet) and its progress. It never sees, takes or stores a password:
//   - the member sends their MT5 trading password to the person looking after the VPS privately, never to the website;
//   - the person looking after the VPS types it into the terminal on the VPS, and nowhere else.
// By ticking the consent box the member says they understand this, and that they can end hosting any time and cut
// access by changing their password in MT5.
//
// Status: Requested -> Approved -> Active (the terminal is running on the VPS). Or Declined. The member can cancel a
// request (Cancelled) or end hosting (Ended). One open request (Requested, Approved or Active) per member.
const HEADERS = [
  "Request ID", "Reg Number", "Requested At (Lagos)", "Status", "MT5 Account Number", "Broker Server", "Account Type",
  "Consent Given At (Lagos)", "VPS Slot (admin)", "Admin Note", "Updated At (Lagos)", "Updated By",
];
const H = { id: 0, reg: 1, requested: 2, status: 3, account: 4, server: 5, type: 6, consent: 7, slot: 8, note: 9, updated: 10, by: 11 };
const STATUSES = ["Requested", "Approved", "Active", "Declined", "Cancelled", "Ended"];
const OPEN = ["Requested", "Approved", "Active"];

class HostingError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    if (fields) this.fields = fields;
  }
}

const normReg = (v) => String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "");
const text = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

// opts: enabled, stamp() (Lagos time text), nameOf(reg) async
function create(store, opts = {}) {
  const stamp = opts.stamp || (() => new Date().toISOString());
  const nameOf = opts.nameOf || (async (reg) => reg);

  const shape = ({ n, cells }) => ({
    n, id: cells[H.id], reg: normReg(cells[H.reg]), requestedAt: cells[H.requested], status: cells[H.status], account: cells[H.account],
    server: cells[H.server], type: cells[H.type], consentAt: cells[H.consent], slot: cells[H.slot], note: cells[H.note], updatedAt: cells[H.updated], by: cells[H.by],
  });
  const all = async () => (await store.tabRows("hostingrequests")).map(shape).filter((r) => r.id);

  const publicView = (r) => r && ({ id: r.id, status: r.status, account: r.account, server: r.server, type: r.type, requestedAt: r.requestedAt, updatedAt: r.updatedAt });

  async function memberView(regInput) {
    const reg = normReg(regInput);
    const mine = (await all()).filter((r) => r.reg === reg);
    const open = mine.filter((r) => OPEN.includes(r.status)).pop();
    const latest = open || mine[mine.length - 1] || null;
    return { enabled: Boolean(opts.enabled), current: publicView(latest), canRequest: Boolean(opts.enabled) && !open };
  }

  // input: { account, server, type: "demo" | "real", consent: true }
  async function request(regInput, input) {
    if (!opts.enabled) throw new HostingError(403, "Hosting is switched off.");
    const reg = normReg(regInput);
    const b = input || {};
    const errors = {};
    const account = text(b.account, 20);
    const server = text(b.server, 60);
    const type = /^real$/i.test(String(b.type || "")) ? "Real" : /^demo$/i.test(String(b.type || "")) ? "Demo" : "";
    if (!/^\d{4,12}$/.test(account)) errors.account = "Enter your MT5 account number (digits only).";
    if (server.length < 2) errors.server = "Enter the broker server name shown in MT5 (for example Deriv-Demo).";
    if (!type) errors.type = "Say whether it is a demo or a real account.";
    if (b.consent !== true) errors.consent = "Tick the box to confirm you understand how hosting works.";
    if (Object.keys(errors).length) throw new HostingError(400, "Please fix the highlighted fields.", errors);
    const rows = await all();
    if (rows.some((r) => r.reg === reg && OPEN.includes(r.status))) throw new HostingError(409, "You already have a hosting request open.");
    let n = 0;
    for (const r of rows) n = Math.max(n, parseInt(String(r.id).slice(1), 10) || 0);
    const id = "H" + (n + 1);
    await store.appendTabRows("hostingrequests", [[id, reg, stamp(), "Requested", account, server, type, stamp(), "", "", stamp(), "member"]]);
    return memberView(reg);
  }

  // The member cancels a request that has not started, or ends hosting that is running.
  async function memberEnd(regInput) {
    const reg = normReg(regInput);
    const row = (await all()).filter((r) => r.reg === reg && OPEN.includes(r.status)).pop();
    if (!row) throw new HostingError(404, "You have no open hosting request.");
    await store.writeTabCells("hostingrequests", row.n, {
      [H.status]: row.status === "Active" ? "Ended" : "Cancelled", [H.updated]: stamp(), [H.by]: "member",
    });
    return memberView(reg);
  }

  async function adminList() {
    const rows = (await all()).reverse();
    const names = new Map();
    for (const r of rows) if (!names.has(r.reg)) names.set(r.reg, await nameOf(r.reg));
    return { statuses: STATUSES, requests: rows.map((r) => ({ id: r.id, reg: r.reg, name: names.get(r.reg) || "", requestedAt: r.requestedAt, status: r.status, account: r.account, server: r.server, type: r.type, slot: r.slot, note: r.note, updatedAt: r.updatedAt, by: r.by })) };
  }

  // input: { status, slot, note }
  async function adminUpdate(id, input, actor) {
    const b = input || {};
    const row = (await all()).find((r) => r.id === String(id));
    if (!row) throw new HostingError(404, "That request was not found.");
    const errors = {};
    const next = { status: row.status, slot: row.slot, note: row.note };
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) errors.status = "Choose a status from the list.";
      else next.status = b.status;
    }
    if (b.slot !== undefined) next.slot = text(b.slot, 60);
    if (b.note !== undefined) next.note = text(b.note, 300);
    if (next.status === "Active" && !next.slot) errors.slot = "Say which VPS folder or slot the terminal runs in before marking it Active.";
    if (OPEN.includes(next.status) && (await all()).some((r) => r.reg === row.reg && r.id !== row.id && OPEN.includes(r.status))) errors.status = "This member already has another open request.";
    if (Object.keys(errors).length) throw new HostingError(400, "Please fix the highlighted fields.", errors);
    await store.writeTabCells("hostingrequests", row.n, {
      [H.status]: next.status, [H.slot]: next.slot, [H.note]: next.note, [H.updated]: stamp(), [H.by]: text(actor && actor.name, 60),
    });
    return adminList();
  }

  // The request an admin may make a connector key for: the member's open Approved or Active request.
  async function forKey(id) {
    const row = (await all()).find((r) => r.id === String(id));
    if (!row) throw new HostingError(404, "That request was not found.");
    if (row.status !== "Approved" && row.status !== "Active") throw new HostingError(400, "Approve the request before making a key.");
    return row;
  }

  // True while the member has hosting running on the VPS.
  async function isHosted(regInput) {
    const reg = normReg(regInput);
    return (await all()).some((r) => r.reg === reg && r.status === "Active");
  }

  return { memberView, request, memberEnd, adminList, adminUpdate, forKey, isHosted };
}

module.exports = { create, HEADERS, STATUSES, OPEN, HostingError };
