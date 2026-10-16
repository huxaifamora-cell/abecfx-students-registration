(function () {
  var form = document.getElementById("regForm");
  var btn = document.getElementById("submitBtn");
  var formErr = document.getElementById("formErr");
  var countrySel = document.getElementById("country");

  document.getElementById("year").textContent = new Date().getFullYear();

  // A student who registered on this device is taken back to their portal, not the form.
  var KEY = "abecfx_reg";
  try {
    var saved = localStorage.getItem(KEY);
    if (saved) {
      document.getElementById("returningReg").textContent = saved;
      document.getElementById("returning").hidden = false;
    }
  } catch (e) {}

  fetch("/api/countries")
    .then(function (r) { return r.json(); })
    .then(function (list) {
      list.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        countrySel.appendChild(o);
      });
    })
    .catch(function () {
      formErr.textContent = "Could not load the country list. Refresh the page to try again.";
    });


  // ---- State / region: appears once a country is chosen. A dropdown when we have a list, else a text box ----
  var stateField = document.getElementById("stateField");
  var stateSel = document.getElementById("state");
  var stateText = document.getElementById("stateText");
  var stateLabel = document.getElementById("stateLabel");
  var STATE_WORD = {
    "Nigeria": "State", "United States": "State", "India": "State", "Brazil": "State", "Australia": "State",
    "Mexico": "State", "Malaysia": "State", "Germany": "State", "Austria": "State", "Venezuela": "State",
    "Canada": "Province", "South Africa": "Province", "Argentina": "Province", "China": "Province",
    "Ghana": "Region", "Cameroon": "Region", "Tanzania": "Region", "Senegal": "Region", "Namibia": "Region"
  };
  var stateReq = 0;

  function useStateControl(sel) {
    stateSel.hidden = !sel;
    stateText.hidden = !!sel;
    stateLabel.setAttribute("for", sel ? "state" : "stateText");
  }

  countrySel.addEventListener("change", function () {
    var country = countrySel.value;
    var mine = ++stateReq;
    stateSel.replaceChildren();
    stateText.value = "";
    if (!country) { stateField.hidden = true; return; }
    var word = STATE_WORD[country] || "State / Region";
    stateLabel.textContent = word;
    stateText.placeholder = word === "State / Region" ? "State, province or region" : word;
    stateField.hidden = false;
    useStateControl(false); // text box until the list arrives
    fetch("/api/states?country=" + encodeURIComponent(country))
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (mine !== stateReq || !list.length) return;
        var first = document.createElement("option");
        first.value = ""; first.textContent = "Select your " + word.toLowerCase();
        stateSel.appendChild(first);
        list.forEach(function (s) {
          var o = document.createElement("option");
          o.value = s; o.textContent = s;
          stateSel.appendChild(o);
        });
        useStateControl(true);
      })
      .catch(function () {});
  });

  // ---- Passport photo: crop to 4:5, shrink to 320x400 JPEG so it fits in a Google Sheet cell ----
  var photoInput = document.getElementById("photo");
  var photoPick = document.getElementById("photoPick");
  var photoPreview = document.getElementById("photoPreview");
  var photoIcon = document.getElementById("photoIcon");
  var photoBtn = document.getElementById("photoBtn");
  var regNumberText = "";
  var photoB64 = "";
  var photoDataUrl = "";

  function setPhotoError(msg) {
    var span = form.querySelector('.err[data-for="photo"]');
    span.textContent = msg || "";
    span.closest(".field").classList.toggle("invalid", !!msg);
  }

  // Open the picked file as something we can draw. createImageBitmap needs no blob: address (the site's
  // security policy blocks those); the FileReader fallback uses a data: address, which is allowed.
  function openImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).then(
        function (bmp) { return { src: bmp, w: bmp.width, h: bmp.height }; },
        function () { return openViaReader(file); }
      );
    }
    return openViaReader(file);
  }
  function openViaReader(file) {
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

  function processPhoto(file) {
    if (file.type && !/^image\//.test(file.type)) return Promise.reject(new Error("Choose an image file (JPG or PNG)."));
    if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error("That photo is too large. Choose one under 15 MB."));
    return openImage(file).then(
      function (im) {
        var sw = im.w, sh = im.h;
        if (sw < 200 || sh < 250) throw new Error("That photo is too small. Choose a larger, clearer one.");
        // largest 4:5 area, biased toward the top so heads are not cut off
        var cw = sw, ch = sw * 1.25;
        if (ch > sh) { ch = sh; cw = sh * 0.8; }
        var sx = (sw - cw) / 2, sy = (sh - ch) * 0.25;
        var sizes = [[320, 400], [256, 320], [200, 250]];
        for (var i = 0; i < sizes.length; i++) {
          var c = document.createElement("canvas");
          c.width = sizes[i][0]; c.height = sizes[i][1];
          var ctx = c.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(im.src, sx, sy, cw, ch, 0, 0, c.width, c.height);
          for (var q = 0.86; q >= 0.4; q -= 0.06) {
            var data = c.toDataURL("image/jpeg", q);
            if (data.length <= 42000) { if (im.src.close) im.src.close(); return data; }
          }
        }
        if (im.src.close) im.src.close();
        throw new Error("We could not shrink that photo. Try a different one.");
      },
      function () {
        throw new Error("We could not read that photo. Use a JPG or PNG. On iPhone, pick the photo again from your library or take a new one.");
      }
    );
  }

  photoInput.addEventListener("change", function () {
    var file = photoInput.files && photoInput.files[0];
    if (!file) return;
    setPhotoError("");
    processPhoto(file)
      .then(function (dataUrl) {
        photoDataUrl = dataUrl;
        photoB64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        photoPreview.src = dataUrl;
        photoPreview.hidden = false;
        photoIcon.style.display = "none";
        photoPick.classList.add("has-photo");
        photoBtn.textContent = "Change photo";
      })
      .catch(function (e) {
        photoB64 = ""; photoDataUrl = "";
        photoPreview.hidden = true;
        photoIcon.style.display = "";
        photoPick.classList.remove("has-photo");
        photoBtn.textContent = "Choose photo";
        photoInput.value = "";
        setPhotoError(e.message);
      });
  });

  function clearErrors() {
    formErr.textContent = "";
    form.querySelectorAll(".err").forEach(function (e) { e.textContent = ""; });
    form.querySelectorAll(".field").forEach(function (f) { f.classList.remove("invalid"); });
  }

  function showErrors(errors) {
    Object.keys(errors).forEach(function (key) {
      var span = form.querySelector('.err[data-for="' + key + '"]');
      if (span) {
        span.textContent = errors[key];
        span.closest(".field").classList.add("invalid");
      }
    });
    var first = form.querySelector(".field.invalid input, .field.invalid select");
    if (first) first.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();

    var data = {};
    new FormData(form).forEach(function (v, k) { if (k !== "photo") data[k] = v; });
    data.state = stateField.hidden ? "" : (stateSel.hidden ? stateText.value : stateSel.value);
    data.photo = photoB64; // the server reports a missing photo together with any other errors

    btn.disabled = true;
    btn.textContent = "Registering...";

    fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
      })
      .then(function (res) {
        if (res.ok) {
          var first = (res.body.fullName || "").split(" ")[0];
          document.getElementById("welcome").textContent = first
            ? "You're registered, " + first
            : "You're registered";
          document.getElementById("cardMount").replaceChildren(
            window.renderStudentCard(res.body.card, { photoSrc: photoDataUrl })
          );
          regNumberText = res.body.regNumber;
          try { localStorage.setItem(KEY, res.body.regNumber); if (res.body.token) localStorage.setItem("abecfx_token", res.body.token); } catch (e) {}
          document.getElementById("returning").hidden = true;
          document.getElementById("formCard").hidden = true;
          document.getElementById("successCard").hidden = false;
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (res.body.errors) {
          showErrors(res.body.errors);
        } else {
          formErr.textContent = res.body.error || "Something went wrong. Please try again.";
        }
      })
      .catch(function () {
        formErr.textContent = "Network problem. Check your connection and try again.";
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Register";
      });
  });

  document.getElementById("printBtn").addEventListener("click", function () { window.print(); });

  document.getElementById("copyBtn").addEventListener("click", function () {
    var text = regNumberText;
    var b = this;
    function done() {
      b.textContent = "Copied";
      setTimeout(function () { b.textContent = "Copy number"; }, 1800);
    }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
    else done();
  });
})();
