// POST /api/admin {action, name} with "Authorization: Bearer <Firebase ID token>"
// Admin only. Actions: resetPin (clears a PIN so the person makes a new one at next sign in).
const { fb, USERS, SECRETS, slug, json, parse, caller } = require("../lib/common");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });
  const me = await caller(event);
  if (!me) return json(401, { error: "Sign in again." });
  if (!me.admin) return json(403, { error: "Admins only." });
  const { action, name } = parse(event);
  const id = slug(name);
  const { db, auth } = fb();
  try {
    if (action === "resetPin") {
      const u = await db.collection(USERS).doc(id).get();
      if (!u.exists) return json(404, { error: "No employee by that name." });
      await db.collection(SECRETS).doc(id).delete();
      await db.collection(USERS).doc(id).update({ hasPin: false, pinResetAt: new Date().toISOString(), pinResetBy: me.name });
      // Sign them out everywhere so the old PIN session ends.
      await auth.revokeRefreshTokens("crm_" + id).catch(() => {});
      await db.collection("crm_activity").add({
        accountId: "", kind: "pinreset", text: `PIN reset for ${u.data().name}`, by: me.name, loggedBy: me.name,
        at: new Date().toISOString(), system: true,
      });
      return json(200, { ok: true });
    }
    return json(400, { error: "Unknown action." });
  } catch (e) {
    console.error(e);
    return json(500, { error: "That didn't work. Try again." });
  }
};
