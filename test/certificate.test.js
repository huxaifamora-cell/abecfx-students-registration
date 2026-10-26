const test = require("node:test");
const assert = require("node:assert/strict");
const certificate = require("../certificate");
const links = require("../links");
const team = require("../team");
const { boot } = require("./support/boot-server");

const D = "ABECFX/26/0004"; // seeded as Certified by FAKE_CERTIFIED
const SIG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 7)]).toString("base64");

test("dates are read from the ways people type them and always written the same way", () => {
  for (const t of ["2026-06-01", "1 Jun 2026", "1 June 2026", "01 JUNE 2026", "June 1, 2026", "1st June 2026", "01/06/2026", "2026-06-01 09:30"]) {
    assert.equal(certificate.parseDate(t), "2026-06-01", t);
  }
  for (const t of ["", "soon", "31 Feb 2026", "2026-13-01", null, undefined]) assert.equal(certificate.parseDate(t), "", String(t));
  assert.equal(certificate.longDate("2026-06-01"), "1st June 2026");
  assert.equal(certificate.longDate("2026-06-02"), "2nd June 2026");
  assert.equal(certificate.longDate("2026-06-03"), "3rd June 2026");
  assert.equal(certificate.longDate("2026-06-11"), "11th June 2026");
  assert.equal(certificate.longDate("2026-06-22"), "22nd June 2026");
  assert.equal(certificate.longDate("nonsense"), "");
});

test("only a Certified student has a certificate, numbered by their registration number", () => {
  const card = { regNumber: "ABECFX/26/0004", fullName: "Alaba  Emmanuel Akindejoye", status: "Certified", statusDate: "1 Jun 2026" };
  const settings = { certSigner: " Adebisi Abass Mayowa ", certSignerTitle: "CEO", certOrg: "Adebass Base Edge Consult FX", certRc: "9420199" };
  assert.deepEqual(certificate.forCard(card, settings), {
    certNo: "ABECFX/26/0004", regNumber: "ABECFX/26/0004", fullName: "ALABA EMMANUEL AKINDEJOYE", awarded: "1st June 2026", awardedISO: "2026-06-01",
    year: 2026, org: "ADEBASS BASE EDGE CONSULT FX", rc: "9420199", signerName: "Adebisi Abass Mayowa", signerTitle: "CEO",
  });
  for (const status of ["Uncertified", "Team Member", "Alumni Member", ""]) assert.equal(certificate.forCard({ ...card, status }, settings), null, status);
  // an unreadable date is shown as written, never replaced by a made-up one; no date at all prints no date
  assert.equal(certificate.forCard({ ...card, statusDate: "sometime in June" }, settings).awarded, "sometime in June");
  const none = certificate.forCard({ ...card, statusDate: "" }, settings);
  assert.equal(none.awarded, "");
  assert.equal(none.year, 2026, "the badge year falls back to the year in the registration number");
});

test("the certificate settings are not site links and never go out with the public links", () => {
  assert.deepEqual(links.certFields().map((f) => f.key), ["certSigner", "certSignerTitle", "certOrg", "certRc"]);
  for (const f of links.siteFields()) assert.ok(!links.CERT_KEYS.includes(f.key));
  for (const f of links.communityFields()) assert.ok(!links.CERT_KEYS.includes(f.key));
  const pub = links.publicView(links.DEFAULTS);
  for (const k of links.CERT_KEYS) assert.ok(!(k in pub), k);
  assert.equal(links.DEFAULTS.certRc, "9420199");
  const out = links.sanitize({ certSigner: "  A   Name\nsecond line ", certRc: "123" });
  assert.equal(out.values.certSigner, "A Name second line");
  assert.ok(!out.errors.certSigner);
});

test("the certificates access exists, admins and the owner have it, editors and moderators do not", () => {
  assert.ok(team.PERM_KEYS.includes("certificates"));
  assert.equal(team.can("owner", "certificates"), true);
  assert.equal(team.can("admin", "certificates"), true);
  assert.equal(team.can("editor", "certificates"), false);
  assert.equal(team.can("moderator", "certificates"), false);
});

test("public look-up: shows a Certified student's certificate, nothing for anyone else, never the email", async (t) => {
  const s = await boot({ FAKE_CERTIFIED: "1" });
  t.after(() => s.stop());
  let r = await s.call("GET", "/api/certificate?reg=" + D);
  assert.equal(r.status, 200);
  assert.equal(r.body.eligible, true);
  assert.equal(r.body.certificate.certNo, D);
  assert.equal(r.body.certificate.fullName, "ALABA EMMANUEL AKINDEJOYE");
  assert.equal(r.body.certificate.awarded, "1st June 2026");
  assert.equal(r.body.certificate.rc, "9420199");
  assert.equal(r.body.certificate.org, "ADEBASS BASE EDGE CONSULT FX");
  assert.equal(r.body.signature, "");
  assert.ok(!JSON.stringify(r.body).includes("example.com"), "no email");
  assert.ok(!JSON.stringify(r.body).includes("+234"), "no phone number");

  r = await s.call("GET", "/api/certificate?reg=ABECFX/26/0001");
  assert.equal(r.status, 200);
  assert.equal(r.body.eligible, false);
  assert.equal(r.body.certificate, undefined);
  assert.equal((await s.call("GET", "/api/certificate?reg=ABECFX/26/0099")).status, 404);
  assert.equal((await s.call("GET", "/api/certificate?reg=nonsense")).status, 400);
  // the public page itself
  const page = await fetch(s.base + "/certificate");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Check a certificate/);
  assert.equal(s.log(), "", s.log());
});

test("portal: a Certified student gets their certificate, others do not, and nobody can ask for someone else's", async (t) => {
  const s = await boot({ FAKE_CERTIFIED: "1" });
  t.after(() => s.stop());
  assert.equal((await s.call("GET", "/api/portal/certificate")).status, 401);
  const d = await s.studentToken(D);
  const r = await s.call("GET", "/api/portal/certificate?reg=ABECFX/26/0001", { token: d });
  assert.equal(r.status, 200);
  assert.equal(r.body.eligible, true);
  assert.equal(r.body.certificate.certNo, D, "the number comes from the sign-in, not from the request");
  const a = await s.studentToken("ABECFX/26/0001");
  assert.equal((await s.call("GET", "/api/portal/certificate", { token: a })).body.eligible, false);
  assert.equal(s.log(), "", s.log());
});

test("dashboard: only the certificates access; the signer and signature appear on every certificate", async (t) => {
  const s = await boot({ FAKE_CERTIFIED: "1" });
  t.after(() => s.stop());
  const owner = await s.adminToken();
  const student = await s.studentToken(D);
  for (const url of ["/api/admin/certificates", "/api/admin/certificate-settings"]) {
    assert.equal((await s.call("GET", url)).status, 401, url);
    assert.equal((await s.call("GET", url, { token: student })).status, 401, url + " as a student");
  }
  // an editor and a moderator may not
  for (const role of ["editor", "moderator"]) {
    const make = await s.call("POST", "/api/admin/team", { token: owner, body: { username: role + "1", fullName: "Test " + role, role, password: "goodpass123" } });
    assert.equal(make.status, 200, JSON.stringify(make.body));
    const tok = await s.adminToken(role + "1", "goodpass123");
    assert.equal((await s.call("GET", "/api/admin/certificates", { token: tok })).status, 403, role);
    assert.equal((await s.call("PUT", "/api/admin/certificate-settings", { token: tok, body: {} })).status, 403, role);
  }
  // a custom role can be given just this
  let r = await s.call("POST", "/api/admin/roles", { token: owner, body: { name: "Certificate officer", perms: ["certificates"] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await s.call("POST", "/api/admin/team", { token: owner, body: { username: "cert1", fullName: "Cert Officer", role: "certificate-officer", password: "goodpass123" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const officer = await s.adminToken("cert1", "goodpass123");
  assert.equal((await s.call("GET", "/api/admin/team", { token: officer })).status, 403, "that access is not the team access");

  r = await s.call("GET", "/api/admin/certificate-settings", { token: officer });
  assert.equal(r.status, 200);
  assert.equal(r.body.values.certSigner, "Adebisi Abass Mayowa");
  assert.equal(r.body.signature, "");

  // bad input is refused, and nothing is blank
  r = await s.call("PUT", "/api/admin/certificate-settings", { token: officer, body: { certSigner: "", certSignerTitle: "CEO", certOrg: "X Ltd", certRc: "1" } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.certSigner);
  r = await s.call("PUT", "/api/admin/certificate-settings", { token: officer, body: { certSigner: "A B", certSignerTitle: "CEO", certOrg: "X Ltd", certRc: "1", signature: "not-a-png" } });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.signature);

  // a valid save: new signer, a signature
  r = await s.call("PUT", "/api/admin/certificate-settings", { token: officer, body: { certSigner: "Ngozi Eze", certSignerTitle: "Director", certOrg: "Adebass Base Edge Consult FX", certRc: "9420199", signature: SIG } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.signature, SIG);

  // every certificate now carries it: the public look-up, the student's own copy and the dashboard list
  const pub = await s.call("GET", "/api/certificate?reg=" + D);
  assert.equal(pub.body.certificate.signerName, "Ngozi Eze");
  assert.equal(pub.body.certificate.signerTitle, "Director");
  assert.equal(pub.body.signature, SIG);
  assert.equal((await s.call("GET", "/api/portal/certificate", { token: student })).body.signature, SIG);
  r = await s.call("GET", "/api/admin/certificates", { token: officer });
  assert.equal(r.body.total, 1);
  assert.equal(r.body.certificates[0].certNo, D);
  assert.equal(r.body.certificates[0].signerName, "Ngozi Eze");
  assert.equal(r.body.signature, SIG);
  // search
  assert.equal((await s.call("GET", "/api/admin/certificates?q=akindejoye", { token: officer })).body.total, 1);
  assert.equal((await s.call("GET", "/api/admin/certificates?q=zzz", { token: officer })).body.total, 0);

  // the signature and signer never leak into the public site links, and saving site links keeps them
  r = await s.call("GET", "/api/links");
  for (const k of ["certSigner", "certSignerTitle", "certOrg", "certRc"]) assert.ok(!(k in r.body), k);
  r = await s.call("PUT", "/api/admin/links", { token: owner, body: { facebook: "https://www.facebook.com/abeconsultfx" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await s.call("GET", "/api/certificate?reg=" + D)).body.certificate.signerName, "Ngozi Eze", "site links save did not wipe the signer");

  // removing the signature
  r = await s.call("PUT", "/api/admin/certificate-settings", { token: officer, body: { certSigner: "Ngozi Eze", certSignerTitle: "Director", certOrg: "Adebass Base Edge Consult FX", certRc: "9420199", removeSignature: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.signature, "");
  assert.equal(s.log(), "", s.log());
});
