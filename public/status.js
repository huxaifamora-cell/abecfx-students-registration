(function () {
  var form = document.getElementById("lookupForm");
  var input = document.getElementById("reg");
  var err = document.getElementById("lookupErr");
  var btn = document.getElementById("lookupBtn");
  var result = document.getElementById("result");
  var mount = document.getElementById("cardMount");
  var liveLine = document.getElementById("liveLine");
  var currentReg = "";
  var sel = document.getElementById("lookupKind");
  var kindTitle = document.getElementById("kindTitle");
  var NAMES = { student: "Student ID card", alumni: "Alumni ID card", team: "Team ID card" };
  // The card kind is "explicit" once the visitor picks one (or opens a link that names one). Until then a lookup
  // shows the person's main card, so an old QR code (/status?reg=...) still opens something the person has.
  var explicit = !!new URLSearchParams(location.search).get("kind");
  function kindOfStatus(st) { return st === "Team Member" ? "team" : st === "Alumni Member" ? "alumni" : "student"; }
  function kind() { return sel && sel.value !== "certificate" ? sel.value : "student"; }
  function labelFor() {
    var n = NAMES[kind()];
    if (kindTitle) kindTitle.textContent = n;
    btn.textContent = "Find " + n.replace(/ card$/, " card");
  }

  document.getElementById("year").textContent = new Date().getFullYear();

  function show(d) {
    currentReg = d.regNumber;
    if (sel && !explicit) sel.value = kindOfStatus(d.status); // main card of a person found without choosing a kind
    labelFor();
    mount.replaceChildren(window.renderStudentCard(d));
    var t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var note = window.expiryNotice(d);
    liveLine.textContent = note ? note.text : "Live record, checked at " + t;
    liveLine.className = "live" + (note ? " live-" + note.level : "");
    var certLink = document.getElementById("certLink");
    certLink.hidden = !d.certified; // only a Certified student has a certificate
    certLink.href = "/certificate?reg=" + encodeURIComponent(d.regNumber);
    result.hidden = false;
    try { history.replaceState(null, "", "/status?kind=" + kindOfStatus(d.status) + "&reg=" + d.regNumber); } catch (e) {}
    if (window.matchMedia("(max-width: 900px)").matches) {
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function search() {
    err.textContent = "";
    result.hidden = true;
    var reg = input.value.trim();
    if (!reg) {
      err.textContent = "Enter a registration number to search.";
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = "Searching...";
    fetch("/api/lookup?reg=" + encodeURIComponent(reg) + (explicit ? "&kind=" + kind() : ""))
      .then(function (r) {
        return r.json().then(function (b) { return { ok: r.ok, body: b }; });
      })
      .then(function (res) {
        if (!res.ok) {
          var msg = res.body.error || "Something went wrong. Please try again.";
          if (res.body.cards && res.body.cards.length) {
            msg += " Choose " + res.body.cards.map(function (k) { return NAMES[k]; }).join(" or ") + (res.body.certified ? " or Certificate" : "") + " from the list.";
          } else if (res.body.certified) {
            msg += " Choose Certificate from the list.";
          }
          err.textContent = msg;
          return;
        }
        show(res.body);
      })
      .catch(function () {
        err.textContent = "Network problem. Check your connection and try again.";
      })
      .then(function () {
        btn.disabled = false;
        labelFor();
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    search();
  });

  document.getElementById("linkBtn").addEventListener("click", function () {
    var b = this;
    var link = location.origin + "/status?kind=" + kind() + "&reg=" + currentReg;
    function done() {
      b.textContent = "Link copied";
      setTimeout(function () { b.textContent = "Copy link"; }, 1800);
    }
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, done);
    else done();
  });

  // Picking another card (Student, Alumni or Team) looks the same person up again as that card.
  if (sel) {
    sel.addEventListener("change", function () {
      if (sel.value === "certificate") return; // lookup-kind.js opens the certificate page
      explicit = true;
      labelFor();
      if (input.value.trim()) search();
    });
  }
  labelFor();

  // Opened from a QR code (or shared link): look the student up straight away.
  var pre = new URLSearchParams(location.search).get("reg");
  if (pre) {
    input.value = pre;
    search();
  }
})();
