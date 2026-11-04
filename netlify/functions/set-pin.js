// POST /api/set-pin {name, pin, currentPin?}
// First time: anyone on the employee list with no PIN yet can create one.
// After that: changing the PIN needs the current PIN.
const { fb, USERS, SECRETS, slug, PIN_RE, newSecret, checkPin, tokenFor, json, parse } = require("../lib/common");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });
  const { name, pin, currentPin } = parse(event);
  const id = slug(name);
  if (!id) return json(400, { error: "Pick your name." });
  if (!PIN_RE.test(String(pin || ""))) return json(400, { error: "Your PIN must be 4 to 6 digits." });
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin))
    return json(400, { error: "Pick a PIN that isn't all one digit or a straight run like 1234." });
  const { db } = fb();
  const userRef = db.collection(USERS).doc(id);
  const secRef = db.collection(SECRETS).doc(id);
  try {
    const result = await db.runTransaction(async (tx) => {
      const [u, s] = await Promise.all([tx.get(userRef), tx.get(secRef)]);
      if (!u.exists || u.data().active === false) return { status: 403, error: "That name isn't on the employee list." };
      if (s.exists) {
        const sec = s.data();
        if (sec.lockUntil && sec.lockUntil > Date.now()) return { status: 429, error: "This name is locked for a few minutes after too many wrong PINs." };
        if (!currentPin || !checkPin(currentPin, sec)) {
          tx.update(secRef, { fails: (sec.fails || 0) + 1 });
          return { status: 401, error: currentPin ? "Your current PIN is wrong." : "A PIN is already set for this name. Sign in with it, or ask an admin to reset it." };
        }
      }
      tx.set(secRef, newSecret(pin));
      tx.update(userRef, { hasPin: true, pinSetAt: new Date().toISOString() });
      return { status: 200, user: u.data() };
    });
    if (result.status !== 200) return json(result.status, { error: result.error });
    return json(200, { token: await tokenFor(id, result.user) });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Couldn't save your PIN. Try again in a minute." });
  }
};
