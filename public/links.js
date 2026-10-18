// Social icons, "Create a Deriv account" button, About and Contact for the left panel.
// The addresses come from /api/links, which the editor changes on /admin.
(function () {
  "use strict";
  var mount = document.getElementById("siteLinks");
  if (!mount) return;

  var ICONS = {
    facebook: '<path d="M13.5 21v-7.5h2.6l.5-3h-3.1V8.6c0-.9.3-1.6 1.6-1.6h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.3H7.9v3h2.6V21h3z"/>',
    whatsapp: '<path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2zm0 1.7a7.1 7.1 0 1 1-3.7 13.2l-.3-.2-2.4.6.6-2.3-.2-.3A7.1 7.1 0 0 1 12 4.9zM8.9 7.9c-.2 0-.5.1-.7.4-.3.3-.9.9-.9 2.1 0 1.2.9 2.4 1 2.6.1.2 1.8 2.8 4.4 3.8 2.1.8 2.6.7 3 .6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3l-1.600-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.3-.1-1-.4-1.900-1.200-.7-.6-1.200-1.400-1.300-1.700-.1-.2 0-.4.1-.5l.4-.4c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.8-1.800c-.2-.5-.4-.5-.6-.5z"/>',
    tiktok: '<path d="M16.6 3.5c.3 2 1.500 3.300 3.500 3.500v2.800c-1.300.1-2.500-.3-3.500-1v6.200c0 3-2.300 5.300-5.200 5.300S6.300 18 6.300 15.100s2.400-5.400 5.500-5.200v2.900c-1.400-.3-2.600.8-2.600 2.200 0 1.200 1 2.200 2.200 2.200s2.200-1 2.200-2.400V3.500h3z"/>',
    x: '<path d="M17.800 3.500h3l-6.500 7.500 7.700 10h-6l-4.700-6.100-5.400 6.100h-3l7-8L3.300 3.500h6.200l4.200 5.600 4.100-5.600zm-1 15.700h1.700L8 5.200H6.200l10.600 14z"/>',
    telegram: '<path d="M20.700 4.300 3.500 10.900c-.9.400-.9 1 0 1.200l4.400 1.400 1.700 5.200c.2.600.4.700.9.700.4 0 .6-.2.900-.4l2.100-2 4.300 3.200c.8.400 1.400.2 1.600-.7l2.900-13.700c.3-1.100-.4-1.600-1.200-1.300zM9 13.200l8.100-5.100c.4-.2.700-.1.400.2l-6.700 6-.3 3.400L9 13.200z"/>',
    youtube: '<path d="M21.600 7.600a2.500 2.500 0 0 0-1.800-1.800C18.200 5.400 12 5.400 12 5.400s-6.200 0-7.800.4A2.500 2.500 0 0 0 2.400 7.600C2 9.200 2 12 2 12s0 2.800.4 4.400a2.500 2.500 0 0 0 1.800 1.800c1.600.4 7.800.4 7.800.4s6.200 0 7.800-.4a2.500 2.500 0 0 0 1.800-1.800c.4-1.600.4-4.400.4-4.400s0-2.800-.4-4.400zM10 15V9l5.200 3L10 15z"/>',
    about: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 1.800a7.200 7.200 0 1 1 0 14.400 7.200 7.200 0 0 1 0-14.400zM11.100 10.500h1.800v6h-1.800v-6zm0-3h1.800v1.800h-1.800V7.500z"/>',
    contact: '<path d="M6.600 3.500c-.5 0-1 .2-1.300.6L4 5.500c-.6.700-.7 1.600-.4 2.400 1.300 3.400 3.500 6.300 6.200 8.500 2.100 1.700 4.300 2.700 6.500 3.200.9.200 1.800-.1 2.300-.8l1-1.300c.5-.7.400-1.700-.3-2.200l-2.500-1.800c-.6-.4-1.300-.4-1.900 0l-1 .7c-1.700-1-3.100-2.400-4.100-4.100l.8-.9c.5-.5.600-1.300.2-1.900L8 4.300c-.3-.5-.8-.8-1.400-.8z"/>'
  };
  var LABELS = { facebook: "Facebook", whatsapp: "WhatsApp channel", tiktok: "TikTok", x: "X", telegram: "Telegram", youtube: "YouTube", about: "About us", contact: "Contact us" };
  var ORDER = ["facebook", "whatsapp", "tiktok", "x", "telegram", "youtube"];

  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>";
  }
  function safeUrl(u) {
    try { var x = new URL(String(u || "")); return x.protocol === "https:" ? x.href : ""; } catch (e) { return ""; }
  }
  function digits(v) { return String(v || "").replace(/\D/g, ""); }

  function iconLink(name, href) {
    var a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", LABELS[name]);
    a.title = LABELS[name];
    a.className = "soc soc-" + name;
    a.innerHTML = svg(name);
    return a;
  }
  function iconButton(name, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", LABELS[name]);
    b.title = LABELS[name];
    b.className = "soc soc-" + name;
    b.innerHTML = svg(name);
    b.addEventListener("click", onClick);
    return b;
  }

  // One dialog shared by About and Contact, built once on first use.
  var dlg = null;
  function openDialog(title, build) {
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "info-dlg";
      dlg.setAttribute("aria-labelledby", "infoDlgTitle");
      dlg.innerHTML = '<div class="info-box"><h2 id="infoDlgTitle"></h2><div class="info-body"></div>' +
        '<button type="button" class="btn ghost wide info-close">Close</button></div>';
      document.body.appendChild(dlg);
      dlg.querySelector(".info-close").addEventListener("click", function () { dlg.close(); });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    }
    dlg.querySelector("h2").textContent = title;
    var body = dlg.querySelector(".info-body");
    body.replaceChildren();
    build(body);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  function showAbout(text) {
    openDialog("About ABECFX", function (body) {
      String(text).split(/\n{2,}/).forEach(function (para) {
        var p = document.createElement("p");
        p.textContent = para.trim();
        if (p.textContent) body.appendChild(p);
      });
    });
  }
  function showContact(phone) {
    openDialog("Contact us", function (body) {
      var p = document.createElement("p");
      p.textContent = phone;
      p.className = "info-phone";
      body.appendChild(p);
      var call = document.createElement("a");
      call.className = "btn primary wide";
      call.href = "tel:+" + digits(phone);
      call.textContent = "Call";
      body.appendChild(call);
      var wa = document.createElement("a");
      wa.className = "btn ghost wide";
      wa.href = "https://wa.me/" + digits(phone);
      wa.target = "_blank";
      wa.rel = "noopener noreferrer";
      wa.textContent = "Chat on WhatsApp";
      body.appendChild(wa);
    });
  }

  function render(v) {
    mount.replaceChildren();
    var row = document.createElement("div");
    row.className = "soc-row";

    var deriv = safeUrl(v.deriv);
    if (deriv) {
      var d = document.createElement("a");
      d.className = "btn deriv-cta";
      d.href = deriv;
      d.target = "_blank";
      d.rel = "noopener noreferrer sponsored";
      d.textContent = "Create your Deriv account";
      mount.appendChild(d);
    }

    ORDER.forEach(function (k) {
      var href = safeUrl(v[k]);
      if (href) row.appendChild(iconLink(k, href));
    });
    var phone = String(v.contact || "").trim();
    if (digits(phone).length >= 7) row.appendChild(iconButton("contact", function () { showContact(phone); }));
    var about = String(v.about || "").trim();
    if (about) row.appendChild(iconButton("about", function () { showAbout(about); }));

    if (row.children.length) mount.appendChild(row);
    mount.hidden = !mount.children.length;
  }

  fetch("/api/links", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (v) { if (v && typeof v === "object") render(v); })
    .catch(function () { /* the icons are optional; the page works without them */ });
})();
