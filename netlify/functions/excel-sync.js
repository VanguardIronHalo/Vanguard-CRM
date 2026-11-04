// Runs every 5 minutes (see netlify.toml). Rebuilds the live workbook if anything changed.
const { runSync } = require("../lib/excel");

exports.handler = async () => {
  try {
    const r = await runSync({ by: "schedule" });
    return { statusCode: 200, body: JSON.stringify(r.skipped ? { skipped: true } : { ok: true }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
