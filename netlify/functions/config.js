// GET /api/config : the Firebase web config. These values are public (every browser gets them);
// security comes from the Firestore rules and the server side PIN check.
// FIREBASE_WEB_CONFIG in Netlify overrides the built in values if it's ever set.
const { json } = require("../lib/common");

const BUILT_IN = {
  apiKey: "AIzaSyBOrohsup3lxPOY-_iY5xO6Dvh0q3vdlvE",
  authDomain: "vanguard-crm-6dde0.firebaseapp.com",
  projectId: "vanguard-crm-6dde0",
  storageBucket: "vanguard-crm-6dde0.firebasestorage.app",
  messagingSenderId: "203318486362",
  appId: "1:203318486362:web:054f323031f77468b43f63",
};

exports.handler = async () => {
  let cfg = BUILT_IN;
  if (process.env.FIREBASE_WEB_CONFIG) {
    try { cfg = JSON.parse(process.env.FIREBASE_WEB_CONFIG); } catch { return json(500, { error: "FIREBASE_WEB_CONFIG is not valid JSON." }); }
  }
  return { statusCode: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=300" }, body: JSON.stringify(cfg) };
};
