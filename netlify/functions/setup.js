// POST /api/setup : one time load of employees and the 233 prospects.
// It only runs while the employee list is empty, so once setup has worked it switches itself off.
// (If CRM_SETUP_KEY is set in Netlify, the call must also carry ?key=<that value>.)
const { fb, USERS, slug, json } = require("../lib/common");
const accounts = require("../data/accounts.json");

const EMPLOYEES = [
  "Sommer Collins", "Wendy Duncan", "Vernard Hughes", "Willie Joffrion", "Sandra Jones",
  "Matthew Lambert", "Jerry Lucas", "Shannon McCracken", "Faith Parker", "Brad Pate", "Kimberly Smith-Cummings",
];
const ADMINS = ["Matthew Lambert"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });
  const key = process.env.CRM_SETUP_KEY;
  if (key && (event.queryStringParameters || {}).key !== key) return json(403, { error: "Wrong setup key." });
  const { db } = fb();
  const already = await db.collection(USERS).limit(1).get();
  if (!already.empty) return json(409, { error: "Setup already ran. The CRM is loaded, so this is switched off." });
  const now = new Date().toISOString();
  let users = 0, accts = 0;

  const uSnap = await db.collection(USERS).get();
  const haveU = new Set(uSnap.docs.map((d) => d.id));
  let batch = db.batch(), n = 0;
  for (const name of EMPLOYEES) {
    const id = slug(name);
    if (haveU.has(id)) continue;
    batch.set(db.collection(USERS).doc(id), { name, admin: ADMINS.includes(name), active: true, hasPin: false, createdAt: now, createdBy: "setup" });
    users++; n++;
  }
  if (n) await batch.commit();

  const aSnap = await db.collection("crm_accounts").select().get();
  const haveA = new Set(aSnap.docs.map((d) => d.id));
  batch = db.batch(); n = 0;
  for (const rec of accounts) {
    const { id, ...data } = rec;
    if (haveA.has(id)) continue;
    batch.set(db.collection("crm_accounts").doc(id), data);
    accts++; n++;
    if (n === 400) { await batch.commit(); batch = db.batch(); n = 0; }
  }
  if (n) await batch.commit();

  return json(200, { ok: true, employeesAdded: users, accountsAdded: accts, note: "Done. Setup is now switched off for good." });
};
