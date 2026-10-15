// Keeps a Render free instance from going idle: while the app is running it requests its own public
// /healthz address every 10 minutes. Render counts that as traffic, so the 15-minute idle timer resets.
// It cannot wake a sleeping service, so pair it with an outside pinger (see README).
// Render sets RENDER_EXTERNAL_URL automatically. Set KEEP_AWAKE=off to turn this off.
function startKeepAlive({ intervalMs = 10 * 60 * 1000, url = process.env.RENDER_EXTERNAL_URL, log = console } = {}) {
  if (process.env.KEEP_AWAKE === "off" || !url) return null;
  const target = url.replace(/\/+$/, "") + "/healthz";
  const ping = async () => {
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) log.error("Keep-alive ping got status", res.status);
    } catch (e) {
      log.error("Keep-alive ping failed:", e.message);
    }
  };
  const timer = setInterval(ping, intervalMs);
  timer.unref();
  return { timer, ping, target };
}

module.exports = { startKeepAlive };
