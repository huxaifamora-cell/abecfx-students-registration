/*
 * Student ID card renderer (shared by the registration success screen and the status page).
 * Needs qr.js loaded first. All text is set with textContent, never innerHTML.
 */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var stampCounter = 0;

  var STATUS_CLASS = {
    "Uncertified": "s-uncertified",
    "Certified": "s-certified",
    "Team Member": "s-team",
    "Alumni Member": "s-alumni"
  };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    var a = parts[0].charAt(0), b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
    return (a + b).toUpperCase();
  }
  function emojiFlag(code) {
    if (!/^[a-z]{2}$/i.test(code || "")) return "";
    return String.fromCodePoint.apply(null, code.toUpperCase().split("").map(function (c) {
      return 0x1f1e6 + c.charCodeAt(0) - 65;
    }));
  }

  // The kind of card: only Uncertified and Certified people are students. Team members and alumni are not called students.
  function cardKind(status) {
    return status === "Team Member" ? "Team ID card" : status === "Alumni Member" ? "Alumni ID card" : "Student ID card";
  }

  // What the card calls a status. A Certified student shows as "Certified".
  function statusLabel(status) { return status; }

  // Round stamp: "Certified", "Team member" or "Alumni member".
  var STAMP_TOP = { "Certified": "CERTIFIED", "Team Member": "TEAM MEMBER", "Alumni Member": "ALUMNI MEMBER" };
  var STAMP_LABEL = { "Certified": "Certified student of ABEC-FX", "Team Member": "Team member of ABEC-FX", "Alumni Member": "Alumni member of ABEC-FX" };
  function buildStamp(status, dateText) {
    var top = STAMP_TOP[status] || "CERTIFIED";
    var label = STAMP_LABEL[status] || STAMP_LABEL.Certified;
    var id = "stamp" + ++stampCounter;

    var svg = svgEl("svg", { viewBox: "0 0 200 200", "class": "idc-stamp-svg", role: "img", "aria-label": label });

    var defs = svgEl("defs");
    defs.appendChild(svgEl("path", { id: id + "t", d: "M 100,100 m -67,0 a 67,67 0 1,1 134,0" }));
    defs.appendChild(svgEl("path", { id: id + "b", d: "M 100,100 m -78,0 a 78,78 0 0,0 156,0" }));
    svg.appendChild(defs);

    svg.appendChild(svgEl("circle", { cx: 100, cy: 100, r: 95, "class": "st-ring st-ring-thick" }));
    svg.appendChild(svgEl("circle", { cx: 100, cy: 100, r: 89, "class": "st-ring st-ring-thin" }));
    svg.appendChild(svgEl("circle", { cx: 100, cy: 100, r: 53, "class": "st-ring st-ring-thin" }));

    function arcText(pathId, str, size) {
      var t = svgEl("text", { "class": "st-arc", "font-size": size });
      var tp = svgEl("textPath", { href: "#" + pathId, startOffset: "50%", "text-anchor": "middle" });
      tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + pathId);
      tp.textContent = str;
      t.appendChild(tp);
      return t;
    }
    svg.appendChild(arcText(id + "t", top, top.length > 20 ? 10.5 : top.length > 14 ? 12.5 : 13.5)); // long titles get a smaller size so they fit the ring
    svg.appendChild(arcText(id + "b", "ADEBASS BASE EDGE CONSULT", 10.5));

    var stars = svgEl("text", { x: 100, y: 83, "text-anchor": "middle", "class": "st-stars", "font-size": 10 });
    stars.textContent = "★ ★ ★";
    svg.appendChild(stars);

    var name = svgEl("text", { x: 100, y: 107, "text-anchor": "middle", "class": "st-name", "font-size": 20 });
    name.textContent = "ABEC-FX";
    svg.appendChild(name);

    svg.appendChild(svgEl("line", { x1: 72, y1: 115, x2: 128, y2: 115, "class": "st-line" }));

    var date = svgEl("text", { x: 100, y: 129, "text-anchor": "middle", "class": "st-date", "font-size": 9.5 });
    date.textContent = dateText ? String(dateText).toUpperCase() : "OFFICIAL";
    svg.appendChild(date);
    return svg;
  }

  // Text for the "expires" line on the card. Only an Uncertified ID has one: any other status shows no line at all.
  function expiryLine(d) {
    if (d.expiryKind === "none") return null;
    if (d.expiryKind === "date") {
      if (d.expired) return { text: "Expired " + d.expires, cls: "is-expired" };
      if (d.daysLeft === 0) return { text: "Expires today", cls: "is-soon" };
      return { text: "Expires " + d.expires, cls: d.daysLeft <= 14 ? "is-soon" : "" };
    }
    if (d.expiryKind === "unknown") return { text: "Expiry date not set", cls: "" };
    return null;
  }

  // Message shown under the card when an ID has expired or is about to.
  window.expiryNotice = function (d) {
    if (d.expiryKind !== "date") return null;
    if (d.expired) return { level: "bad", text: "This ID expired on " + d.expires + ". Speak to ABEC-FX to renew it." };
    if (d.daysLeft <= 14) {
      var when = d.daysLeft === 0 ? "today" : d.daysLeft === 1 ? "tomorrow" : "in " + d.daysLeft + " days";
      return { level: "soon", text: "This ID expires " + when + " (" + d.expires + ")." };
    }
    return null;
  };

  // The signature is stored as dark ink on see-through. On the card it is drawn in white, so recolour it here.
  function whiteInk(src, done) {
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        done(c.toDataURL("image/png"));
      } catch (e) { done(src); }
    };
    img.onerror = function () { done(src); };
    img.src = src;
  }

  /**
   * d: card data from /api/lookup or /api/register
   * opts.photoSrc: use this image instead of /api/photo (e.g. the just-taken photo)
   * opts.signatureSrc: the holder's signature picture (shown only on their own card)
   */
  window.renderStudentCard = function (d, opts) {
    opts = opts || {};
    var status = d.status || "Uncertified";
    var card = el("article", "idc");
    card.setAttribute("data-status", status.toLowerCase().replace(/\s+/g, "-"));
    card.setAttribute("aria-label", cardKind(status) + " for " + d.fullName);

    // ---- header
    var top = el("div", "idc-top");
    var brand = el("div", "idc-brand");
    var logo = el("img");
    logo.src = "/logo-white.png"; logo.alt = ""; logo.width = 30; logo.height = 23;
    brand.appendChild(logo);
    brand.appendChild(el("span", null, "ABEC-FX"));
    top.appendChild(brand);
    card.appendChild(top);
    card.appendChild(el("div", "idc-kind", cardKind(status))); // big banner: Student / Team / Alumni ID card

    // ---- passport photo + national flag + facts
    var hero = el("div", "idc-hero");
    var photoBox = el("div", "idc-photo");
    var fallback = el("span", "idc-initials", initials(d.fullName));
    fallback.setAttribute("aria-hidden", "true");
    photoBox.appendChild(fallback);
    var photo = el("img", "idc-photo-img");
    photo.alt = "Passport photograph of " + d.fullName;
    photo.addEventListener("load", function () { photoBox.classList.add("has-photo"); });
    photo.addEventListener("error", function () { photo.remove(); });
    photo.src = opts.photoSrc || "/api/photo?reg=" + encodeURIComponent(d.regNumber);
    photoBox.appendChild(photo);

    if (d.countryCode) {
      var flagWrap = el("div", "idc-flag");
      var flag = el("img");
      flag.alt = (d.country || "National") + " flag";
      flag.src = "https://flagcdn.com/w80/" + d.countryCode + ".png";
      flag.srcset = "https://flagcdn.com/w80/" + d.countryCode + ".png 1x, https://flagcdn.com/w160/" + d.countryCode + ".png 2x";
      flag.addEventListener("error", function () {
        flagWrap.textContent = emojiFlag(d.countryCode);
        flagWrap.classList.add("idc-flag-emoji");
      });
      flagWrap.appendChild(flag);
      photoBox.appendChild(flagWrap);
    }
    hero.appendChild(photoBox);

    var facts = el("dl", "idc-facts");
    function fact(label, value) {
      var row = el("div");
      row.appendChild(el("dt", null, label));
      row.appendChild(el("dd", null, value || "Not recorded"));
      facts.appendChild(row);
    }
    fact("Country", d.country);
    if (d.state) fact("State", /^abuja federal capital territory$/i.test(d.state.trim()) ? "FCT Abuja" : d.state);
    fact("Gender", d.gender);
    if (status !== "Team Member") { // programme and admission year are student details
      fact("Programme", d.programme);
      fact("Admitted", d.admitted ? String(d.admitted) : "");
    } else {
      fact("Joined", d.admitted ? String(d.admitted) : "");
    }
    hero.appendChild(facts);
    card.appendChild(hero);

    // ---- name + registration number
    if (d.expired) {
      card.classList.add("idc-is-expired");
      var mark = el("div", "idc-expired-mark", "EXPIRED");
      mark.setAttribute("aria-hidden", "true");
      card.appendChild(mark);
    }
    card.appendChild(el("h3", "idc-name", String(d.fullName || "").toUpperCase()));
    if (status === "Team Member" && d.teamRole) card.appendChild(el("p", "idc-roleline", d.teamRole));
    card.appendChild(el("p", "idc-reg", d.regNumber));

    // ---- status (+ stamp for certified graduates, alumni and the team)
    var row = el("div", "idc-statusrow");
    // A team member's card shows no status chip or "Since ..." line (the round team stamp says it); only students have a status to show.
    if (status !== "Team Member") {
      var col = el("div", "idc-statuscol");
      var chip = el("span", "status " + (STATUS_CLASS[status] || "s-uncertified"));
      chip.appendChild(el("span", null, statusLabel(status)));
      col.appendChild(chip);
      col.appendChild(el("span", "idc-since",
        status === "Uncertified" ? "Awaiting certification"
          : "Since " + (d.statusDate || "date not recorded")));
      row.appendChild(col);
    } else {
      row.classList.add("idc-statusrow-solo");
    }
    if (status === "Certified" || status === "Alumni Member" || status === "Team Member") {
      var stampWrap = el("div", "idc-stamp");
      stampWrap.appendChild(buildStamp(status, d.statusDate));
      row.appendChild(stampWrap);
    }
    card.appendChild(row);

    // ---- the student's own signature, white ink straight under "Since ..." (only on their own card,
    // never on the public find-a-student card)
    if (opts.signatureSrc) {
      var sigBox = el("div", "idc-sig");
      var sigImg = el("img");
      sigImg.alt = "Signature of " + d.fullName;
      sigImg.hidden = true;
      whiteInk(opts.signatureSrc, function (url) { sigImg.src = url; sigImg.hidden = false; });
      sigBox.appendChild(sigImg);
      sigBox.appendChild(el("span", null, "Holder's signature"));
      card.appendChild(sigBox);
    }

    // ---- QR code: opens this student's live status
    var qrKind = status === "Team Member" ? "team" : status === "Alumni Member" ? "alumni" : "student";
    var url = (opts.origin || location.origin) + "/status?kind=" + qrKind + "&reg=" + d.regNumber;
    var verify = el("div", "idc-verify");
    var qr = el("div", "idc-qr");
    try { qr.appendChild(window.QR.toSvg(url, { border: 1 })); } catch (e) { qr.textContent = ""; }
    verify.appendChild(qr);
    var vt = el("div", "idc-vtext");
    vt.appendChild(el("strong", null, "Scan to check status"));
    vt.appendChild(el("span", null, "Opens this ID card's live record."));
    if (d.issued) vt.appendChild(el("span", "idc-issued", "Issued " + d.issued));
    var exp = expiryLine(d);
    if (exp) vt.appendChild(el("span", "idc-expiry " + exp.cls, exp.text));
    verify.appendChild(vt);
    card.appendChild(verify);

    var foot = el("div", "idc-foot");
    foot.appendChild(el("span", null, "Adebass Base Edge Consult"));
    card.appendChild(foot);
    return card;
  };
})();
