/*
 * Minimal QR Code generator (byte mode, error correction level M, versions 1-10).
 * Written for the ABEC-FX ID card so the site needs no outside QR service.
 * Exposes: QR.encode(text) -> { size, modules[y][x] }  and  QR.toSvg(text, { border })
 */
(function () {
  "use strict";

  var EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]; // level M
  var NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];             // level M
  var MAX_VERSION = 10;

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver) {
    return Math.floor(rawModules(ver) / 8) - EC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
  }

  // ---- Reed-Solomon over GF(256), polynomial 0x11D ----
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var result = [], i, j;
    for (i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 2);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= gfMul(coef, factor); });
    });
    return result;
  }

  function addEccAndInterleave(data, ver) {
    var numBlocks = NUM_BLOCKS[ver];
    var eccLen = EC_PER_BLOCK[ver];
    var raw = Math.floor(rawModules(ver) / 8);
    var numShort = numBlocks - (raw % numBlocks);
    var shortLen = Math.floor(raw / numBlocks);
    var blocks = [];
    var div = rsDivisor(eccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (var c = 0; c < blocks[0].length; c++) {
      blocks.forEach(function (block, j) {
        if (c !== shortLen - eccLen || j >= numShort) result.push(block[c]);
      });
    }
    return result;
  }

  function utf8Bytes(str) {
    var s = unescape(encodeURIComponent(str)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }
  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function encode(text) {
    var bytes = utf8Bytes(text);
    var ver, capBits;
    for (ver = 1; ver <= MAX_VERSION; ver++) {
      capBits = dataCodewords(ver) * 8;
      var ccBits = ver < 10 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= capBits) break;
    }
    if (ver > MAX_VERSION) throw new Error("QR text too long");

    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4);
    push(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) { push(b, 8); });
    push(0, Math.min(4, capBits - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (var pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) push(pad, 8);

    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }
    var all = addEccAndInterleave(data, ver);

    var size = ver * 4 + 17;
    var modules = [], isFn = [];
    for (var y = 0; y < size; y++) {
      modules.push(new Array(size).fill(false));
      isFn.push(new Array(size).fill(false));
    }
    function setFn(x, y, dark) { modules[y][x] = dark; isFn[y][x] = true; }

    function drawFinder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          var xx = cx + dx, yy = cy + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
    function drawAlign(cx, cy) {
      for (var dy = -2; dy <= 2; dy++)
        for (var dx = -2; dx <= 2; dx++)
          setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    function alignPositions() {
      if (ver === 1) return [];
      var n = Math.floor(ver / 7) + 2;
      var step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
      var res = [6];
      for (var pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
      return res;
    }
    function drawFormat(mask) {
      var d = (0 << 3) | mask; // level M = 00
      var rem = d, i;
      for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((d << 10) | rem) ^ 0x5412;
      for (i = 0; i <= 5; i++) setFn(8, i, getBit(b, i));
      setFn(8, 7, getBit(b, 6));
      setFn(8, 8, getBit(b, 7));
      setFn(7, 8, getBit(b, 8));
      for (i = 9; i < 15; i++) setFn(14 - i, 8, getBit(b, i));
      for (i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(b, i));
      for (i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(b, i));
      setFn(8, size - 8, true);
    }
    function drawVersion() {
      if (ver < 7) return;
      var rem = ver, i;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      var b = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = getBit(b, i), a = size - 11 + (i % 3), c = Math.floor(i / 3);
        setFn(a, c, bit);
        setFn(c, a, bit);
      }
    }

    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);
    var ap = alignPositions(), last = ap.length - 1;
    for (i = 0; i < ap.length; i++) {
      for (j = 0; j < ap.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
        drawAlign(ap[i], ap[j]);
      }
    }
    var j;
    drawFormat(0);
    drawVersion();

    // place codewords in the zig-zag order
    var n = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var yy = upward ? size - 1 - vert : vert;
          if (!isFn[yy][x] && n < all.length * 8) {
            modules[yy][x] = getBit(all[n >>> 3], 7 - (n & 7));
            n++;
          }
        }
      }
    }

    function applyMask(mask) {
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          var inv;
          switch (mask) {
            case 0: inv = (x + y) % 2 === 0; break;
            case 1: inv = y % 2 === 0; break;
            case 2: inv = x % 3 === 0; break;
            case 3: inv = (x + y) % 3 === 0; break;
            case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
            case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
            default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
          }
          if (!isFn[y][x] && inv) modules[y][x] = !modules[y][x];
        }
      }
    }

    function penalty() {
      var score = 0, x, y, run, k, line;
      var dark = 0;
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (modules[y][x]) dark++;
      function runs(get) {
        for (var a = 0; a < size; a++) {
          run = 1;
          for (var b = 1; b <= size; b++) {
            if (b < size && get(a, b) === get(a, b - 1)) run++;
            else { if (run >= 5) score += 3 + (run - 5); run = 1; }
          }
        }
      }
      runs(function (a, b) { return modules[a][b]; });
      runs(function (a, b) { return modules[b][a]; });
      for (y = 0; y < size - 1; y++)
        for (x = 0; x < size - 1; x++) {
          var c = modules[y][x];
          if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
        }
      function finderLike(s) {
        var count = 0, idx = -1, pats = ["00001011101", "10111010000"];
        pats.forEach(function (p) {
          idx = s.indexOf(p);
          while (idx !== -1) { count++; idx = s.indexOf(p, idx + 1); }
        });
        return count;
      }
      for (y = 0; y < size; y++) {
        line = ""; for (x = 0; x < size; x++) line += modules[y][x] ? "1" : "0";
        score += 40 * finderLike(line);
      }
      for (x = 0; x < size; x++) {
        line = ""; for (y = 0; y < size; y++) line += modules[y][x] ? "1" : "0";
        score += 40 * finderLike(line);
      }
      k = Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1;
      score += Math.max(0, k) * 10;
      return score;
    }

    var best = 0, bestScore = Infinity, m;
    for (m = 0; m < 8; m++) {
      applyMask(m);
      drawFormat(m);
      var p = penalty();
      if (p < bestScore) { bestScore = p; best = m; }
      applyMask(m); // undo
    }
    applyMask(best);
    drawFormat(best);
    return { size: size, version: ver, mask: best, modules: modules };
  }

  function toSvg(text, opts) {
    var border = opts && opts.border != null ? opts.border : 2;
    var qr = encode(text);
    var ns = "http://www.w3.org/2000/svg";
    var d = "";
    for (var y = 0; y < qr.size; y++)
      for (var x = 0; x < qr.size; x++)
        if (qr.modules[y][x]) d += "M" + (x + border) + "," + (y + border) + "h1v1h-1z";
    var total = qr.size + border * 2;
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + total + " " + total);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR code to check this student's status");
    var bg = document.createElementNS(ns, "rect");
    bg.setAttribute("width", total); bg.setAttribute("height", total); bg.setAttribute("fill", "#fff");
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", d); path.setAttribute("fill", "#14081a");
    svg.appendChild(bg); svg.appendChild(path);
    return svg;
  }

  var api = { encode: encode, toSvg: toSvg };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.QR = api;
})();
