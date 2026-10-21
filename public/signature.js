// Signature box: draw with a finger or mouse, or upload a picture of a signature on paper.
// Either way the result is a small transparent PNG (dark ink, no paper background) that fits in a Google Sheet cell.
//   var sig = window.abecSignature.create(containerElement);
//   sig.value()  -> Promise<data URL or "">  (never rejects; shows its own message when it cannot make one)
//   sig.has()    -> true when something has been drawn or a picture chosen
//   sig.clear()
(function () {
  var INK = [27, 18, 48];
  var PAD_W = 720, PAD_H = 240;
  var OUT = [[360, 120], [300, 100], [240, 80]];
  var MAX_CHARS = 40000;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function openImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).then(
        function (bmp) { return { src: bmp, w: bmp.width, h: bmp.height }; },
        function () { return viaReader(file); }
      );
    }
    return viaReader(file);
  }
  function viaReader(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("read")); };
      fr.onload = function () {
        var img = new Image();
        img.onload = function () { resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight }); };
        img.onerror = function () { reject(new Error("decode")); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // Bounding box of the visible ink (alpha above a small threshold), or null when there is none.
  function inkBox(canvas) {
    var w = canvas.width, h = canvas.height;
    var d = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    var x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 40) {
          n++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return n < 80 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // Trim to the ink and fit it into a small transparent PNG.
  function finish(srcCanvas) {
    var box = inkBox(srcCanvas);
    if (!box) return "";
    var pad = 6;
    for (var i = 0; i < OUT.length; i++) {
      var ow = OUT[i][0], oh = OUT[i][1];
      var c = document.createElement("canvas");
      c.width = ow; c.height = oh;
      var scale = Math.min((ow - pad * 2) / box.w, (oh - pad * 2) / box.h);
      var dw = box.w * scale, dh = box.h * scale;
      var ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(srcCanvas, box.x, box.y, box.w, box.h, (ow - dw) / 2, (oh - dh) / 2, dw, dh);
      var url = c.toDataURL("image/png");
      if (url.length <= MAX_CHARS) return url;
    }
    return "";
  }

  // A picture of a signature on paper: keep the dark ink, make the paper see-through.
  function fromPicture(file) {
    if (file.type && !/^image\//.test(file.type)) return Promise.reject(new Error("Choose an image file (JPG or PNG)."));
    if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error("That picture is too large. Choose one under 15 MB."));
    return openImage(file).then(function (im) {
      var scale = Math.min(PAD_W / im.w, PAD_H / im.h, 1);
      var w = Math.max(1, Math.round(im.w * scale)), h = Math.max(1, Math.round(im.h * scale));
      var c = document.createElement("canvas");
      c.width = w; c.height = h;
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(im.src, 0, 0, w, h);
      if (im.src.close) im.src.close();
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        var a = lum >= 200 ? 0 : Math.min(255, (200 - lum) * 2.4);
        d[i] = INK[0]; d[i + 1] = INK[1]; d[i + 2] = INK[2]; d[i + 3] = a;
      }
      ctx.putImageData(img, 0, 0);
      var url = finish(c);
      if (!url) throw new Error("We could not see a signature in that picture. Use dark ink on plain white paper, in good light.");
      return url;
    }, function () {
      throw new Error("We could not read that picture. Use a JPG or PNG. On iPhone, pick it again from your library.");
    });
  }

  function create(root) {
    var mode = "draw";
    var uploaded = "";
    var drawn = false;
    var ctxPad;
    root.replaceChildren();
    root.classList.add("sig");

    var tabs = el("div", "sig-tabs");
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "How to add your signature");
    var bDraw = el("button", "sig-tab", "Draw it");
    var bUp = el("button", "sig-tab", "Upload a picture");
    bDraw.type = bUp.type = "button";
    tabs.appendChild(bDraw); tabs.appendChild(bUp);
    root.appendChild(tabs);

    // ---- draw
    var drawBox = el("div", "sig-box");
    var pad = el("canvas", "sig-pad");
    pad.width = PAD_W; pad.height = PAD_H;
    pad.setAttribute("aria-label", "Signature box. Draw your signature here with your finger or mouse.");
    ctxPad = pad.getContext("2d");
    ctxPad.lineWidth = 6; ctxPad.lineCap = "round"; ctxPad.lineJoin = "round";
    ctxPad.strokeStyle = "rgb(" + INK.join(",") + ")";
    drawBox.appendChild(pad);
    var drawHint = el("span", "sig-placeholder", "Please sign here");
    drawBox.appendChild(drawHint);
    var clearBtn = el("button", "btn ghost sig-clear", "Clear");
    clearBtn.type = "button";
    var drawWrap = el("div", "sig-pane");
    drawWrap.appendChild(drawBox);
    drawWrap.appendChild(clearBtn);
    drawWrap.appendChild(el("p", "sig-hint", "Sign inside the box with your finger or mouse."));
    root.appendChild(drawWrap);

    var drawing = false, last = null;
    function pos(e) {
      var r = pad.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (PAD_W / r.width), y: (e.clientY - r.top) * (PAD_H / r.height) };
    }
    pad.addEventListener("pointerdown", function (e) {
      drawing = true; last = pos(e);
      try { pad.setPointerCapture(e.pointerId); } catch (x) {}
      ctxPad.beginPath(); ctxPad.moveTo(last.x, last.y); ctxPad.lineTo(last.x + 0.01, last.y + 0.01); ctxPad.stroke();
      drawn = true; drawHint.hidden = true; setErr("");
      e.preventDefault();
    });
    pad.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var p = pos(e);
      ctxPad.beginPath(); ctxPad.moveTo(last.x, last.y); ctxPad.lineTo(p.x, p.y); ctxPad.stroke();
      last = p;
      e.preventDefault();
    });
    function stop() { drawing = false; last = null; }
    pad.addEventListener("pointerup", stop);
    pad.addEventListener("pointercancel", stop);
    pad.addEventListener("pointerleave", stop);

    function clearPad() { ctxPad.clearRect(0, 0, PAD_W, PAD_H); drawn = false; drawHint.hidden = false; }
    clearBtn.addEventListener("click", function () { clearPad(); setErr(""); });

    // ---- upload
    var upWrap = el("div", "sig-pane");
    upWrap.hidden = true;
    var file = el("input");
    file.type = "file"; file.accept = "image/*"; file.className = "sr-only"; file.id = "sigfile" + Math.random().toString(36).slice(2, 8);
    var pick = el("label", "btn ghost", "Choose picture");
    pick.setAttribute("for", file.id);
    var prev = el("div", "sig-box sig-preview");
    var prevImg = el("img");
    prevImg.alt = "Your signature";
    prevImg.hidden = true;
    prev.appendChild(prevImg);
    var prevHint = el("span", "sig-line", "Your signature will show here");
    prev.appendChild(prevHint);
    upWrap.appendChild(prev);
    upWrap.appendChild(file);
    upWrap.appendChild(pick);
    upWrap.appendChild(el("p", "sig-hint", "Sign on plain white paper with a dark pen, then take a clear photo of it in good light."));
    root.appendChild(upWrap);

    file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      if (!f) return;
      setErr("");
      fromPicture(f).then(function (url) {
        uploaded = url;
        prevImg.src = url; prevImg.hidden = false; prevHint.hidden = true;
        pick.textContent = "Choose a different picture";
      }, function (e) {
        uploaded = "";
        prevImg.hidden = true; prevHint.hidden = false;
        setErr(e.message);
      }).then(function () { file.value = ""; });
    });

    var err = el("p", "sig-err");
    err.setAttribute("role", "alert");
    root.appendChild(err);
    function setErr(m) { err.textContent = m || ""; }

    function setMode(m) {
      mode = m;
      drawWrap.hidden = m !== "draw";
      upWrap.hidden = m !== "upload";
      bDraw.setAttribute("aria-pressed", String(m === "draw"));
      bUp.setAttribute("aria-pressed", String(m === "upload"));
      setErr("");
    }
    bDraw.addEventListener("click", function () { setMode("draw"); });
    bUp.addEventListener("click", function () { setMode("upload"); });
    setMode("draw");

    return {
      has: function () { return mode === "draw" ? drawn : !!uploaded; },
      clear: function () { clearPad(); uploaded = ""; prevImg.hidden = true; prevHint.hidden = false; setErr(""); },
      setError: setErr,
      value: function () {
        if (mode === "upload") {
          if (!uploaded) { setErr("Choose a picture of your signature first."); return Promise.resolve(""); }
          return Promise.resolve(uploaded);
        }
        if (!drawn) { setErr("Please sign in the box first."); return Promise.resolve(""); }
        var url = finish(pad);
        if (!url) setErr("We could not read that signature. Clear the box and sign again.");
        return Promise.resolve(url);
      },
    };
  }

  window.abecSignature = { create: create };
})();
