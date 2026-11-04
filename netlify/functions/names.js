// GET /api/names : active employees for the sign in screen (names only, nothing private).
const { fb, USERS, json } = require("../lib/common");

const lastFirst = (n) => {
  const p = String(n).trim().split(/\s+/);
  return (p[p.length - 1] + " " + p.slice(0, -1).join(" ")).toLowerCase();
};

exports.handler = async () => {
  try {
    const { db } = fb();
    const snap = await db.collection(USERS).get();
    const people = snap.docs
      .map((d) => d.data())
      .filter((u) => u.active !== false && u.name)
      .map((u) => ({ name: u.name, hasPin: !!u.hasPin }))
      .sort((a, b) => lastFirst(a.name).localeCompare(lastFirst(b.name)));
    return json(200, { people });
  } catch (e) {
    console.error(e);
    return json(500, { error: "The sign in service isn't set up yet. Ask Matthew to finish setup." });
  }
};
