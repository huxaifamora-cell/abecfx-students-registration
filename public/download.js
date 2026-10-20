/*
 * Download the ID card as a PNG picture. Used only by the student portal (portal.html).
 * Draws the card that is already on screen: copies it with its styles, turns its pictures
 * and fonts into inline data, paints it through an SVG image onto a canvas and saves it.
 */
(function () {
  "use strict";

  var WIDTH = 440;  // card width in CSS px (same as .cardwrap max-width)
  var SCALE = 3;    // 3x for a sharp picture

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  function toDataUrl(url, opts) {
    return fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.blob();
    }).then(blobToDataUrl);
  }

  // All CSS the card needs, with every url(...) replaced by inline data.
  function collectCss() {
    var css = "";
    Array.prototype.forEach.call(document.styleSheets, function (sheet) {
      try {
        Array.prototype.forEach.call(sheet.cssRules, function (rule) {
          if (rule.type === 3) return; // @import
          css += rule.cssText + "\n";
        });
      } catch (e) { /* a sheet from another site cannot be read */ }
    });
    return css;
  }
  function inlineCssUrls(css) {
    var urls = {};
    css.replace(/url\(\s*["']?(\/[^"')]+)["']?\s*\)/g, function (m, u) { urls[u] = true; return m; });
    return Promise.all(Object.keys(urls).map(function (u) {
      return toDataUrl(u).then(function (d) { return [u, d]; }, function () { return [u, null]; });
    })).then(function (pairs) {
      pairs.forEach(function (p) {
        if (!p[1]) return;
        css = css.split('url("' + p[0] + '")').join('url("' + p[1] + '")').split("url(" + p[0] + ")").join('url("' + p[1] + '")');
      });
      return css;
    });
  }

  // Embed the Google fonts the site uses, if they can be reached; otherwise the card uses fallback fonts.
  function fontCss() {
    var links = Array.prototype.filter.call(document.styleSheets, function (s) { return s.href && /fonts\.googleapis\.com/.test(s.href); });
    var sources = links.map(function (s) { return s.href; });
    // the site loads them with @import in styles.css
    Array.prototype.forEach.call(document.styleSheets, function (sheet) {
      try {
        Array.prototype.forEach.call(sheet.cssRules, function (rule) {
          if (rule.type === 3 && /fonts\.googleapis\.com/.test(rule.href)) sources.push(rule.href);
        });
      } catch (e) {}
    });
    return Promise.all(sources.map(function (href) {
      return fetch(href).then(function (r) { return r.text(); }).then(function (text) {
        var files = [];
        text.replace(/url\((https:[^)]+)\)/g, function (m, u) { files.push(u); return m; });
        return Promise.all(files.map(function (u) {
          return toDataUrl(u).then(function (d) { return [u, d]; }, function () { return [u, null]; });
        })).then(function (pairs) {
          pairs.forEach(function (p) { if (p[1]) text = text.split(p[0]).join(p[1]); });
          return text;
        });
      }).catch(function () { return ""; });
    })).then(function (parts) { return parts.join("\n"); });
  }

  function inlineImages(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll("img"));
    return Promise.all(imgs.map(function (img) {
      var src = img.currentSrc || img.src;
      if (!src || /^data:/.test(src)) return null;
      var loaded = img.complete && img.naturalWidth > 0;
      return toDataUrl(src, { credentials: "same-origin" }).then(function (d) {
        img.setAttribute("src", d);
        img.removeAttribute("srcset");
      }, function () {
        // a picture that cannot be read: leave it out rather than break the download
        if (!loaded || /^https?:/.test(src)) img.remove();
      });
    }));
  }

  function buildSvg(card) {
    var height = Math.ceil(card.getBoundingClientRect().height * (WIDTH / card.getBoundingClientRect().width));
    var clone = card.cloneNode(true);
    clone.style.animation = "none";
    clone.style.boxShadow = "none";
    clone.style.borderRadius = "0";
    var wrap = document.createElement("div");
    wrap.className = "cardwrap";
    wrap.style.cssText = "width:" + WIDTH + "px;max-width:none;margin:0";
    wrap.appendChild(clone);
    return Promise.all([inlineImages(wrap), inlineCssUrls(collectCss()), fontCss()]).then(function (r) {
      var css = r[2] + "\n" + r[1] + "\n.cardwrap{font-family:var(--body);color:var(--ink);line-height:1.5}";
      var xhtml = new XMLSerializer().serializeToString(wrap);
      var svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + WIDTH * SCALE + '" height="' + height * SCALE + '" viewBox="0 0 ' + WIDTH + " " + height + '">' +
        '<foreignObject x="0" y="0" width="' + WIDTH + '" height="' + height + '">' +
        '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + css.replace(/]]>/g, "") + "</style>" + xhtml + "</div>" +
        "</foreignObject></svg>";
      return { svg: svg, w: WIDTH * SCALE, h: height * SCALE };
    });
  }

  function toPng(o) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = o.w; c.height = o.h;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, o.w, o.h);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("no image")); }, "image/png");
      };
      img.onerror = function () { reject(new Error("render failed")); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(o.svg);
    });
  }

  /** window.downloadIdCard(cardElement, regNumber) -> Promise */
  window.downloadIdCard = function (card, reg) {
    var wait = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return wait.then(function () { return buildSvg(card); }).then(toPng).then(function (blob) {
      var a = document.createElement("a");
      var url = URL.createObjectURL(blob);
      a.href = url;
      a.download = "ABEC-FX-ID-" + String(reg || "card").replace(/[^A-Za-z0-9]+/g, "-") + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    });
  };
})();
