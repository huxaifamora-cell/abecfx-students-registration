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

  var W = 1280, H = 905;
  var PURPLE = "#8c1d80", DEEP = "#6d1463", INK = "#1d1424", BLACK = "#0d0a10";
  var SANS = "'Montserrat','Segoe UI',Arial,Helvetica,sans-serif";
  var HEAVY = "'Arial Black','Segoe UI Black','Montserrat',Arial,Helvetica,sans-serif";
  var LOGO = "M133.50 24.75C130.88 25.96 124.46 29.12 120.25 31.50C116.04 33.88 110.75 37.58 108.25 39.00C105.75 40.42 106.08 39.50 105.25 40.00C104.42 40.50 105.00 40.88 103.25 42.00C101.50 43.12 98.92 44.17 94.75 46.75C90.58 49.33 84.25 53.17 78.25 57.50C72.25 61.83 64.50 67.88 58.75 72.75C53.00 77.62 47.92 82.42 43.75 86.75C39.58 91.08 36.33 95.12 33.75 98.75C31.17 102.38 29.67 105.71 28.25 108.50C26.83 111.29 26.04 112.88 25.25 115.50C24.46 118.12 23.75 121.00 23.50 124.25C23.25 127.50 23.29 131.79 23.75 135.00C24.21 138.21 25.12 140.83 26.25 143.50C27.38 146.17 28.54 148.21 30.50 151.00C32.46 153.79 35.58 157.67 38.00 160.25C40.42 162.83 42.12 164.25 45.00 166.50C47.88 168.75 51.25 171.25 55.25 173.75C59.25 176.25 64.33 179.08 69.00 181.50C73.67 183.92 80.33 187.00 83.25 188.25C86.17 189.50 85.00 188.38 86.50 189.00C88.00 189.62 90.75 191.38 92.25 192.00C93.75 192.62 93.79 192.08 95.50 192.75C97.21 193.42 97.67 194.25 102.50 196.00C107.33 197.75 119.88 201.88 124.50 203.25C129.12 204.62 128.62 203.79 130.25 204.25C131.88 204.71 133.04 205.67 134.25 206.00C135.46 206.33 134.42 205.50 137.50 206.25C140.58 207.00 149.25 209.67 152.75 210.50C156.25 211.33 155.25 210.58 158.50 211.25C161.75 211.92 169.00 213.88 172.25 214.50C175.50 215.12 175.75 214.58 178.00 215.00C180.25 215.42 181.83 216.25 185.75 217.00C189.67 217.75 197.67 219.00 201.50 219.50C205.33 220.00 206.62 219.67 208.75 220.00C210.88 220.33 212.08 221.17 214.25 221.50C216.42 221.83 218.17 221.50 221.75 222.00C225.33 222.50 230.92 223.79 235.75 224.50C240.58 225.21 247.08 225.67 250.75 226.25C254.42 226.83 254.50 227.46 257.75 228.00C261.00 228.54 265.79 228.71 270.25 229.50C274.71 230.29 280.96 232.08 284.50 232.75C288.04 233.42 287.54 232.67 291.50 233.50C295.46 234.33 304.75 236.96 308.25 237.75C311.75 238.54 311.08 237.88 312.50 238.25C313.92 238.62 314.42 239.33 316.75 240.00C319.08 240.67 323.50 241.17 326.50 242.25C329.50 243.33 332.58 245.21 334.75 246.50C336.92 247.79 337.96 248.62 339.50 250.00C341.04 251.38 342.71 252.92 344.00 254.75C345.29 256.58 346.58 259.38 347.25 261.00C347.92 262.62 347.92 263.25 348.00 264.50C348.08 265.75 348.08 267.21 347.75 268.50C347.42 269.79 346.75 271.17 346.00 272.25C345.25 273.33 344.79 274.21 343.25 275.00C341.71 275.79 338.79 276.67 336.75 277.00C334.71 277.33 333.67 277.33 331.00 277.00C328.33 276.67 324.62 276.21 320.75 275.00C316.88 273.79 312.54 271.42 307.75 269.75C302.96 268.08 295.62 265.96 292.00 265.00C288.38 264.04 288.92 264.75 286.00 264.00C283.08 263.25 277.54 261.25 274.50 260.50C271.46 259.75 273.12 260.75 267.75 259.50C262.38 258.25 249.46 254.67 242.25 253.00C235.04 251.33 227.83 250.25 224.50 249.50C221.17 248.75 223.88 248.83 222.25 248.50C220.62 248.17 216.71 247.92 214.75 247.50C212.79 247.08 213.25 246.58 210.50 246.00C207.75 245.42 201.54 244.71 198.25 244.00C194.96 243.29 194.29 242.50 190.75 241.75C187.21 241.00 180.33 240.21 177.00 239.50C173.67 238.79 173.46 238.17 170.75 237.50C168.04 236.83 163.00 235.71 160.75 235.50C158.50 235.29 158.04 235.83 157.25 236.25C156.46 236.67 156.33 236.08 156.00 238.00C155.67 239.92 155.12 244.79 155.25 247.75C155.38 250.71 156.21 253.54 156.75 255.75C157.29 257.96 157.62 259.00 158.50 261.00C159.38 263.00 160.88 265.88 162.00 267.75C163.12 269.62 163.58 270.42 165.25 272.25C166.92 274.08 168.96 276.33 172.00 278.75C175.04 281.17 181.00 285.25 183.50 286.75C186.00 288.25 185.96 287.25 187.00 287.75C188.04 288.25 187.88 288.83 189.75 289.75C191.62 290.67 193.71 291.58 198.25 293.25C202.79 294.92 208.42 297.42 217.00 299.75C225.58 302.08 241.54 305.54 249.75 307.25C257.96 308.96 260.08 308.71 266.25 310.00C272.42 311.29 282.25 313.75 286.75 315.00C291.25 316.25 291.29 316.42 293.25 317.50C295.21 318.58 297.38 320.33 298.50 321.50C299.62 322.67 299.88 323.50 300.00 324.50C300.12 325.50 299.79 326.42 299.25 327.50C298.71 328.58 298.08 329.67 296.75 331.00C295.42 332.33 293.75 334.29 291.25 335.50C288.75 336.71 285.38 337.79 281.75 338.25C278.12 338.71 273.67 338.54 269.50 338.25C265.33 337.96 259.88 337.08 256.75 336.50C253.62 335.92 252.54 335.12 250.75 334.75C248.96 334.38 249.46 335.08 246.00 334.25C242.54 333.42 237.17 332.17 230.00 329.75C222.83 327.33 210.67 322.92 203.00 319.75C195.33 316.58 187.79 312.67 184.00 310.75C180.21 308.83 181.17 308.71 180.25 308.25C179.33 307.79 178.92 307.92 178.50 308.00C178.08 308.08 177.88 308.29 177.75 308.75C177.62 309.21 177.21 309.21 177.75 310.75C178.29 312.29 179.54 315.21 181.00 318.00C182.46 320.79 184.46 324.54 186.50 327.50C188.54 330.46 191.08 333.38 193.25 335.75C195.42 338.12 196.50 339.29 199.50 341.75C202.50 344.21 208.92 348.92 211.25 350.50C213.58 352.08 212.88 350.88 213.50 351.25C214.12 351.62 214.21 350.62 215.00 352.75C215.79 354.88 217.08 360.75 218.25 364.00C219.42 367.25 220.33 369.38 222.00 372.25C223.67 375.12 225.67 378.29 228.25 381.25C230.83 384.21 234.96 387.88 237.50 390.00C240.04 392.12 241.38 392.75 243.50 394.00C245.62 395.25 246.71 396.29 250.25 397.50C253.79 398.71 260.12 400.58 264.75 401.25C269.38 401.92 273.54 402.00 278.00 401.50C282.46 401.00 287.54 399.62 291.50 398.25C295.46 396.88 298.67 395.08 301.75 393.25C304.83 391.42 307.83 389.08 310.00 387.25C312.17 385.42 312.88 384.58 314.75 382.25C316.62 379.92 319.46 376.17 321.25 373.25C323.04 370.33 324.25 368.17 325.50 364.75C326.75 361.33 326.04 356.46 328.75 352.75C331.46 349.04 338.92 344.92 341.75 342.50C344.58 340.08 344.58 339.25 345.75 338.25C346.92 337.25 346.83 338.21 348.75 336.50C350.67 334.79 355.12 330.25 357.25 328.00C359.38 325.75 359.08 326.46 361.50 323.00C363.92 319.54 369.08 312.12 371.75 307.25C374.42 302.38 376.17 297.88 377.50 293.75C378.83 289.62 378.71 286.42 379.75 282.50C380.79 278.58 382.62 274.42 383.75 270.25C384.88 266.08 386.00 261.42 386.50 257.50C387.00 253.58 386.79 249.62 386.75 246.75C386.71 243.88 387.04 243.54 386.25 240.25C385.46 236.96 383.12 230.00 382.00 227.00C380.88 224.00 380.71 224.08 379.50 222.25C378.29 220.42 376.33 217.83 374.75 216.00C373.17 214.17 372.21 213.17 370.00 211.25C367.79 209.33 363.88 206.25 361.50 204.50C359.12 202.75 358.00 202.00 355.75 200.75C353.50 199.50 349.75 197.75 348.00 197.00C346.25 196.25 346.79 196.92 345.25 196.25C343.71 195.58 340.96 193.83 338.75 193.00C336.54 192.17 334.17 192.00 332.00 191.25C329.83 190.50 327.58 189.08 325.75 188.50C323.92 187.92 323.96 188.50 321.00 187.75C318.04 187.00 311.08 184.75 308.00 184.00C304.92 183.25 304.00 183.62 302.50 183.25C301.00 182.88 300.38 182.08 299.00 181.75C297.62 181.42 297.92 181.96 294.25 181.25C290.58 180.54 281.12 178.25 277.00 177.50C272.88 176.75 272.29 177.21 269.50 176.75C266.71 176.29 266.83 175.83 260.25 174.75C253.67 173.67 239.38 171.46 230.00 170.25C220.62 169.04 210.21 168.29 204.00 167.50C197.79 166.71 196.00 165.92 192.75 165.50C189.50 165.08 186.71 165.33 184.50 165.00C182.29 164.67 183.42 164.12 179.50 163.50C175.58 162.88 165.12 161.96 161.00 161.25C156.88 160.54 156.54 159.67 154.75 159.25C152.96 158.83 153.88 159.58 150.25 158.75C146.62 157.92 138.25 155.88 133.00 154.25C127.75 152.62 123.33 151.00 118.75 149.00C114.17 147.00 109.29 144.46 105.50 142.25C101.71 140.04 97.88 137.17 96.00 135.75C94.12 134.33 94.79 134.17 94.25 133.75C93.71 133.33 93.79 134.29 92.75 133.25C91.71 132.21 89.58 129.92 88.00 127.50C86.42 125.08 84.25 120.92 83.25 118.75C82.25 116.58 82.29 116.92 82.00 114.50C81.71 112.08 81.17 107.79 81.50 104.25C81.83 100.71 82.96 96.67 84.00 93.25C85.04 89.83 86.83 85.67 87.75 83.75C88.67 81.83 89.04 82.58 89.50 81.75C89.96 80.92 88.92 81.29 90.50 78.75C92.08 76.21 96.25 70.25 99.00 66.50C101.75 62.75 104.58 59.00 107.00 56.25C109.42 53.50 111.17 52.50 113.50 50.00C115.83 47.50 119.12 43.25 121.00 41.25C122.88 39.25 122.17 40.67 124.75 38.00C127.33 35.33 134.62 27.54 136.50 25.25C138.38 22.96 136.50 24.33 136.00 24.25C135.50 24.17 136.12 23.54 133.50 24.75ZM409.00 24.00C406.33 22.79 407.38 23.83 407.00 24.00C406.62 24.17 403.88 21.83 406.75 25.00C409.62 28.17 418.50 36.75 424.25 43.00C430.00 49.25 438.21 58.83 441.25 62.50C444.29 66.17 441.88 64.21 442.50 65.00C443.12 65.79 442.88 64.21 445.00 67.25C447.12 70.29 452.71 78.67 455.25 83.25C457.79 87.83 458.92 90.92 460.25 94.75C461.58 98.58 462.71 102.96 463.25 106.25C463.79 109.54 463.88 111.50 463.50 114.50C463.12 117.50 462.08 121.46 461.00 124.25C459.92 127.04 458.50 129.25 457.00 131.25C455.50 133.25 454.25 134.42 452.00 136.25C449.75 138.08 446.62 140.42 443.50 142.25C440.38 144.08 435.71 146.25 433.25 147.25C430.79 148.25 429.96 147.83 428.75 148.25C427.54 148.67 426.96 149.46 426.00 149.75C425.04 150.04 424.12 149.71 423.00 150.00C421.88 150.29 420.92 151.08 419.25 151.50C417.58 151.92 414.79 152.08 413.00 152.50C411.21 152.92 411.25 153.46 408.50 154.00C405.75 154.54 400.88 154.96 396.50 155.75C392.12 156.54 390.08 157.42 382.25 158.75C374.42 160.08 356.21 162.58 349.50 163.75C342.79 164.92 343.46 165.25 342.00 165.75C340.54 166.25 340.75 166.42 340.75 166.75C340.75 167.08 340.33 167.12 342.00 167.75C343.67 168.38 348.83 169.75 350.75 170.50C352.67 171.25 351.79 171.50 353.50 172.25C355.21 173.00 358.67 173.92 361.00 175.00C363.33 176.08 366.00 178.00 367.50 178.75C369.00 179.50 367.25 178.00 370.00 179.50C372.75 181.00 379.88 184.88 384.00 187.75C388.12 190.62 391.71 193.79 394.75 196.75C397.79 199.71 400.42 203.54 402.25 205.50C404.08 207.46 404.88 208.00 405.75 208.50C406.62 209.00 406.04 208.92 407.50 208.50C408.96 208.08 411.88 207.08 414.50 206.00C417.12 204.92 417.92 204.00 423.25 202.00C428.58 200.00 442.21 195.58 446.50 194.00C450.79 192.42 447.50 193.12 449.00 192.50C450.50 191.88 453.96 190.92 455.50 190.25C457.04 189.58 457.21 188.92 458.25 188.50C459.29 188.08 456.96 190.04 461.75 187.75C466.54 185.46 480.83 178.29 487.00 174.75C493.17 171.21 495.75 168.75 498.75 166.50C501.75 164.25 503.75 162.50 505.00 161.25C506.25 160.00 505.00 160.50 506.25 159.00C507.50 157.50 510.54 155.00 512.50 152.25C514.46 149.50 516.79 145.04 518.00 142.50C519.21 139.96 519.38 138.71 519.75 137.00C520.12 135.29 520.21 134.71 520.25 132.25C520.29 129.79 520.21 124.75 520.00 122.25C519.79 119.75 519.46 118.96 519.00 117.25C518.54 115.54 518.50 114.71 517.25 112.00C516.00 109.29 514.29 105.12 511.50 101.00C508.71 96.88 504.33 91.50 500.50 87.25C496.67 83.00 495.17 81.04 488.50 75.50C481.83 69.96 467.04 58.71 460.50 54.00C453.96 49.29 451.50 48.71 449.25 47.25C447.00 45.79 451.04 47.62 447.00 45.25C442.96 42.88 429.00 35.33 425.00 33.00C421.00 30.67 425.67 32.75 423.00 31.25C420.33 29.75 411.67 25.21 409.00 24.00Z";

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

  function seal(year) {
    var cx = 1115, cy = 545, pts = [], n = 32;
    for (var i = 0; i < n * 2; i++) {
      var a = Math.PI * i / n, r = i % 2 ? 80 : 90;
      pts.push((cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1));
    }
    // ribbon tails
    var out = '<g>' +
      '<polygon points="1068,598 1112,598 1100,696 1078,672 1052,690" fill="' + PURPLE + '"/>' +
      '<polygon points="1118,598 1162,598 1178,690 1152,672 1130,696" fill="#c9a03a"/>' +
      '<polygon points="1068,598 1090,598 1086,640 1060,640" fill="' + DEEP + '" opacity=".35"/>' +
      '<polygon points="' + pts.join(" ") + '" fill="url(#gold)"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="72" fill="none" stroke="#fff6cf" stroke-width="2.5" opacity=".9"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="64" fill="url(#goldIn)" stroke="#b9892a" stroke-width="1.5"/>';
    // laurel branches: two curved rows of leaves round the lower half of the badge, open at the top
    [-1, 1].forEach(function (side) {
      for (var k = 0; k < 8; k++) {
        var deg = 14 + k * 11.5;                       // degrees away from straight down
        var a = (90 + side * deg) * Math.PI / 180;
        var lx = cx + 55 * Math.cos(a), ly = cy + 55 * Math.sin(a);
        var rot = (a * 180 / Math.PI) + (side > 0 ? 8 : -8);
        out += '<ellipse cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" rx="3.8" ry="9.5" fill="' + PURPLE + '" transform="rotate(' + rot.toFixed(1) + " " + lx.toFixed(1) + " " + ly.toFixed(1) + ')"/>';
      }
    });
    var y = String(year || "");
    out += '<text x="' + cx + '" y="' + (cy - 30) + '" text-anchor="middle" font-size="12" fill="' + PURPLE + '" font-family="' + SANS + '">\u2605 \u2605 \u2605</text>';
    if (/^\d{4}$/.test(y)) {
      out += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" font-size="31" font-weight="800" fill="' + PURPLE + '" font-family="' + SANS + '">' + y.slice(0, 2) + '</text>' +
        '<text x="' + cx + '" y="' + (cy + 31) + '" text-anchor="middle" font-size="31" font-weight="800" fill="' + PURPLE + '" font-family="' + SANS + '">' + y.slice(2) + '</text>';
    }
    return out + "</g>";
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
    return '<g transform="translate(698 750) rotate(-11) scale(.68) translate(-100 -100)" opacity=".9">' +
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

    // ----- background shapes
    s += '<rect width="' + W + '" height="' + H + '" fill="#fff"/>';
    s += '<polygon points="0,38 376,38 392,84 0,84" fill="' + PURPLE + '"/>';
    s += '<polygon points="372,0 458,0 474,84 390,84" fill="' + BLACK + '"/>';
    s += '<polygon points="462,0 1280,0 1280,877 1210,877 1030,265 545,265" fill="' + PURPLE + '"/>';
    s += '<line x1="438" y1="0" x2="522" y2="268" stroke="' + PURPLE + '" stroke-width="5"/>';
    s += '<rect x="0" y="877" width="880" height="28" fill="' + PURPLE + '"/>';
    s += '<polygon points="912,877 1280,877 1280,905 898,905" fill="' + BLACK + '"/>';

    // ----- title: "Certificate" and "OF COMPLETION" share one left edge, so they read as a single title
    s += '<text x="602" y="186" font-size="118" font-weight="900" fill="#fff" font-family="' + HEAVY + '" textLength="592" lengthAdjust="spacingAndGlyphs">Certificate</text>';
    s += '<polygon points="602,214 1168,214 1196,286 630,286" fill="' + BLACK + '"/>';
    s += '<text x="913" y="262" text-anchor="middle" font-size="35" font-weight="800" fill="#fff" font-family="' + SANS + '" textLength="500" lengthAdjust="spacing" letter-spacing="6">OF COMPLETION</text>';

    // ----- logo (vector) and the name of the organisation under it
    s += '<g transform="translate(120 118) scale(0.26)"><path d="' + LOGO + '" fill="' + PURPLE + '" fill-rule="evenodd"/></g>';
    s += '<text x="190" y="256" text-anchor="middle" font-size="25" font-weight="800" fill="' + PURPLE + '" font-family="' + SANS + '" textLength="176" lengthAdjust="spacingAndGlyphs">ADEBASS BASE</text>';
    s += '<text x="190" y="280" text-anchor="middle" font-size="17" font-weight="500" fill="' + PURPLE + '" font-family="' + SANS + '" textLength="132" lengthAdjust="spacing" letter-spacing="1.5">EDGE CONSULT</text>';

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
    s += '<text x="778" y="722" font-size="13" font-weight="700" fill="#6b5a69" font-family="' + SANS + '" letter-spacing="1.6">CERTIFICATE NO.</text>';
    s += '<text x="778" y="752" font-size="' + fit(String(d.certNo || ""), 800, 25, 200) + '" font-weight="800" fill="' + INK + '" font-family="' + SANS + '">' + esc(d.certNo || "") + "</text>";

    // ----- CAC number, labelled so people know what it is
    if (d.rc) {
      s += '<polygon points="936,824 1210,824 1198,868 924,868" fill="' + BLACK + '"/>';
      s += '<text x="1067" y="855" text-anchor="middle" font-size="27" font-weight="800" fill="#fff" font-family="' + SANS + '">CAC RC: ' + esc(d.rc) + "</text>";
    }

    // ----- public look-up copies cannot be mistaken for the real download
    if (o.viewOnly) {
      s += '<g opacity=".1" fill="' + BLACK + '" font-family="' + SANS + '" font-weight="800" text-anchor="middle" transform="rotate(-18 640 452)">' +
        '<text x="640" y="430" font-size="96">VIEW ONLY</text><text x="640" y="520" font-size="42" font-weight="700" letter-spacing="3">VERIFICATION COPY</text></g>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Certificate of completion for ' + esc(name) + '">' +
      "<defs>" +
      '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7dd8a"/><stop offset=".5" stop-color="#d9a93f"/><stop offset="1" stop-color="#a97a1c"/></linearGradient>' +
      '<radialGradient id="goldIn" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fff0b3"/><stop offset=".6" stop-color="#e8bf5a"/><stop offset="1" stop-color="#c9992f"/></radialGradient>' +
      "</defs>" + s + "</svg>";
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
    var content = "q " + PW + " 0 0 " + PH + " 0 0 cm /Im0 Do Q";
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
