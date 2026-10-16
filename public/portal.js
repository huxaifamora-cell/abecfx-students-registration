(function () {
  var KEY = "abecfx_reg";
  var TKEY = "abecfx_token"; // sign-in token from the website; the portal is private without it
  var loading = document.getElementById("loading");
  var signin = document.getElementById("signin");
  var home = document.getElementById("home");
  var form = document.getElementById("signinForm");
  var input = document.getElementById("reg");
  var emailInput = document.getElementById("email");
  var err = document.getElementById("signinErr");
  var btn = document.getElementById("signinBtn");

  document.getElementById("year").textContent = new Date().getFullYear();

  // The quiz opens inside the portal (a frame on the quiz service) so students never leave this page.
  var currentReg = "";
  var quizOrigin = "";
  var quizRun = document.getElementById("quizRun");
  var quizFrame = document.getElementById("quizFrame");
  var quizMsg = document.getElementById("quizRunMsg");
  var quizStartBtn = document.getElementById("quizStartBtn");

  function remember(reg, token) {
    try { localStorage.setItem(KEY, reg); if (token) localStorage.setItem(TKEY, token); } catch (e) {}
  }
  function forget() { try { localStorage.removeItem(KEY); localStorage.removeItem(TKEY); } catch (e) {} }
  function saved() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function token() { try { return localStorage.getItem(TKEY) || ""; } catch (e) { return ""; } }

  // Every private request carries the sign-in token.
  function authFetch(url) {
    return fetch(url, { headers: { Authorization: "Bearer " + token() } });
  }

  // The sign-in has expired or is not valid: back to the sign-in form.
  function signedOut(message) {
    closeQuiz(true);
    currentReg = "";
    forget();
    showSignin(message || "Please sign in again.");
  }

  function login(reg, email) {
    return fetch("/api/portal/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reg: reg, email: email }),
    }).then(function (r) {
      return r.json().then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
    });
  }

  function myCard() {
    return authFetch("/api/portal/me").then(function (r) {
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
    currentReg = d.regNumber;
    closeQuiz(true);
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
      if (c.quizUrl && /^https:\/\//.test(c.quizUrl)) {
        link.href = c.quizUrl;
        link.hidden = false;
        // When the quiz can run inside the portal, Telegram becomes the second choice.
        if (c.quizEmbed) link.textContent = "Take it on Telegram instead";
      }
      quizStartBtn.hidden = !c.quizEmbed || !quizRun.hidden;
    }).catch(function () {});
    authFetch("/api/results")
      .then(function (r) { return r.json().then(function (b) { if (r.status === 401) { signedOut(); throw new Error("signed out"); } if (!r.ok) throw new Error(b.error); return b; }); })
      .then(function (d) {
        body.replaceChildren();
        if (!d.latest) {
          body.appendChild(el("p", "quiz-empty", "You have not taken the quiz yet. Take it from this page and your result will appear here."));
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
      .catch(function (e) {
        if (e && e.message === "signed out") return;
        body.replaceChildren(el("p", "quiz-empty", "We could not load your quiz results just now. Refresh to try again."));
      });
  }

  // ---- Take the quiz inside the portal ----
  function closeQuiz(silent) {
    if (!silent && !window.confirm("Close the quiz? A quiz you have not finished is not saved.")) return;
    quizFrame.src = "about:blank";
    quizRun.hidden = true;
    quizOrigin = "";
    quizStartBtn.hidden = true; // showQuiz decides again whether to offer it
    if (!silent && currentReg) showQuiz(currentReg);
  }

  function openQuiz() {
    if (!currentReg) return;
    quizStartBtn.disabled = true;
    authFetch("/api/quiz/session")
      .then(function (r) { return r.json().then(function (b) { if (r.status === 401) { signedOut(); throw new Error(""); } return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok || !res.body.url) throw new Error(res.body.error || "We could not open the quiz just now.");
        quizOrigin = new URL(res.body.url).origin;
        quizMsg.textContent = "Opening the quiz. The first load can take up to a minute.";
        quizMsg.hidden = false;
        document.getElementById("quizTab").href = res.body.url;
        quizFrame.src = res.body.url + "&o=" + encodeURIComponent(window.location.origin);
        quizRun.hidden = false;
        quizStartBtn.hidden = true;
        quizRun.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(function (e) {
        if (!e.message) return; // signed out: the sign-in form is already showing
        quizStartBtn.hidden = false;
        window.alert(e.message || "We could not open the quiz just now.");
      })
      .then(function () { quizStartBtn.disabled = false; });
  }

  quizStartBtn.addEventListener("click", openQuiz);
  document.getElementById("quizCloseBtn").addEventListener("click", function () { closeQuiz(false); });
  quizFrame.addEventListener("load", function () {
    if (quizFrame.getAttribute("src") && quizFrame.getAttribute("src") !== "about:blank") quizMsg.hidden = true;
  });
  // The quiz page tells the portal when a result has been saved, so the results card refreshes by itself.
  window.addEventListener("message", function (e) {
    if (!quizOrigin || e.origin !== quizOrigin || e.source !== quizFrame.contentWindow) return;
    if (e.data && e.data.type === "abecfx_quiz_saved" && currentReg) showQuiz(currentReg);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    var reg = input.value.trim();
    var email = emailInput.value.trim();
    if (!reg) { err.textContent = "Enter your registration number."; input.focus(); return; }
    if (!email) { err.textContent = "Enter the email address you registered with."; emailInput.focus(); return; }
    btn.disabled = true;
    btn.textContent = "Signing in...";
    login(reg, email)
      .then(function (res) {
        if (!res.ok) { err.textContent = res.body.error || "Something went wrong. Please try again."; return; }
        remember(res.body.card.regNumber, res.body.token);
        emailInput.value = "";
        showHome(res.body.card);
      })
      .catch(function () { err.textContent = "Network problem. Check your connection and try again."; })
      .then(function () { btn.disabled = false; btn.textContent = "Sign in"; });
  });

  document.getElementById("printBtn").addEventListener("click", function () { window.print(); });
  document.getElementById("switchBtn").addEventListener("click", function () {
    closeQuiz(true);
    currentReg = "";
    forget();
    input.value = "";
    emailInput.value = "";
    showSignin("");
    input.focus();
  });

  // Returning student on this device: go straight to their portal if their sign-in is still valid.
  var reg = saved();
  if (token()) {
    myCard()
      .then(function (res) {
        if (res.ok) { showHome(res.body); return; }
        if (res.status === 401) { forget(); showSignin("Please sign in again."); input.value = reg; return; }
        showSignin("We could not open your portal just now. Please try again.");
        input.value = reg;
      })
      .catch(function () {
        showSignin("Network problem. Please check your connection and try again.");
        input.value = reg;
      });
  } else {
    showSignin("");
    if (reg) input.value = reg; // an earlier visit without a sign-in: ask for the email now
  }
})();
