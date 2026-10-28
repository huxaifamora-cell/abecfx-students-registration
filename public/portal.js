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
  var GATE_NOTE = "The quiz is locked. Enter the one-time quiz code your mentor or ABEC-FX gave you to open it.";
  var GATE_NOTE_DONE = "You have finished the quiz. To take it again, enter a new one-time quiz code.";

  function remember(reg, token) {
    try { localStorage.setItem(KEY, reg); if (token) localStorage.setItem(TKEY, token); } catch (e) {}
    window.abecNav.refresh(); // signed in: the menu no longer offers "Register"
  }
  function forget() { try { localStorage.removeItem(KEY); localStorage.removeItem(TKEY); } catch (e) {} window.abecNav.refresh(); }
  // After a photo change the browser may still hold the old /api/photo for a few minutes, so the card asks
  // for the photo with a version that changes whenever the student saves a new one.
  function photoUrl(reg) {
    var v = "";
    try { v = localStorage.getItem("abecfx_photo_v") || ""; } catch (e) {}
    return v ? "/api/photo?reg=" + encodeURIComponent(reg) + "&v=" + v : undefined;
  }
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
    window.abecHandbook.reset(); window.abecWorkbook.reset();
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
    var dd = document.getElementById("dobDlg"); if (dd && dd.open) dd.close();
    var sd = document.getElementById("sigDlg"); if (sd && sd.open) sd.close();
    var pd = document.getElementById("photoDlg"); if (pd && pd.open) pd.close();
    loading.hidden = true;
    home.hidden = true;
    signin.hidden = false;
    err.textContent = message || "";
  }

  // ---- The student's ID cards: one card for each kind they hold (Student, Alumni, Team) ----
  var cardTitles = { "Team Member": "Team ID card", "Alumni Member": "Alumni ID card" };
  function cardTitle(c) { return cardTitles[c.status] || "Student ID card"; }
  // d: the portal record (with d.allCards). opts: { photoSrc, signatureSrc } shown on every card.
  function drawCards(d, opts) {
    var mount = document.getElementById("cardMount");
    var list = d.allCards && d.allCards.length ? d.allCards : [d];
    var many = list.length > 1;
    document.getElementById("downloadBtn").parentNode.hidden = many;
    document.getElementById("viewCard").classList.toggle("many-cards", many);
    document.getElementById("cardLead").textContent = many ? "These are your ID cards." : "This is your ID card.";
    mount.replaceChildren();
    list.forEach(function (c) {
      var one = document.createElement("section");
      one.className = "idc-one";
      if (many) {
        var h = document.createElement("h3");
        h.className = "idc-one-title";
        h.textContent = cardTitle(c);
        one.appendChild(h);
      }
      var wrap = document.createElement("div");
      wrap.className = "cardwrap";
      wrap.appendChild(window.renderStudentCard(c, opts));
      one.appendChild(wrap);
      if (many) {
        var actions = document.createElement("p");
        actions.className = "pass-actions";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn ghost";
        var label = "Download " + cardTitle(c);
        btn.textContent = label;
        btn.addEventListener("click", function () {
          var node = wrap.querySelector(".idc");
          if (!node || btn.disabled) return;
          btn.disabled = true; btn.textContent = "Preparing...";
          window.downloadIdCard(node, currentReg + " " + cardTitle(c).replace(" ID card", "")).then(function () {
            btn.textContent = label;
          }, function () {
            btn.textContent = "Could not download. Try again";
            setTimeout(function () { btn.textContent = label; }, 3500);
          }).then(function () { btn.disabled = false; });
        });
        actions.appendChild(btn);
        one.appendChild(actions);
      }
      mount.appendChild(one);
    });
  }

  function showHome(d) {
    loading.hidden = true;
    signin.hidden = true;
    var first = (d.fullName || "").split(" ")[0];
    document.getElementById("welcome").textContent = first ? "Welcome back, " + first : "Welcome back";
    mySig = "";
    sigNote("");
    pendingSigNotice = !!d.signatureMissing;
    pendingPhotoNotice = !!d.photoRedo;
    showDobNotice(d.dobNotice);
    if (!d.dobNotice) nextNotice();
    drawCards(d, { photoSrc: photoUrl(d.regNumber) });
    loadSignature(d);
    loadCertificate();
    var t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var note = window.expiryNotice(d);
    var live = document.getElementById("liveLine");
    live.textContent = note ? note.text : "Live record, checked at " + t;
    live.className = "live" + (note ? " live-" + note.level : "");
    setPhotoEditable(!d.photoChanged);
    photoNote("");
    home.hidden = false;
    currentReg = d.regNumber;
    closeQuiz(true);
    window.abecHandbook.reset(); window.abecWorkbook.reset();
    currentView = "";
    route();
  }

  // ---- My portal submenu: ID card, Quiz, Handbook (addresses #/card, #/quiz, #/handbook/03) ----
  var VIEWS = ["card", "quiz", "handbook", "workbook", "community"];
  var currentView = "";

  function parseRoute() {
    var m = /^#\/(card|quiz|handbook|workbook|community)(?:\/(\d{2}))?$/.exec(location.hash || "");
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
    document.querySelector(".sheet-inner").classList.toggle("is-wide", r.view === "handbook" || r.view === "workbook");
    if (r.view === "card" && currentView !== "card") window.abecHandbook.summary();
    if (r.view === "quiz" && currentView !== "quiz") showQuiz(currentReg);
    if (r.view === "community" && currentView !== "community") showCommunity();
    if (r.view === "handbook") window.abecHandbook.show(r.chapter);
    if (r.view === "workbook") window.abecWorkbook.show();
    currentView = r.view;
    if (r.view !== "handbook" || !r.chapter) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  window.abecHandbook.setup({ authFetch: function (u, o) { return authFetch(u, o); }, signedOut: function (m) { signedOut(m); } });
  window.abecWorkbook.setup({ authFetch: function (u, o) { return authFetch(u, o); }, signedOut: function (m) { signedOut(m); } });

  // ---- Community: the WhatsApp and Telegram groups set on the dashboard, opened in a new tab ----
  function safeHttps(u) {
    try { var x = new URL(String(u || "")); return x.protocol === "https:" ? x.href : ""; } catch (e) { return ""; }
  }
  function showCommunity() {
    var msg = document.getElementById("communityMsg");
    var wa = document.getElementById("communityWhatsapp");
    var tg = document.getElementById("communityTelegram");
    msg.textContent = "Loading...";
    msg.hidden = false;
    wa.hidden = true;
    tg.hidden = true;
    authFetch("/api/community")
      .then(function (r) { return r.json().then(function (b) { if (r.status === 401) { signedOut(); throw new Error("signed out"); } if (!r.ok) throw new Error(b.error); return b; }); })
      .then(function (c) {
        var w = safeHttps(c.whatsapp), t = safeHttps(c.telegram);
        if (w) { wa.href = w; wa.hidden = false; }
        if (t) { tg.href = t; tg.hidden = false; }
        // With only one choice, that one is the main button.
        if (!w && t) tg.className = "btn primary wide";
        else tg.className = "btn ghost wide";
        msg.hidden = !!(w || t);
        if (!w && !t) msg.textContent = "The community link is coming soon. Please check back.";
      })
      .catch(function (e) {
        if (e && e.message === "signed out") return;
        msg.textContent = "We could not load the community links just now. Refresh to try again.";
      });
  }

  // ---- Quiz results (taken in the ABEC-FX Telegram quiz bot) ----
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
        showHome(Object.assign({}, res.body.card, { photoChanged: res.body.photoChanged, dobNotice: res.body.dobNotice, signatureMissing: res.body.signatureMissing, photoRedo: res.body.photoRedo }));
      })
      .catch(function () { err.textContent = "Network problem. Check your connection and try again."; })
      .then(function () { btn.disabled = false; btn.textContent = "Sign in"; });
  });

  var dlBtn = document.getElementById("downloadBtn");
  dlBtn.addEventListener("click", function () {
    var card = document.querySelector("#cardMount .idc");
    if (!card || dlBtn.disabled) return;
    var label = dlBtn.textContent;
    dlBtn.disabled = true;
    dlBtn.textContent = "Preparing...";
    window.downloadIdCard(card, currentReg).then(function () {
      dlBtn.textContent = label;
    }, function () {
      dlBtn.textContent = "Could not download. Try again";
      setTimeout(function () { dlBtn.textContent = label; }, 3500);
    }).then(function () { dlBtn.disabled = false; });
  });
  // ---- Certificate: shown under the ID card once the student is Certified, with PNG and PDF downloads ----
  var certBlock = document.getElementById("certBlock");
  var certMsg = document.getElementById("certMsg");
  var certNo = "";
  function loadCertificate() {
    certBlock.hidden = true;
    certMsg.textContent = "";
    authFetch("/api/portal/certificate").then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; });
    }).then(function (res) {
      if (!res.ok || !res.body.eligible) return;
      certNo = res.body.certificate.certNo;
      document.getElementById("certMount").replaceChildren(
        window.renderCertificate(res.body.certificate, { signature: res.body.signature, origin: location.origin })
      );
      certBlock.hidden = false;
    }).catch(function () { /* no certificate shown; the ID card is unaffected */ });
  }
  [["certPng", "png"], ["certPdf", "pdf"]].forEach(function (x) {
    var b = document.getElementById(x[0]);
    b.addEventListener("click", function () {
      var frame = document.querySelector("#certMount .cert-frame");
      if (!frame || b.disabled) return;
      var label = b.textContent;
      b.disabled = true;
      b.textContent = "Preparing...";
      window.downloadCertificate(frame, certNo, x[1]).then(function () {
        b.textContent = label;
      }, function () {
        b.textContent = "Could not download. Try again";
        setTimeout(function () { b.textContent = label; }, 3500);
      }).then(function () { b.disabled = false; });
    });
  });

  var pendingSigNotice = false;
  var pendingPhotoNotice = false;
  // ---- Age requirement notice: a pop-up for a student whose date of birth on file is too recent ----
  var dobDlg = document.getElementById("dobDlg");
  var dobForm = document.getElementById("dobForm");
  var dobStart = document.getElementById("dobStart");
  var dobMsg = document.getElementById("dobMsg");
  var dobInput = document.getElementById("dobInput");
  function niceDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return Number(m[3]) + " " + months[Number(m[2]) - 1] + " " + m[1];
  }
  var lastDob = "";
  function showDobNotice(n) {
    if (n && n.dob) lastDob = n.dob; else if (n) n.dob = lastDob;
    if (!n) { if (dobDlg.open) dobDlg.close(); return; }
    if (sigNoticeDlg.open) sigNoticeDlg.close();
    if (photoNoticeDlg.open) photoNoticeDlg.close();
    var text = "The system has noticed that you do not meet our age requirements for registration. Your current date of birth is set as: " + niceDate(n.dob) + ".";
    document.getElementById("dobText").textContent = n.canUpdate
      ? text + " Please update it now to continue enjoying our services."
      : text + " You have already used your one update, so please contact your mentor to correct it.";
    document.getElementById("dobOpenForm").hidden = !n.canUpdate;
    dobStart.hidden = false;
    dobForm.hidden = true;
    dobMsg.textContent = "";
    dobInput.value = "";
    if (!dobDlg.open) { if (dobDlg.showModal) dobDlg.showModal(); else dobDlg.setAttribute("open", ""); }
  }
  // The notice cannot be dismissed with Escape: the student updates their date of birth (or signs out).
  dobDlg.addEventListener("cancel", function (e) { e.preventDefault(); });
  document.getElementById("dobOpenForm").addEventListener("click", function () {
    dobStart.hidden = true; dobForm.hidden = false; dobMsg.textContent = "";
    dobInput.focus();
  });
  document.getElementById("dobBack").addEventListener("click", function () {
    dobForm.hidden = true; dobStart.hidden = false; dobMsg.textContent = "";
  });
  document.getElementById("dobSignOut").addEventListener("click", function () {
    if (dobDlg.open) dobDlg.close();
    document.getElementById("switchBtn").click();
  });
  dobForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!dobInput.value) { dobMsg.textContent = "Please enter your date of birth."; return; }
    var save = document.getElementById("dobSave");
    save.disabled = true; dobMsg.textContent = "Saving...";
    authFetch("/api/portal/dob", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dob: dobInput.value }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (r.status === 401) { if (dobDlg.open) dobDlg.close(); signedOut(b.error); return; }
        if (!r.ok) {
          dobMsg.textContent = b.error || "We could not save your date of birth. Please try again.";
          if (b.canUpdate === false) showDobNotice({ dob: "", canUpdate: false });
          return;
        }
        dobMsg.textContent = "";
        dobDlg.close();
        liveNote("Your date of birth has been updated.");
        nextNotice();
      });
    }).catch(function () { dobMsg.textContent = "Network problem. Check your connection and try again."; })
      .then(function () { save.disabled = false; });
  });
  function liveNote(t) { var l = document.getElementById("liveLine"); if (l) { l.textContent = t; l.className = "live"; } }

  // ---- Photo notice: a pop-up for a student a mentor has asked to send a new passport photograph ----
  var photoNoticeDlg = document.getElementById("photoDlg");
  var photoNoticeData = "";
  // The notices come one after another: date of birth, then photograph, then signature.
  function nextNotice() {
    if (dobDlg.open || photoNoticeDlg.open) return;
    if (pendingPhotoNotice) { showPhotoNotice(); return; }
    showSigNotice();
  }
  function showPhotoNotice() {
    document.getElementById("photoDlgStart").hidden = false;
    document.getElementById("photoDlgForm").hidden = true;
    document.getElementById("photoDlgMsg").textContent = "";
    photoNoticeData = "";
    if (!photoNoticeDlg.open) { if (photoNoticeDlg.showModal) photoNoticeDlg.showModal(); else photoNoticeDlg.setAttribute("open", ""); }
  }
  photoNoticeDlg.addEventListener("cancel", function (e) { e.preventDefault(); });
  document.getElementById("photoDlgSignOut").addEventListener("click", function () {
    if (photoNoticeDlg.open) photoNoticeDlg.close();
    document.getElementById("switchBtn").click();
  });
  var photoDlgFile = document.getElementById("photoDlgFile");
  photoDlgFile.addEventListener("change", function () {
    var f = photoDlgFile.files && photoDlgFile.files[0];
    if (!f) return;
    var msg = document.getElementById("photoDlgMsg");
    msg.textContent = "";
    window.abecPhoto.process(f).then(function (dataUrl) {
      photoNoticeData = dataUrl;
      document.getElementById("photoDlgPreview").src = dataUrl;
      document.getElementById("photoDlgStart").hidden = true;
      document.getElementById("photoDlgForm").hidden = false;
    }, function (e) {
      document.getElementById("photoDlgStart").hidden = true;
      document.getElementById("photoDlgForm").hidden = false;
      document.getElementById("photoDlgPreview").removeAttribute("src");
      photoNoticeData = "";
      msg.textContent = e && e.message ? e.message : "We could not use that photo. Try a different one.";
    }).then(function () { photoDlgFile.value = ""; });
  });
  document.getElementById("photoDlgSave").addEventListener("click", function () {
    var btn = document.getElementById("photoDlgSave"), msg = document.getElementById("photoDlgMsg");
    if (!photoNoticeData || !currentReg) { msg.textContent = "Choose a photo first."; return; }
    btn.disabled = true; msg.textContent = "Saving...";
    var dataUrl = photoNoticeData;
    authFetch("/api/portal/photo", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo: dataUrl.slice(dataUrl.indexOf(",") + 1) }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (r.status === 401) { if (photoNoticeDlg.open) photoNoticeDlg.close(); signedOut(b.error); return; }
        if (!r.ok) { msg.textContent = b.error || "We could not save your photo. Please try again."; return; }
        try { localStorage.setItem("abecfx_photo_v", String(Date.now())); } catch (e) {}
        pendingPhotoNotice = false;
        return myCard().then(function (res) {
          if (res.ok) drawCards(res.body, { photoSrc: dataUrl, signatureSrc: mySig });
          setPhotoEditable(false);
          msg.textContent = "";
          photoNoticeDlg.close();
          liveNote("Your new passport photograph has been saved.");
          nextNotice();
        });
      });
    }).catch(function () { msg.textContent = "Network problem. Check your connection and try again."; })
      .then(function () { btn.disabled = false; });
  });

  // ---- Signature notice: a pop-up for a student who has no signature on file yet ----
  var sigNoticeDlg = document.getElementById("sigDlg");
  var sigNoticeWidget = null;
  function showSigNotice() {
    if (!pendingSigNotice || dobDlg.open || photoNoticeDlg.open) return;
    document.getElementById("sigDlgStart").hidden = false;
    document.getElementById("sigDlgForm").hidden = true;
    document.getElementById("sigDlgMsg").textContent = "";
    if (!sigNoticeDlg.open) { if (sigNoticeDlg.showModal) sigNoticeDlg.showModal(); else sigNoticeDlg.setAttribute("open", ""); }
  }
  sigNoticeDlg.addEventListener("cancel", function (e) { e.preventDefault(); });
  document.getElementById("sigDlgOpen").addEventListener("click", function () {
    if (!sigNoticeWidget) sigNoticeWidget = window.abecSignature.create(document.getElementById("sigDlgMount"));
    document.getElementById("sigDlgStart").hidden = true;
    document.getElementById("sigDlgForm").hidden = false;
  });
  document.getElementById("sigDlgBack").addEventListener("click", function () {
    document.getElementById("sigDlgForm").hidden = true;
    document.getElementById("sigDlgStart").hidden = false;
    document.getElementById("sigDlgMsg").textContent = "";
  });
  document.getElementById("sigDlgSignOut").addEventListener("click", function () {
    if (sigNoticeDlg.open) sigNoticeDlg.close();
    document.getElementById("switchBtn").click();
  });
  document.getElementById("sigDlgSave").addEventListener("click", function () {
    var btn = document.getElementById("sigDlgSave"), msg = document.getElementById("sigDlgMsg");
    if (!sigNoticeWidget || !currentReg) return;
    btn.disabled = true; msg.textContent = "Saving...";
    sigNoticeWidget.value().then(function (url) {
      if (!url) { msg.textContent = ""; return; }
      return authFetch("/api/portal/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: url.slice(url.indexOf(",") + 1) }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          if (r.status === 401) { if (sigNoticeDlg.open) sigNoticeDlg.close(); signedOut(b.error); return; }
          if (!r.ok) throw new Error(b.error || "We could not save your signature. Please try again.");
          mySig = url;
          pendingSigNotice = false;
          sigToggle.textContent = "Change my signature";
          return myCard().then(function (res) {
            if (res.ok) redrawCard(res.body);
            msg.textContent = "";
            sigNoticeDlg.close();
            sigNoticeWidget.clear();
            sigNote("Your signature is saved and now shows on your ID card.", true);
          });
        });
      });
    }).catch(function (e) { msg.textContent = e && e.message ? e.message : "Network problem. Check your connection and try again."; })
      .then(function () { btn.disabled = false; });
  });

  // ---- My signature: shown on the student's own card, drawn or uploaded, saved on the website ----
  var mySig = "";
  var sigToggle = document.getElementById("sigToggle");
  var sigPanel = document.getElementById("sigPanel");
  var sigSave = document.getElementById("sigSave");
  var sigMsg = document.getElementById("sigMsg");
  var sigWidget = null;
  function sigNote(text, ok) {
    sigMsg.textContent = text || "";
    sigMsg.style.color = ok ? "var(--violet, #5a1060)" : "";
  }
  function redrawCard(d) {
    drawCards(d, { photoSrc: photoUrl(d.regNumber), signatureSrc: mySig });
  }
  function loadSignature(d) {
    sigPanel.hidden = true;
    sigToggle.textContent = "Add my signature";
    authFetch("/api/portal/signature").then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; });
    }).then(function (res) {
      if (!res.ok || !res.body.signature || currentReg !== d.regNumber) return;
      mySig = "data:image/png;base64," + res.body.signature;
      sigToggle.textContent = "Change my signature";
      redrawCard(d);
    }).catch(function () { /* the card simply shows without a signature */ });
  }
  sigToggle.addEventListener("click", function () {
    if (sigPanel.hidden) {
      if (!sigWidget) sigWidget = window.abecSignature.create(document.getElementById("sigPortalMount"));
      sigPanel.hidden = false;
      sigToggle.textContent = "Cancel";
    } else {
      sigPanel.hidden = true;
      sigToggle.textContent = mySig ? "Change my signature" : "Add my signature";
      if (sigWidget) sigWidget.clear();
    }
    sigNote("");
  });
  sigSave.addEventListener("click", function () {
    if (!sigWidget || !currentReg) return;
    sigSave.disabled = true;
    sigNote("Saving...");
    sigWidget.value().then(function (url) {
      if (!url) { sigNote(""); return; }
      return authFetch("/api/portal/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: url.slice(url.indexOf(",") + 1) }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          if (r.status === 401) { signedOut(b.error); return; }
          if (!r.ok) throw new Error(b.error || "We could not save your signature. Please try again.");
          mySig = url;
          return myCard().then(function (res) {
            if (res.ok) redrawCard(res.body);
            sigPanel.hidden = true;
            sigToggle.textContent = "Change my signature";
            sigWidget.clear();
            sigNote("Your signature is saved and now shows on your ID card.", true);
          });
        });
      });
    }).catch(function (e) { sigNote(e && e.message ? e.message : "Network problem. Check your connection and try again."); })
      .then(function () { sigSave.disabled = false; });
  });

  // ---- Change my photo: shrink it in the browser, save it, then redraw the card with the new photo ----
  var newPhoto = document.getElementById("newPhoto");
  var newPhotoBtn = document.getElementById("newPhotoBtn");
  var photoMsg = document.getElementById("photoMsg");
  var photoBusy = false;
  // Each student can change their photo once. After that the button goes away.
  function setPhotoEditable(can) { newPhotoBtn.hidden = !can; newPhoto.disabled = !can; }
  function photoNote(text, ok) {
    photoMsg.textContent = text || "";
    photoMsg.style.color = ok ? "var(--violet, #5a1060)" : "";
  }
  newPhoto.addEventListener("change", function () {
    var file = newPhoto.files && newPhoto.files[0];
    if (!file || photoBusy || !currentReg) return;
    photoBusy = true;
    var label = newPhotoBtn.textContent;
    newPhotoBtn.textContent = "Saving...";
    photoNote("");
    window.abecPhoto.process(file)
      .then(function (dataUrl) {
        return authFetch("/api/portal/photo", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photo: dataUrl.slice(dataUrl.indexOf(",") + 1) }),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (b) {
            if (r.status === 401) { signedOut(b.error); return; }
            if (r.status === 403 && b.photoChanged) { setPhotoEditable(false); throw new Error(b.error); }
            if (!r.ok) throw new Error(b.error || "We could not save your photo. Please try again.");
            try { localStorage.setItem("abecfx_photo_v", String(Date.now())); } catch (e) {}
            // Show the photo just chosen (the saved copy can be cached by the browser for a few minutes)
            return myCard().then(function (res) {
              if (res.ok) drawCards(res.body, { photoSrc: dataUrl, signatureSrc: mySig });
              setPhotoEditable(false);
              photoNote("Your photo has been updated. A photo can only be changed once, so this is final.", true);
            });
          });
        });
      })
      .catch(function (e) { photoNote(e && e.message ? e.message : "Network problem. Check your connection and try again."); })
      .then(function () { photoBusy = false; newPhotoBtn.textContent = label; newPhoto.value = ""; });
  });

  document.getElementById("switchBtn").addEventListener("click", function () {
    closeQuiz(true);
    window.abecHandbook.reset(); window.abecWorkbook.reset();
    currentReg = "";
    mySig = "";
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
