// POST /api/admin {action, name} with "Authorization: Bearer <Firebase ID token>"
// Admin only. Actions:
//   resetPin   clears a PIN so the person makes a new one at next sign in
//   deleteTest removes a test account (company name starts with "Test") with its activity, follow-ups and deals.
//              {id} for one, {all:true} for every test account. Real prospects can't be deleted this way.
const { fb, USERS, SECRETS, slug, json, parse, caller } = require("../lib/common");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });
  const me = await caller(event);
  if (!me) return json(401, { error: "Sign in again." });
  if (!me.admin) return json(403, { error: "Admins only." });
  const { action, name, id: acctId, all } = parse(event);
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
    if (action === "deleteTest") {
      const isTest = (c) => /^\s*test\b/i.test(String(c || ""));
      let targets;
      if (all) {
        const snap = await db.collection("crm_accounts").get();
        targets = snap.docs.filter((d) => isTest(d.data().company));
      } else {
        const d = await db.collection("crm_accounts").doc(String(acctId || "")).get();
        if (!d.exists) return json(404, { error: "That account is already gone." });
        if (!isTest(d.data().company)) return json(403, { error: "Only test accounts (company name starting with Test) can be deleted. Real prospects stay in the permanent record." });
        targets = [d];
      }
      let removed = 0, related = 0;
      for (const d of targets) {
        const company = (d.data() || {}).company || d.id;
        const refs = [d.ref];
        for (const c of ["crm_activity", "crm_reminders", "crm_deals"]) {
          const r = await db.collection(c).where("accountId", "==", d.id).get();
          r.docs.forEach((x) => refs.push(x.ref));
        }
        for (let i = 0; i < refs.length; i += 400) {
          const b = db.batch();
          refs.slice(i, i + 400).forEach((r) => b.delete(r));
          await b.commit();
        }
        related += refs.length - 1;
        removed++;
        await db.collection("crm_activity").add({
          accountId: "", kind: "deletetest", text: `Deleted test account "${company}" and ${refs.length - 1} related entries`,
          by: me.name, loggedBy: me.name, at: new Date().toISOString(), system: true,
        });
      }
      return json(200, { ok: true, removed, related });
    }
    return json(400, { error: "Unknown action." });
  } catch (e) {
    console.error(e);
    return json(500, { error: "That didn't work. Try again." });
  }
};
