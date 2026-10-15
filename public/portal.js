(function () {
  var KEY = "abecfx_reg";
  var loading = document.getElementById("loading");
  var signin = document.getElementById("signin");
  var home = document.getElementById("home");
  var form = document.getElementById("signinForm");
  var input = document.getElementById("reg");
  var err = document.getElementById("signinErr");
  var btn = document.getElementById("signinBtn");

  document.getElementById("year").textContent = new Date().getFullYear();

  function remember(reg) { try { localStorage.setItem(KEY, reg); } catch (e) {} }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function saved() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }

  function lookup(reg) {
    return fetch("/api/lookup?reg=" + encodeURIComponent(reg)).then(function (r) {
      return r.json().then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
    });
  }

  function showSignin(message) {
    loading.hidden = true;
    home.hidden = true;
    signin.hidden = false;
    err.textContent = message || "";
  }

  function showHome(d) {
    loading.hidden = true;
    signin.hidden = true;
    var first = (d.fullName || "").split(" ")[0];
    document.getElementById("welcome").textContent = first ? "Welcome back, " + first : "Welcome back";
    document.getElementById("cardMount").replaceChildren(window.renderStudentCard(d));
    var t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var note = window.expiryNotice(d);
    var live = document.getElementById("liveLine");
    live.textContent = note ? note.text : "Live record, checked at " + t;
    live.className = "live" + (note ? " live-" + note.level : "");
    home.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    var reg = input.value.trim();
    if (!reg) { err.textContent = "Enter your registration number."; input.focus(); return; }
    btn.disabled = true;
    btn.textContent = "Opening...";
    lookup(reg)
      .then(function (res) {
        if (!res.ok) { err.textContent = res.body.error || "Something went wrong. Please try again."; return; }
        remember(res.body.regNumber);
        showHome(res.body);
      })
      .catch(function () { err.textContent = "Network problem. Check your connection and try again."; })
      .then(function () { btn.disabled = false; btn.textContent = "Open portal"; });
  });

  document.getElementById("printBtn").addEventListener("click", function () { window.print(); });
  document.getElementById("switchBtn").addEventListener("click", function () {
    forget();
    input.value = "";
    showSignin("");
    input.focus();
  });

  // Returning student on this device: go straight to their portal.
  var reg = saved();
  if (reg) {
    lookup(reg)
      .then(function (res) {
        if (res.ok) { showHome(res.body); return; }
        if (res.status === 404 || res.status === 400) { forget(); showSignin(""); return; }
        showSignin("We could not open your portal just now. Enter your registration number to try again.");
        input.value = reg;
      })
      .catch(function () {
        showSignin("Network problem. Enter your registration number to try again.");
        input.value = reg;
      });
  } else {
    showSignin("");
  }
})();
