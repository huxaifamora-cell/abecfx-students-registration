/*
 * Certificate of completion: drawn as one vector picture (SVG), so it is sharp at any size and in print.
 *   var el = window.renderCertificate(data, { signature: "<base64 PNG>", origin: location.origin, viewOnly: true });
 *   window.downloadCertificate(el, "ABECFX/26/0001", "png" | "pdf")  -> Promise
 * data comes from /api/certificate (see certificate.js on the server): { certNo, fullName, awarded, year, org, rc,
 * signerName, signerTitle }. The public lookup page passes viewOnly, which adds a "view only" watermark; the
 * student's own copy and the dashboard's copy are clean.
 */
(function () {
  "use strict";

  var W = 1280, H = 909;                           // the size of the original design (1280 x 909)
  var PURPLE = "#901d85", INK = "#1d1424", BLACK = "#0d0a10", PURE_BLACK = "#000";
  var SANS = "'Montserrat','Segoe UI',Arial,Helvetica,sans-serif";
  var HEAVY = "'Arial Black','Segoe UI Black','Montserrat',Arial,Helvetica,sans-serif";
  var SERIF = "'Times New Roman',Times,Georgia,serif";
  // The real artwork taken from the approved certificate design (certificate-art.js): the bull-horn emblem and the gold seal.
  var ART = window.CERT_ART || {};

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Text width in pixels at a font size, measured with the browser's own fonts.
  var ctx = null;
  function measure(text, weight, size) {
    try {
      if (!ctx) ctx = document.createElement("canvas").getContext("2d");
      ctx.font = weight + " " + size + "px " + SANS;
      return ctx.measureText(text).width;
    } catch (e) {
      return text.length * size * 0.58;
    }
  }
  // Largest font size (up to `max`) at which the text still fits in `width`.
  function fit(text, weight, max, width) {
    var w = measure(text, weight, max);
    return w <= width ? max : Math.max(10, Math.floor(max * width / w * 10) / 10);
  }
  // Greedy word wrap for the paragraph; every line but the last is stretched to the full width.
  function wrap(text, weight, size, width) {
    var words = String(text).split(" "), lines = [], line = "";
    words.forEach(function (w) {
      var t = line ? line + " " + w : w;
      if (line && measure(t, weight, size) > width) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }

  // The gold seal is the picture from the approved design (laurel wreath, stars and ribbons). Its printed year was taken out
  // of the picture so the year printed here is always the year of the certificate.
  function seal(year) {
    var out = "";
    var box = ART.sealBox || { x: 1015, y: 417, w: 200, h: 255 };
    if (ART.seal) out += '<image x="' + box.x + '" y="' + box.y + '" width="' + box.w + '" height="' + box.h + '" preserveAspectRatio="none" href="' + ART.seal + '"/>';
    var y = String(year || "");
    if (/^\d{4}$/.test(y)) {
      var t = function (txt, base) {
        return '<text x="1095.5" y="' + base + '" font-size="30" font-weight="800" fill="' + PURPLE + '" font-family="' + SANS + '" textLength="34.5" lengthAdjust="spacingAndGlyphs">' + txt + "</text>";
      };
      out += t(y.slice(0, 2), 507.5) + t(y.slice(2), 533.5);
    }
    return "<g>" + out + "</g>";
  }

  // Round official stamp (the same design as the one on the ID card), in black ink, slightly turned like a real one.
  function stamp(org, year) {
    var top = String(org || "ABEC-FX").toUpperCase();
    var topSize = Math.min(13.5, Math.floor(200 / (top.length * 0.68) * 10) / 10);
    var bottom = "CERTIFICATE OF COMPLETION";
    var t = function (id, str, size) {
      return '<text font-size="' + size + '" font-weight="800" letter-spacing=".6" fill="' + BLACK + '" font-family="' + SANS + '">' +
        '<textPath href="#' + id + '" startOffset="50%" text-anchor="middle">' + esc(str) + "</textPath></text>";
    };
    return '<g transform="translate(672 752) rotate(-11) scale(.68) translate(-100 -100)" opacity=".9">' +
      '<defs><path id="stmpT" d="M 100,100 m -67,0 a 67,67 0 1,1 134,0"/><path id="stmpB" d="M 100,100 m -78,0 a 78,78 0 0,0 156,0"/></defs>' +
      '<circle cx="100" cy="100" r="95" fill="none" stroke="' + BLACK + '" stroke-width="5"/>' +
      '<circle cx="100" cy="100" r="88" fill="none" stroke="' + BLACK + '" stroke-width="1.6"/>' +
      '<circle cx="100" cy="100" r="53" fill="none" stroke="' + BLACK + '" stroke-width="1.6"/>' +
      t("stmpT", top, topSize) + t("stmpB", bottom, 10.5) +
      '<text x="100" y="82" text-anchor="middle" font-size="10" fill="' + BLACK + '" font-family="' + SANS + '">\u2605 \u2605 \u2605</text>' +
      '<text x="100" y="107" text-anchor="middle" font-size="21" font-weight="900" fill="' + BLACK + '" font-family="' + SANS + '">ABEC-FX</text>' +
      '<line x1="72" y1="115" x2="128" y2="115" stroke="' + BLACK + '" stroke-width="1.6"/>' +
      '<text x="100" y="130" text-anchor="middle" font-size="11" font-weight="800" letter-spacing="1" fill="' + BLACK + '" font-family="' + SANS + '">' + esc(year || "OFFICIAL") + "</text></g>";
  }

  function build(d, opts) {
    var o = opts || {};
    var org = String(d.org || "").toUpperCase();
    var name = String(d.fullName || "").toUpperCase();
    var s = "";

    // ----- background: the exact shapes of the approved design (measured from it, so they are sharp at any size)
    s += '<rect width="' + W + '" height="' + H + '" fill="#fff"/>';
    s += '<polygon points="0,37 377,37 391,84 0,84" fill="' + PURPLE + '"/>';                                   // purple band, top left
    s += '<polygon points="0,0 428,0 456,84 391,84 377,37 0,37" fill="' + PURE_BLACK + '"/>';                  // black block above it
    s += '<line x1="431.5" y1="0" x2="519" y2="266" stroke="' + PURPLE + '" stroke-width="3"/>';                // thin purple line beside the white stripe
    s += '<polygon points="456.5,0 1280,0 1280,877 1211.7,877 1007.6,266 544.6,266" fill="' + PURPLE + '"/>';  // big purple panel
    s += '<polygon points="0,877 875.5,877 886,909 0,909" fill="' + PURPLE + '"/>';                             // purple strip, bottom left
    s += '<line x1="891.5" y1="877" x2="902" y2="909" stroke="' + PURPLE + '" stroke-width="3"/>';
    s += '<polygon points="908,876.5 1280,876.5 1280,909 918.5,909" fill="' + PURE_BLACK + '"/>';              // black strip, bottom right
    s += '<polygon points="640,233.5 1171.5,233.5 1197,309.5 665.5,309.5" fill="' + PURE_BLACK + '"/>';         // black bar under the title

    // ----- title
    s += '<text x="575" y="181" font-size="128" font-weight="900" fill="#fff" font-family="' + HEAVY + '" textLength="619" lengthAdjust="spacingAndGlyphs">Certificate</text>';
    s += '<text x="700" y="276.5" font-size="31" font-weight="800" fill="#fff" font-family="' + SANS + '" textLength="435" lengthAdjust="spacing">OF COMPLETION</text>';

    // ----- emblem: the bull-horn logo from the design, with the name of the organisation under it
    if (ART.logo) s += '<image x="152" y="164" width="79" height="61" preserveAspectRatio="xMidYMid meet" href="' + ART.logo + '"/>';
    s += '<text x="102.5" y="243.7" font-size="19.5" font-weight="900" fill="' + PURPLE + '" font-family="' + HEAVY + '" textLength="180" lengthAdjust="spacingAndGlyphs">ADEBASS BASE</text>';
    s += '<text x="131" y="262.5" font-size="17.5" font-weight="400" fill="' + PURPLE + '" font-family="' + SERIF + '" textLength="126.5" lengthAdjust="spacingAndGlyphs">EDGE CONSULT</text>';

    // ----- who it is for
    s += '<text x="82" y="396" font-size="27" font-weight="500" fill="' + INK + '" font-family="' + SANS + '">This is to certify that:</text>';
    var ns = fit(name, 800, 60, 900);
    s += '<text x="82" y="474" font-size="' + ns + '" font-weight="800" fill="' + PURPLE + '" font-family="' + SANS + '">' + esc(name) + '</text>';
    s += '<line x1="82" y1="502" x2="990" y2="502" stroke="' + PURPLE + '" stroke-width="1.6" opacity=".7"/>';

    // ----- the wording
    var body = "has successfully completed the Forex Trading Training Program conducted by " + org +
      ", a duly registered entity with the Corporate Affairs Commission (CAC). The participant demonstrated strong commitment, discipline, " +
      "and a solid understanding of key forex trading principles, including market analysis, risk management, and trade execution.";
    // four lines at most: a longer organisation name makes the text a little smaller instead of running into the signature
    var size = 21, lines = wrap(body, 500, size, 910);
    while (lines.length > 4 && size > 16) { size -= 0.5; lines = wrap(body, 500, size, 910); }
    var y = 538, step = size * 1.5;
    lines.forEach(function (ln, i) {
      var last = i === lines.length - 1;
      s += '<text x="82" y="' + y.toFixed(1) + '" font-size="' + size + '" font-weight="500" fill="' + INK + '" font-family="' + SANS + '"' +
        (last ? "" : ' textLength="910" lengthAdjust="spacing"') + ">" + esc(ln) + "</text>";
      y += step;
    });
    if (d.awarded) {
      s += '<text x="82" y="' + (y + 10).toFixed(1) + '" font-size="23" font-weight="800" fill="' + PURPLE + '" font-family="' + SANS + '">Awarded on ' + esc(d.awarded) + "</text>";
    }

    s += seal(d.year);

    // ----- signature
    s += '<line x1="150" y1="792" x2="510" y2="792" stroke="' + INK + '" stroke-width="1.6"/>';
    if (o.signature) {
      s += '<image x="170" y="686" width="320" height="102" preserveAspectRatio="xMidYMax meet" href="data:image/png;base64,' + esc(o.signature) + '"/>';
    }
    var who = (d.signerName || "") + (d.signerTitle ? " (" + d.signerTitle + ")" : "");
    s += '<text x="330" y="822" text-anchor="middle" font-size="' + fit(who, 600, 23, 440) + '" font-weight="600" fill="' + INK + '" font-family="' + SANS + '">' + esc(who) + "</text>";
    s += '<text x="330" y="852" text-anchor="middle" font-size="' + fit(org, 800, 21, 440) + '" font-weight="800" fill="' + PURPLE + '" font-family="' + SANS + '">' + esc(org) + "</text>";

    s += stamp(org, d.year);

    // ----- certificate number (the stamp sits where the QR code used to be)
    s += '<text x="745" y="722" font-size="13" font-weight="700" fill="#6b5a69" font-family="' + SANS + '" letter-spacing="1.6">CERTIFICATE NO.</text>';
    s += '<text x="745" y="750" font-size="' + fit(String(d.certNo || ""), 800, 25, 172) + '" font-weight="800" fill="' + INK + '" font-family="' + SANS + '">' + esc(d.certNo || "") + "</text>";

    // ----- CAC number in the black tag of the design, labelled so people know what it is
    if (d.rc) {
      s += '<polygon points="928,744.5 1183,744.5 1199.5,794 944.5,794" fill="' + PURE_BLACK + '"/>';
      var rcText = "CAC RC: " + d.rc;
      s += '<text x="1064" y="779" text-anchor="middle" font-size="' + fit(rcText, 800, 27, 220) + '" font-weight="800" fill="#fff" font-family="' + SANS + '">' + esc(rcText) + "</text>";
    }

    // ----- public look-up copies cannot be mistaken for the real download
    if (o.viewOnly) {
      s += '<g opacity=".1" fill="' + BLACK + '" font-family="' + SANS + '" font-weight="800" text-anchor="middle" transform="rotate(-18 640 452)">' +
        '<text x="640" y="430" font-size="96">VIEW ONLY</text><text x="640" y="520" font-size="42" font-weight="700" letter-spacing="3">VERIFICATION COPY</text></g>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Certificate of completion for ' + esc(name) + '">' +
      s + "</svg>";
  }

  window.renderCertificate = function (data, opts) {
    var wrap = document.createElement("div");
    wrap.className = "cert-frame";
    var doc = new DOMParser().parseFromString(build(data, opts), "image/svg+xml");
    var svg = document.importNode(doc.documentElement, true);
    svg.removeAttribute("width"); svg.removeAttribute("height");
    svg.setAttribute("class", "cert-svg");
    wrap.appendChild(svg);
    return wrap;
  };

  // ---------- download ----------
  function toCanvas(frame, scale) {
    return new Promise(function (resolve, reject) {
      var svg = frame.querySelector("svg").cloneNode(true);
      svg.setAttribute("width", W * scale); svg.setAttribute("height", H * scale);
      svg.removeAttribute("class");
      var xml = new XMLSerializer().serializeToString(svg);
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = W * scale; c.height = H * scale;
        var g = c.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c);
      };
      img.onerror = function () { reject(new Error("render failed")); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    });
  }
  function save(blob, filename) {
    var a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // A one-page A4 landscape PDF holding the certificate as a high-quality picture.
  function pdfFromJpeg(jpeg, wpx, hpx) {
    var PW = 841.89, PH = 595.28, enc = new TextEncoder(), parts = [], offsets = [], len = 0;
    function add(x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(n, head, stream) {
      offsets[n] = len;
      add(n + " 0 obj\n" + head + "\n");
      if (stream) { add("stream\n"); add(stream); add("\nendstream\n"); }
      add("endobj\n");
    }
    var ih = PW * hpx / wpx, oy = (PH - ih) / 2;   // fit the width, keep the proportions, centre on the page
    var content = "q " + PW + " 0 0 " + ih.toFixed(2) + " 0 " + oy.toFixed(2) + " cm /Im0 Do Q";
    add("%PDF-1.4\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PW + " " + PH + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
    obj(4, "<< /Type /XObject /Subtype /Image /Width " + wpx + " /Height " + hpx + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>", jpeg);
    obj(5, "<< /Length " + content.length + " >>", content);
    var xref = len;
    add("xref\n0 6\n0000000000 65535 f \n");
    for (var i = 1; i <= 5; i++) add(("0000000000" + offsets[i]).slice(-10) + " 00000 n \n");
    add("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
    return new Blob(parts, { type: "application/pdf" });
  }

  window.downloadCertificate = function (frame, certNo, kind) {
    var base = "ABEC-FX-Certificate-" + String(certNo || "").replace(/[^A-Za-z0-9]+/g, "-");
    if (kind === "pdf") {
      return toCanvas(frame, 3).then(function (c) {
        return new Promise(function (resolve, reject) {
          c.toBlob(function (b) {
            if (!b) return reject(new Error("no image"));
            b.arrayBuffer().then(function (buf) {
              save(pdfFromJpeg(new Uint8Array(buf), c.width, c.height), base + ".pdf");
              resolve();
            }, reject);
          }, "image/jpeg", 0.95);
        });
      });
    }
    return toCanvas(frame, 2).then(function (c) {
      return new Promise(function (resolve, reject) {
        c.toBlob(function (b) { if (!b) return reject(new Error("no image")); save(b, base + ".png"); resolve(); }, "image/png");
      });
    });
  };
})();
