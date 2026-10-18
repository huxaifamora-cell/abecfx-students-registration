// Builds PROJECT-STATUS.md from status/STATUS-SOURCE.md plus the real source files.
// Usage (from the project root):  node status/build.js
// Optional: QUIZBOT_DIR=/path/to/quiz-bot-folder  (embeds the quiz bot's code too)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const quizDir = process.env.QUIZBOT_DIR || path.join(root, "..", "abecfx-quiz-bot");

const SITE_FILES = [
  "server.js", "sheets.js", "admin-database.js", "idrules.js", "grading.js", "stats.js", "keepalive.js", "quiztoken.js", "session.js",
  "handbook-content.js", "handbook-progress.js", "pdflink.js",
  "package.json", "render.yaml", ".env.example",
  "public/register.html", "public/app.js",
  "public/portal.html", "public/portal.js", "public/handbook.js",
  "public/status.html", "public/status.js",
  "public/card.js", "public/qr.js",
  "public/admin.html", "public/admin.js", "public/admin.css",
  "public/styles.css", "public/links.js", "links.js", "videos.js",
  "status/build.js",
];
const SITE_DATA = ["countries.js", "countryCodes.js", "states.json", "private/handbook.pdf"];
const QUIZ_FILES = ["bot.js", "webapp/embed.js", "package.json", "env.example", "render.yaml"];

const LANG = { js: "js", json: "json", html: "html", css: "css", yaml: "yaml", example: "bash", md: "md" };

function fence(text) {
  const runs = text.match(/`+/g) || [];
  const n = Math.max(2, ...runs.map((r) => r.length)) + 1;
  return "`".repeat(n);
}
function block(title, text, lang) {
  const f = fence(text);
  return `#### \`${title}\`\n\n${f}${lang}\n${text.replace(/\s+$/, "")}\n${f}\n`;
}
function langOf(file) {
  return LANG[file.split(".").pop()] || "";
}
function readIf(p) {
  try { return fs.readFileSync(p, "utf8"); } catch (e) { return null; }
}

let out = "### Registration website\n\n";
const present = SITE_DATA.filter((f) => fs.existsSync(path.join(root, f)))
  .map((f) => `\`${f}\` (${(fs.statSync(path.join(root, f)).size / 1024).toFixed(0)} KB)`);
out += `Not embedded (data): ${present.join(", ")}.\n\n`;
for (const f of SITE_FILES) {
  const t = readIf(path.join(root, f));
  if (t == null) { out += `#### \`${f}\`\n\n_missing_\n\n`; continue; }
  out += block(f, t, langOf(f)) + "\n";
}

out += "### Telegram quiz bot (separate repository)\n\n";
if (fs.existsSync(quizDir)) {
  for (const f of QUIZ_FILES) {
    const t = readIf(path.join(quizDir, f));
    if (t != null) out += block("quiz-bot/" + f, t, langOf(f)) + "\n";
  }
  let diff = "";
  try {
    diff = execFileSync("git", ["-C", quizDir, "diff", "--no-color", "--", "webapp/index.html"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  } catch (e) { /* no git history available */ }
  out += "`webapp/index.html` is about 130 KB (questions and an embedded logo), so only the changes made for the website link are shown, as a diff against the original repository version.\n\n";
  out += diff ? block("quiz-bot/webapp/index.html (diff)", diff, "diff") : "_diff not available in this build_\n";
} else {
  out += "_Quiz bot folder not found when this file was built._\n";
}

const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }).format(new Date());
const src = fs.readFileSync(path.join(__dirname, "STATUS-SOURCE.md"), "utf8");
const result = src.split("{{DATE}}").join(date).replace("{{CODE}}", () => out);
fs.writeFileSync(path.join(root, "PROJECT-STATUS.md"), result);
console.log("PROJECT-STATUS.md written,", (result.length / 1024).toFixed(0), "KB");
