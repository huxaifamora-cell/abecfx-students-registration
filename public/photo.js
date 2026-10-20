// Shrinks a picked image to a 4:5, 320x400 JPEG (about 20-35 KB) so it fits in a Google Sheet cell.
// Used by the portal's "Change photo". window.abecPhoto.process(file) -> Promise<data URL>.
(function () {
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

  window.abecPhoto = { process: processPhoto };
})();
