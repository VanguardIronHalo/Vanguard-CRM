// GET /api/config : the Firebase web config (public values, same ones IronHalo ships in its pages).
const { json } = require("../lib/common");

exports.handler = async () => {
  const raw = process.env.FIREBASE_WEB_CONFIG;
  if (!raw) return json(500, { error: "FIREBASE_WEB_CONFIG is not set in Netlify." });
  try {
    return { statusCode: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=300" }, body: JSON.stringify(JSON.parse(raw)) };
  } catch {
    return json(500, { error: "FIREBASE_WEB_CONFIG is not valid JSON." });
  }
};
