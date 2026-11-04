// POST /api/login {name, pin} : checks the PIN and returns a Firebase sign in token.
// Five wrong PINs lock that name for 15 minutes.
const { fb, USERS, SECRETS, slug, PIN_RE, checkPin, tokenFor, json, parse } = require("../lib/common");

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });
  const { name, pin } = parse(event);
  const id = slug(name);
  if (!id || !PIN_RE.test(String(pin || ""))) return json(400, { error: "Enter your 4 to 6 digit PIN." });
  const { db } = fb();
  const userRef = db.collection(USERS).doc(id);
  const secRef = db.collection(SECRETS).doc(id);
  try {
    const result = await db.runTransaction(async (tx) => {
      const [u, s] = await Promise.all([tx.get(userRef), tx.get(secRef)]);
      if (!u.exists || u.data().active === false) return { status: 403, error: "That name isn't on the employee list." };
      if (!s.exists) return { status: 409, error: "You haven't made a PIN yet.", needsPin: true };
      const sec = s.data();
      const now = Date.now();
      if (sec.lockUntil && sec.lockUntil > now) {
        const mins = Math.ceil((sec.lockUntil - now) / 60000);
        return { status: 429, error: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask an admin to reset it.` };
      }
      if (!checkPin(pin, sec)) {
        const fails = (sec.fails || 0) + 1;
        if (fails >= MAX_FAILS) {
          tx.update(secRef, { fails: 0, lockUntil: now + LOCK_MS });
          return { status: 429, error: "Too many wrong PINs. This name is locked for 15 minutes." };
        }
        tx.update(secRef, { fails });
        const left = MAX_FAILS - fails;
        return { status: 401, error: `Wrong PIN. ${left} tr${left === 1 ? "y" : "ies"} left before a 15 minute lock.` };
      }
      tx.update(secRef, { fails: 0, lockUntil: 0, lastLogin: new Date().toISOString() });
      tx.update(userRef, { lastLogin: new Date().toISOString() });
      return { status: 200, user: u.data() };
    });
    if (result.status !== 200) return json(result.status, { error: result.error, needsPin: !!result.needsPin });
    return json(200, { token: await tokenFor(id, result.user) });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Sign in failed. Try again in a minute." });
  }
};
