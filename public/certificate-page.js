// Public certificate check: look a certificate up by its number (the student's registration number).
// It shows a view-only copy with a watermark; downloading is only for the certificate holder (portal) and the dashboard.
(function () {
  var form = document.getElementById("lookupForm");
  var input = document.getElementById("reg");
  var err = document.getElementById("lookupErr");
  var btn = document.getElementById("lookupBtn");
  var result = document.getElementById("result");
  var mount = document.getElementById("certMount");
  var ok = document.getElementById("certOk");
  var none = document.getElementById("certNone");
  var view = document.getElementById("certView");

  document.getElementById("year").textContent = new Date().getFullYear();

  function show(body, reg) {
    mount.replaceChildren();
    if (body.eligible) {
      none.hidden = true;
      ok.hidden = false;
      view.hidden = false;
      mount.appendChild(window.renderCertificate(body.certificate, { signature: body.signature, origin: location.origin, viewOnly: true }));
      try { history.replaceState(null, "", "/certificate?reg=" + body.certificate.certNo); } catch (e) {}
    } else {
      ok.hidden = true;
      view.hidden = true;
      none.hidden = false;
      none.textContent = "No certificate has been issued for " + reg + " yet. A certificate is issued when a student completes the course and is certified.";
    }
    result.hidden = false;
    if (window.matchMedia("(max-width: 900px)").matches) result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function search() {
    err.textContent = "";
    result.hidden = true;
    var reg = input.value.trim().toUpperCase();
    if (!reg) { err.textContent = "Enter a certificate number to check."; input.focus(); return; }
    btn.disabled = true;
    btn.textContent = "Checking...";
    fetch("/api/certificate?reg=" + encodeURIComponent(reg))
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) { err.textContent = res.body.error || "Something went wrong. Please try again."; return; }
        show(res.body, reg);
      })
      .catch(function () { err.textContent = "Network problem. Check your connection and try again."; })
      .then(function () { btn.disabled = false; btn.textContent = "Check certificate"; });
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); search(); });

  // Opened from the QR code on a certificate: check it straight away.
  var pre = new URLSearchParams(location.search).get("reg");
  if (pre) { input.value = pre; search(); }
})();
