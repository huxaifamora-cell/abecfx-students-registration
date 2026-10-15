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
    showQuiz(d.regNumber);
  }

  // ---- Quiz results (taken in the ABECFX Telegram quiz bot) ----
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function showQuiz(reg) {
    var body = document.getElementById("quizBody");
    var link = document.getElementById("quizLink");
    body.replaceChildren(el("p", "live", "Loading your results..."));
    fetch("/api/config").then(function (r) { return r.json(); }).then(function (c) {
      if (c.quizUrl && /^https:\/\//.test(c.quizUrl)) { link.href = c.quizUrl; link.hidden = false; }
    }).catch(function () {});
    fetch("/api/results?reg=" + encodeURIComponent(reg))
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error); return b; }); })
      .then(function (d) {
        body.replaceChildren();
        if (!d.latest) {
          body.appendChild(el("p", "quiz-empty", "You have not taken the quiz yet. Open the quiz on Telegram, enter your registration number " + reg + " and your result will appear here."));
          return;
        }
        var l = d.latest;
        var top = el("div", "quiz-top");
        top.appendChild(el("span", "grade-big g-" + l.grade, l.grade));
        var txt = el("div", "quiz-txt");
        txt.appendChild(el("strong", null, l.pct + "%  " + l.label));
        txt.appendChild(el("span", null, l.score + " of " + l.total + " correct"));
        txt.appendChild(el("span", "quiz-date", "Taken " + l.date + (d.attempts.length > 1 ? "  -  attempt " + l.attempt : "")));
        top.appendChild(txt);
        body.appendChild(top);
        if (d.best && d.best.attempt !== l.attempt) {
          body.appendChild(el("p", "quiz-best", "Best so far: " + d.best.pct + "% (grade " + d.best.grade + ")"));
        }
        if (d.attempts.length > 1) {
          var hist = el("ul", "quiz-hist");
          d.attempts.slice(0, 6).forEach(function (a) {
            var li = el("li");
            li.appendChild(el("span", null, a.date));
            li.appendChild(el("span", null, a.score + "/" + a.total + "  (" + a.pct + "%)"));
            li.appendChild(el("span", "grade g-" + a.grade, a.grade));
            hist.appendChild(li);
          });
          body.appendChild(hist);
        }
        var sc = el("p", "quiz-scale", "Grading: " + d.scale.map(function (s, i) {
          var hi = i === 0 ? 100 : d.scale[i - 1].min - 1;
          return s.grade + " " + s.min + "-" + hi;
        }).join("  |  "));
        body.appendChild(sc);
      })
      .catch(function () {
        body.replaceChildren(el("p", "quiz-empty", "We could not load your quiz results just now. Refresh to try again."));
      });
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
