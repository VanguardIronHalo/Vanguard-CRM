// Shared helpers for the Vanguard CRM Netlify functions.
const admin = require("firebase-admin");
const crypto = require("crypto");

let app;
function fb() {
  if (!app) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) }, "crm");
  }
  return { db: app.firestore(), auth: app.auth() };
}

const USERS = "crm_users";
const SECRETS = "crm_secrets";

const slug = (name) =>
  String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

const PIN_RE = /^\d{4,6}$/;
const SESSION_DAYS = 30; // everyone signs in again with their PIN after this
const ITER = 150000;

function hashPin(pin, salt) {
  return crypto.pbkdf2Sync(String(pin), salt, ITER, 32, "sha256").toString("hex");
}
function newSecret(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashPin(pin, salt), iter: ITER, fails: 0, lockUntil: 0, setAt: new Date().toISOString() };
}
function checkPin(pin, secret) {
  const h = crypto.pbkdf2Sync(String(pin), secret.salt, secret.iter || ITER, 32, "sha256");
  const want = Buffer.from(secret.hash, "hex");
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}

async function tokenFor(id, user) {
  const { auth } = fb();
  return auth.createCustomToken("crm_" + id, { crm: true, crmId: id, crmName: user.name });
}

const json = (status, body) => ({
  statusCode: status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

function parse(event) {
  try { return JSON.parse(event.body || "{}"); } catch { return {}; }
}

// Verifies the caller's Firebase ID token and returns their CRM user record.
async function caller(event) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  const { auth, db } = fb();
  try {
    const t = await auth.verifyIdToken(m[1]);
    if (!t.crm || !t.crmId) return null;
    if (!t.auth_time || Date.now() / 1000 - t.auth_time > SESSION_DAYS * 86400) return null;
    const u = await db.collection(USERS).doc(t.crmId).get();
    if (!u.exists || u.data().active === false) return null;
    return { id: t.crmId, ...u.data() };
  } catch {
    return null;
  }
}

module.exports = { fb, USERS, SECRETS, slug, PIN_RE, newSecret, checkPin, tokenFor, json, parse, caller };
