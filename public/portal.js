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

  // The quiz is locked until the student enters a one-time quiz code. The website decides (/api/results says
  // `unlocked`); the portal only shows the code box or the quiz buttons to match.
  var quizCfg = null;           // { quizUrl, quizEmbed } from the website, loaded once
  var quizUnlocked = false;     // does this student have a quiz code that is still open?
  var quizAccessKnown = false;  // has the website answered yet? Until it has, neither the code box nor the quiz is shown
  var quizJustFinished = false; // a quiz was saved from the frame on this page
  var quizGate = document.getElementById("quizGate");
  var quizGateNote = document.getElementById("quizGateNote");
  var quizOpenNote = document.getElementById("quizOpenNote");
  var quizLinkEl = document.getElementById("quizLink");
  var GATE_NOTE = "The quiz is locked. Enter the one-time quiz code your mentor or ABECFX gave you to open it.";
  var GATE_NOTE_DONE = "You have finished the quiz. To take it again, enter a new one-time quiz code.";

  function remember(reg, token) {
    try { localStorage.setItem(KEY, reg); if (token) localStorage.setItem(TKEY, token); } catch (e) {}
  }
  function forget() { try { localStorage.removeItem(KEY); localStorage.removeItem(TKEY); } catch (e) {} }
  function saved() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function token() { try { return localStorage.getItem(TKEY) || ""; } catch (e) { return ""; } }

  // Every private request carries the sign-in token.
  function authFetch(url, opts) {
    var o = opts || {};
    var headers = Object.assign({}, o.headers || {}, { Authorization: "Bearer " + token() });
    return fetch(url, Object.assign({}, o, { headers: headers }));
  }

  // The sign-in has expired or is not valid: back to the sign-in form.
  function signedOut(message) {
    closeQuiz(true);
    window.abecHandbook.reset();
    currentReg = "";
    currentView = "";
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
    window.abecHandbook.reset();
    currentView = "";
    route();
  }

  // ---- My portal submenu: ID card, Quiz, Mentorship Handbook (addresses #/card, #/quiz, #/handbook/03) ----
  var VIEWS = ["card", "quiz", "handbook"];
  var currentView = "";

  function parseRoute() {
    var m = /^#\/(card|quiz|handbook)(?:\/(\d{2}))?$/.exec(location.hash || "");
    return { view: m ? m[1] : "card", chapter: m && m[2] ? m[2] : "" };
  }

  function route() {
    if (home.hidden || !currentReg) return; // not signed in: the sign-in form stays
    var r = parseRoute();
    VIEWS.forEach(function (v) {
      document.getElementById("view" + v.charAt(0).toUpperCase() + v.slice(1)).hidden = v !== r.view;
    });
    var links = document.querySelectorAll("#subnav a");
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute("data-view") === r.view) links[i].setAttribute("aria-current", "page");
      else links[i].removeAttribute("aria-current");
    }
    document.querySelector(".sheet-inner").classList.toggle("is-wide", r.view === "handbook");
    if (r.view === "card" && currentView !== "card") window.abecHandbook.summary();
    if (r.view === "quiz" && currentView !== "quiz") showQuiz(currentReg);
    if (r.view === "handbook") window.abecHandbook.show(r.chapter);
    currentView = r.view;
    if (r.view !== "handbook" || !r.chapter) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  window.abecHandbook.setup({ authFetch: function (u, o) { return authFetch(u, o); }, signedOut: function (m) { signedOut(m); } });

  // ---- Quiz results (taken in the ABECFX Telegram quiz bot) ----
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Locked: only the code box. Unlocked: the ways to take the quiz. Nothing is offered until we know which.
  function hideQuizActions() {
    quizGate.hidden = true;
    quizOpenNote.hidden = true;
    quizStartBtn.hidden = true;
    quizLinkEl.hidden = true;
  }
  function applyQuizAccess() {
    if (!quizAccessKnown) return;
    var cfg = quizCfg || {};
    var hasTelegram = !!(cfg.quizUrl && /^https:\/\//.test(cfg.quizUrl));
    if (hasTelegram) {
      quizLinkEl.href = cfg.quizUrl;
      // When the quiz can run inside the portal, Telegram becomes the second choice.
      quizLinkEl.textContent = cfg.quizEmbed ? "Take it on Telegram instead" : "Take the quiz on Telegram";
    }
    quizGate.hidden = quizUnlocked;
    quizGateNote.textContent = quizJustFinished ? GATE_NOTE_DONE : GATE_NOTE;
    quizOpenNote.hidden = !quizUnlocked;
    quizStartBtn.hidden = !(quizUnlocked && cfg.quizEmbed && quizRun.hidden);
    quizLinkEl.hidden = !(quizUnlocked && hasTelegram);
  }

  function showQuiz(reg) {
    var body = document.getElementById("quizBody");
    body.replaceChildren(el("p", "live", "Loading your results..."));
    quizAccessKnown = false;
    hideQuizActions();
    if (!quizCfg) {
      fetch("/api/config").then(function (r) { return r.json(); }).then(function (c) { quizCfg = c; applyQuizAccess(); }).catch(function () {});
    }
    authFetch("/api/results")
      .then(function (r) { return r.json().then(function (b) { if (r.status === 401) { signedOut(); throw new Error("signed out"); } if (!r.ok) throw new Error(b.error); return b; }); })
      .then(function (d) {
        quizUnlocked = !!d.unlocked;
        quizAccessKnown = true;
        applyQuizAccess();
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
        quizUnlocked = false;
        quizAccessKnown = true;
        applyQuizAccess(); // the code box still works: entering a code again is always safe
        body.replaceChildren(el("p", "quiz-empty", "We could not load your quiz results just now. Refresh to try again."));
      });
  }

  // ---- Take the quiz inside the portal ----
  function closeQuiz(silent) {
    if (!silent && !window.confirm("Close the quiz? A quiz you have not finished is not saved.")) return;
    quizFrame.src = "about:blank";
    quizRun.hidden = true;
    quizOrigin = "";
    quizJustFinished = false;
    quizUnlocked = false; // showQuiz asks the website again; nothing is offered until it answers
    quizAccessKnown = false;
    hideQuizActions();
    quizCodeInput.value = ""; // nothing typed here is left behind for the next person on this device
    quizCodeErr.textContent = "";
    if (!silent && currentReg) showQuiz(currentReg);
  }

  function openQuiz() {
    if (!currentReg) return;
    quizStartBtn.disabled = true;
    authFetch("/api/quiz/session")
      .then(function (r) { return r.json().then(function (b) { if (r.status === 401) { signedOut(); throw new Error(""); } return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok || !res.body.url) {
          var er = new Error(res.body.error || "We could not open the quiz just now.");
          er.locked = !!res.body.locked; // the quiz is locked (never unlocked, finished, or cancelled by an admin)
          throw er;
        }
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
        if (e.locked) { showQuiz(currentReg); } // back to the code box
        else quizStartBtn.hidden = false;
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
    if (e.data && e.data.type === "abecfx_quiz_saved" && currentReg) {
      // The finished quiz is saved and its code is spent, so the quiz locks again. The frame stays open
      // so the student can read their result there until they close it.
      quizJustFinished = true;
      showQuiz(currentReg);
    }
  });

  // ---- Enter a one-time quiz code ----
  var quizUnlockForm = document.getElementById("quizUnlockForm");
  var quizCodeInput = document.getElementById("quizCode");
  var quizCodeErr = document.getElementById("quizCodeErr");
  var quizUnlockBtn = document.getElementById("quizUnlockBtn");
  quizUnlockForm.addEventListener("submit", function (e) {
    e.preventDefault();
    quizCodeErr.textContent = "";
    var code = quizCodeInput.value.trim();
    if (!code) { quizCodeErr.textContent = "Enter your quiz code."; quizCodeInput.focus(); return; }
    quizUnlockBtn.disabled = true;
    quizUnlockBtn.textContent = "Checking...";
    authFetch("/api/quiz/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code }),
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, status: r.status, body: b }; }); })
      .then(function (res) {
        if (res.status === 401) { signedOut(); return; }
        // 409 means the quiz is already open (another tab or device): show it as open.
        if (!res.ok && res.status !== 409) { quizCodeErr.textContent = res.body.error || "Something went wrong. Please try again."; return; }
        quizCodeInput.value = "";
        quizJustFinished = false;
        showQuiz(currentReg);
      })
      .catch(function () { quizCodeErr.textContent = "Network problem. Check your connection and try again."; })
      .then(function () { quizUnlockBtn.disabled = false; quizUnlockBtn.textContent = "Unlock quiz"; });
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
    window.abecHandbook.reset();
    currentReg = "";
    currentView = "";
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
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
