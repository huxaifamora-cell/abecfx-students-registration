(function () {
  var form = document.getElementById("lookupForm");
  var input = document.getElementById("reg");
  var err = document.getElementById("lookupErr");
  var btn = document.getElementById("lookupBtn");
  var result = document.getElementById("result");
  var mount = document.getElementById("cardMount");
  var liveLine = document.getElementById("liveLine");
  var currentReg = "";

  document.getElementById("year").textContent = new Date().getFullYear();

  function show(d) {
    currentReg = d.regNumber;
    mount.replaceChildren(window.renderStudentCard(d));
    var t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var note = window.expiryNotice(d);
    liveLine.textContent = note ? note.text : "Live record, checked at " + t;
    liveLine.className = "live" + (note ? " live-" + note.level : "");
    var certLink = document.getElementById("certLink");
    certLink.hidden = d.status !== "Certified";
    certLink.href = "/certificate?reg=" + encodeURIComponent(d.regNumber);
    result.hidden = false;
    try { history.replaceState(null, "", "/status?reg=" + d.regNumber); } catch (e) {}
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
    fetch("/api/lookup?reg=" + encodeURIComponent(reg))
      .then(function (r) {
        return r.json().then(function (b) { return { ok: r.ok, body: b }; });
      })
      .then(function (res) {
        if (!res.ok) {
          err.textContent = res.body.error || "Something went wrong. Please try again.";
          return;
        }
        show(res.body);
      })
      .catch(function () {
        err.textContent = "Network problem. Check your connection and try again.";
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Find ID card";
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    search();
  });

  document.getElementById("linkBtn").addEventListener("click", function () {
    var b = this;
    var link = location.origin + "/status?reg=" + currentReg;
    function done() {
      b.textContent = "Link copied";
      setTimeout(function () { b.textContent = "Copy link"; }, 1800);
    }
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, done);
    else done();
  });

  // Opened from a QR code (or shared link): look the student up straight away.
  var pre = new URLSearchParams(location.search).get("reg");
  if (pre) {
    input.value = pre;
    search();
  }
})();
