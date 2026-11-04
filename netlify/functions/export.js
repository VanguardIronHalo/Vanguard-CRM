// GET /api/export with "Authorization: Bearer <Firebase ID token>"
// Admin only. Returns a current .xlsx built from the CRM in the original prospect list layout.
const { json, caller } = require("../lib/common");
const { loadData, buildWorkbook } = require("../lib/excel");

exports.handler = async (event) => {
  const me = await caller(event);
  if (!me) return json(401, { error: "Sign in again." });
  if (!me.admin) return json(403, { error: "Admins only." });
  try {
    const { buffer } = await buildWorkbook(await loadData());
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="Vanguard Prospect List ${day}.xlsx"`,
        "cache-control": "no-store",
      },
      body: Buffer.from(buffer).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    console.error(e);
    return json(500, { error: "Couldn't build the workbook. Try again." });
  }
};
