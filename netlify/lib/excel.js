// Builds the live prospect workbook from the CRM and uploads it to OneDrive or SharePoint.
// The CRM is the source of truth. The workbook is rebuilt from it, so edits typed into
// the workbook are replaced at the next update.
const ExcelJS = require("exceljs");
const crypto = require("crypto");
const { fb } = require("./common");

const BLUE = "FF2E3192", WHITE = "FFFFFFFF", BLACK = "FF000000", GREY = "FFE9EBF4", RED = "FFB42318", PALE = "FFF3F4F9";
const FONT = "Calibri";
const STAGES = ["Not researched", "Researched", "Contacted", "Meeting", "Proposal", "Won", "Lost", "Parked", "Current client"];
const LIST_ORDER = ["Call This Week", "Property Managers — Work Next", "Prospect Book — Top 30 (CRM)", "Distribution Centers — Warm Up",
  "Prospect Book — Warm Up (CRM)", "Referral Partner", "Property Managers — Lower Fit", "Parked", "Added in CRM"];
const TOUCH = ["call", "email", "meeting", "visit", "note"];
const KIND = { call: "Call", email: "Email", meeting: "Meeting", visit: "Site visit", note: "Note", handoff: "Handoff", converted: "Became client",
  reverted: "Back to prospect", stage: "Stage change", owner: "Owner change", created: "Added", next: "Next step", accepted: "Handoff accepted",
  edit: "Details edited", deal: "Deal", contact: "Contact added", reminder: "Reminder set", followup: "Follow-up done", employee: "Employee change", pinreset: "PIN reset" };

const listRank = (l) => { const i = LIST_ORDER.indexOf(l); return i < 0 ? 50 : i; };
const owners = (a) => (Array.isArray(a.owners) ? a.owners : a.owner ? [a.owner] : []);
const lastTouch = (a) => [a.lastTouch, a.lastVisit, a.clientSince].filter(Boolean).sort().pop() || "";
const annual = (d) => (Number(d.value) || 0) * (d.term === "monthly" ? 12 : 1);
// Excel has no time zones, so write the Chicago wall clock time as if it were UTC.
const dt = (s) => {
  if (!s) return null;
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) { const [y, m, d] = str.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  const d = new Date(str); if (isNaN(d)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute));
};
const ctNow = () => new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

async function loadData() {
  const { db } = fb();
  const [acc, act, rem, deals, users] = await Promise.all([
    db.collection("crm_accounts").get(),
    db.collection("crm_activity").orderBy("at", "desc").limit(2000).get(),
    db.collection("crm_reminders").where("done", "==", false).get(),
    db.collection("crm_deals").get(),
    db.collection("crm_users").get(),
  ]);
  return {
    accounts: acc.docs.map((d) => ({ id: d.id, ...d.data() })),
    activity: act.docs.map((d) => ({ id: d.id, ...d.data() })),
    reminders: rem.docs.map((d) => ({ id: d.id, ...d.data() })),
    deals: deals.docs.map((d) => ({ id: d.id, ...d.data() })),
    users: users.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.active !== false),
  };
}

function shape(data) {
  const t = todayCT();
  const byAcc = (arr) => arr.reduce((m, x) => ((m[x.accountId] = m[x.accountId] || []).push(x), m), {});
  const remBy = byAcc(data.reminders.slice().sort((a, b) => String(a.due).localeCompare(b.due)));
  const dealBy = byAcc(data.deals.filter((d) => !["Won", "Lost"].includes(d.stage)));
  const nameOf = Object.fromEntries(data.accounts.map((a) => [a.id, a.company]));
  const row = (a) => {
    const r = (remBy[a.id] || [])[0];
    const open = (dealBy[a.id] || []).reduce((s, d) => s + annual(d), 0);
    return {
      id: a.id, list: a.list || "Added in CRM", company: a.company, stage: a.stage || "", owners: owners(a).join(", "),
      next: a.nextAction || "", nextDate: a.nextDate || "", lastTouch: lastTouch(a), lastVisit: a.lastVisit || "",
      follow: r ? `${r.type}${r.assignee ? " (" + r.assignee + ")" : ""}` : "", followDate: r ? r.due : "", followOver: !!(r && r.due < t),
      deals: open || "", contact: a.contact || "", phone: a.phone || "", address: a.address || "", sector: a.sector || "", why: a.why || "",
      type: a.type, clientSince: a.clientSince || "", services: (a.services || []).join(", "), order: a.order || 999,
    };
  };
  const rows = data.accounts.map(row).sort((x, y) => listRank(x.list) - listRank(y.list) || x.order - y.order || String(x.company).localeCompare(y.company));
  const prospects = rows.filter((r) => r.type !== "client");
  const clients = rows.filter((r) => r.type === "client").sort((a, b) => String(a.company).localeCompare(b.company));
  const people = [];
  data.accounts.forEach((a) => (a.people || []).forEach((p) => people.push({ company: a.company, ...p })));
  people.sort((a, b) => String(a.company).localeCompare(b.company));
  const followups = data.reminders.slice().sort((a, b) => String(a.due).localeCompare(b.due))
    .map((r) => ({ due: r.due, time: r.time || "", type: r.type, company: nameOf[r.accountId] || "", who: r.assignee || "", note: r.note || "", over: r.due < t }));
  const activity = data.activity.map((x) => ({ at: x.at, who: x.by || "", kind: KIND[x.kind] || x.kind, company: nameOf[x.accountId] || "", text: x.text || "" }));
  const now = Date.now(), within = (x, d) => now - new Date(x.at) < d * 864e5;
  const team = data.users.map((u) => {
    const acts = data.activity.filter((x) => x.by === u.name && TOUCH.includes(x.kind));
    const owned = data.accounts.filter((a) => owners(a).includes(u.name));
    return { name: u.name, owned: owned.length, t7: acts.filter((x) => within(x, 7)).length, t30: acts.filter((x) => within(x, 30)).length,
      visits30: acts.filter((x) => x.kind === "visit" && within(x, 30)).length,
      overdue: data.reminders.filter((r) => r.assignee === u.name && r.due < t).length + owned.filter((a) => a.nextDate && a.nextDate < t).length };
  }).sort((a, b) => a.name.split(" ").pop().localeCompare(b.name.split(" ").pop()));
  return { prospects, clients, people, followups, activity, team, stageCounts: STAGES.map((s) => [s, rows.filter((r) => r.stage === s).length]) };
}

function styleHeader(row) {
  row.eachCell((c) => { c.font = { name: FONT, bold: true, color: { argb: WHITE } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } }; c.alignment = { vertical: "middle", wrapText: true }; });
  row.height = 22;
}
function banner(ws, title, cols) {
  ws.mergeCells(1, 1, 1, cols);
  const a = ws.getCell(1, 1); a.value = title; a.font = { name: FONT, size: 16, bold: true, color: { argb: BLUE } };
  ws.mergeCells(2, 1, 2, cols);
  const b = ws.getCell(2, 1);
  b.value = `Updated ${ctNow()} from Vanguard CRM (vanguardcrm.netlify.app). This sheet is read only: make changes in the CRM. Anything typed here is replaced at the next update.`;
  b.font = { name: FONT, italic: true, color: { argb: "FF5A5E7A" } }; b.alignment = { wrapText: true }; ws.getRow(2).height = 30;
}
function dateCell(c, s, over) {
  const d = dt(s); if (!d) return; c.value = d; c.numFmt = "mmm d, yyyy";
  if (over) c.font = { name: FONT, bold: true, color: { argb: RED } };
}
function table(ws, startRow, headers, widths, rows, fill) {
  headers.forEach((h, i) => { ws.getColumn(i + 1).width = widths[i]; });
  const hr = ws.getRow(startRow); hr.values = headers; styleHeader(hr);
  rows.forEach((r, i) => {
    const row = ws.getRow(startRow + 1 + i);
    fill(row, r);
    row.eachCell({ includeEmpty: false }, (c) => { if (!c.font || !c.font.name) c.font = { ...(c.font || {}), name: FONT }; c.alignment = { vertical: "top", wrapText: true }; });
    if (i % 2 === 1) for (let k = 1; k <= headers.length; k++) ws.getCell(startRow + 1 + i, k).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE } };
  });
  return startRow + 1 + rows.length;
}

const PCOLS = ["Company", "Stage", "Owners", "Next step", "Next date", "Last touch", "Last visit", "Follow-up", "Follow-up date", "Open deals ($/yr)", "Contact", "Main phone", "Address", "Sector", "Why"];
const PW = [30, 14, 22, 30, 12, 12, 12, 24, 13, 14, 30, 15, 32, 20, 50];
function fillProspect(row, r) {
  row.values = [r.company, r.stage, r.owners, r.next, null, null, null, r.follow, null, r.deals || null, r.contact, r.phone, r.address, r.sector, r.why];
  dateCell(row.getCell(5), r.nextDate, r.nextDate && r.nextDate < todayCT());
  dateCell(row.getCell(6), r.lastTouch); dateCell(row.getCell(7), r.lastVisit); dateCell(row.getCell(9), r.followDate, r.followOver);
  if (r.deals) row.getCell(10).numFmt = '"$"#,##0';
  row.getCell(1).font = { name: FONT, bold: true };
}

async function buildWorkbook(data) {
  const v = shape(data);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vanguard CRM"; wb.created = new Date();

  // Master list, grouped like the original prospect list
  let ws = wb.addWorksheet("Master Prospect List", { views: [{ state: "frozen", ySplit: 3 }] });
  banner(ws, "Vanguard Security Prospect List", PCOLS.length);
  ws.mergeCells(3, 1, 3, PCOLS.length);
  ws.getCell(3, 1).value = v.stageCounts.filter(([, n]) => n).map(([s, n]) => `${s}: ${n}`).join("   ·   ");
  ws.getCell(3, 1).font = { name: FONT, bold: true };
  let r = 5;
  const lists = [...new Set(v.prospects.map((p) => p.list))].sort((a, b) => listRank(a) - listRank(b));
  for (const l of lists) {
    const rows = v.prospects.filter((p) => p.list === l);
    ws.mergeCells(r, 1, r, PCOLS.length);
    const c = ws.getCell(r, 1); c.value = `${l.toUpperCase()} (${rows.length})`;
    c.font = { name: FONT, size: 13, bold: true, color: { argb: BLACK } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
    r = table(ws, r + 1, PCOLS, PW, rows, fillProspect) + 1;
  }

  // Flat, filterable list
  ws = wb.addWorksheet("All Prospects", { views: [{ state: "frozen", ySplit: 3 }] });
  banner(ws, "All prospects (sort and filter here)", PCOLS.length + 1);
  table(ws, 3, ["List", ...PCOLS], [26, ...PW], v.prospects, (row, x) => {
    row.values = [x.list, x.company, x.stage, x.owners, x.next, null, null, null, x.follow, null, x.deals || null, x.contact, x.phone, x.address, x.sector, x.why];
    dateCell(row.getCell(6), x.nextDate, x.nextDate && x.nextDate < todayCT());
    dateCell(row.getCell(7), x.lastTouch); dateCell(row.getCell(8), x.lastVisit); dateCell(row.getCell(10), x.followDate, x.followOver);
    if (x.deals) row.getCell(11).numFmt = '"$"#,##0';
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + v.prospects.length, column: PCOLS.length + 1 } };

  ws = wb.addWorksheet("Clients", { views: [{ state: "frozen", ySplit: 3 }] });
  banner(ws, "Clients", 9);
  table(ws, 3, ["Company", "Client since", "Services", "Owners", "Last touch", "Follow-up", "Follow-up date", "Contact", "Main phone"],
    [30, 13, 30, 24, 12, 24, 13, 30, 15], v.clients, (row, x) => {
      row.values = [x.company, null, x.services, x.owners, null, x.follow, null, x.contact, x.phone];
      dateCell(row.getCell(2), x.clientSince); dateCell(row.getCell(5), x.lastTouch); dateCell(row.getCell(7), x.followDate, x.followOver);
      row.getCell(1).font = { name: FONT, bold: true };
    });

  ws = wb.addWorksheet("Follow-ups", { views: [{ state: "frozen", ySplit: 3 }] });
  banner(ws, "Open follow-ups", 6);
  table(ws, 3, ["Due", "Time", "Type", "Company", "For", "Note"], [13, 9, 18, 30, 22, 50], v.followups, (row, x) => {
    row.values = [null, x.time, x.type, x.company, x.who, x.note]; dateCell(row.getCell(1), x.due, x.over);
  });

  ws = wb.addWorksheet("Team", { views: [{ state: "frozen", ySplit: 3 }] });
  banner(ws, "Team activity", 6);
  table(ws, 3, ["Name", "Accounts owned", "Touches this week", "Touches 30 days", "Site visits 30 days", "Overdue items"], [26, 15, 17, 16, 18, 14], v.team, (row, x) => {
    row.values = [x.name, x.owned, x.t7, x.t30, x.visits30, x.overdue]; if (x.overdue) row.getCell(6).font = { name: FONT, bold: true, color: { argb: RED } };
  });

  ws = wb.addWorksheet("People", { views: [{ state: "frozen", ySplit: 3 }] });
  banner(ws, "People", 6);
  table(ws, 3, ["Company", "Name", "Title", "Role", "Phone", "Email"], [30, 26, 28, 18, 16, 30], v.people, (row, x) => {
    row.values = [x.company, x.name, x.title || "", x.role || "", x.phone || "", x.email || ""];
  });

  ws = wb.addWorksheet("Activity Log", { views: [{ state: "frozen", ySplit: 3 }] });
  banner(ws, "Activity log (latest 2,000)", 5);
  table(ws, 3, ["When", "Who", "Type", "Company", "Details"], [18, 22, 18, 30, 70], v.activity, (row, x) => {
    const d = dt(x.at); row.values = [d, x.who, x.kind, x.company, x.text]; if (d) row.getCell(1).numFmt = "mmm d, yyyy h:mm AM/PM";
  });

  // Fingerprint of the content (not the timestamp) so unchanged data skips the upload
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ ...v, activity: v.activity.slice(0, 300) })).digest("hex");
  return { buffer: await wb.xlsx.writeBuffer(), fingerprint, counts: { prospects: v.prospects.length, clients: v.clients.length } };
}

async function graphToken() {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env;
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) throw new Error("Microsoft sign in settings (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET) are not set.");
  const r = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("Microsoft sign in failed: " + (j.error_description || j.error || r.status));
  return j.access_token;
}

function uploadUrl() {
  const target = process.env.EXCEL_DRIVE || "";      // "user:matthew@vanguard901.com" or "drive:<driveId>"
  const path = (process.env.EXCEL_PATH || "Vanguard CRM/Vanguard Prospect List (Live).xlsx").replace(/^\/+/, "");
  const enc = path.split("/").map(encodeURIComponent).join("/");
  if (target.startsWith("user:")) return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(target.slice(5))}/drive/root:/${enc}:/content`;
  if (target.startsWith("drive:")) return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(target.slice(6))}/root:/${enc}:/content`;
  throw new Error('EXCEL_DRIVE is not set. Use "user:you@vanguard901.com" for OneDrive or "drive:<id>" for a SharePoint library.');
}

async function runSync({ force = false, by = "schedule" } = {}) {
  const { db } = fb();
  const metaRef = db.collection("crm_meta").doc("excel");
  const meta = (await metaRef.get()).data() || {};
  try {
    const data = await loadData();
    const { buffer, fingerprint, counts } = await buildWorkbook(data);
    if (!force && meta.fingerprint === fingerprint && meta.status === "ok") {
      await metaRef.set({ checkedAt: new Date().toISOString() }, { merge: true });
      return { skipped: true };
    }
    const token = await graphToken();
    const r = await fetch(uploadUrl(), { method: "PUT", headers: { authorization: "Bearer " + token, "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, body: buffer });
    const j = await r.json().catch(() => ({}));
    if (r.status === 423) throw new Error("The workbook is locked, usually because someone has it open in desktop Excel with editing on. It will try again at the next update.");
    if (!r.ok) throw new Error("Upload to Microsoft failed: " + ((j.error && j.error.message) || r.status));
    const res = { status: "ok", fingerprint, syncedAt: new Date().toISOString(), checkedAt: new Date().toISOString(), by, webUrl: j.webUrl || meta.webUrl || "", error: "", ...counts };
    await metaRef.set(res, { merge: true });
    return res;
  } catch (e) {
    await metaRef.set({ status: "error", error: String(e.message || e), checkedAt: new Date().toISOString(), by }, { merge: true });
    throw e;
  }
}

module.exports = { runSync, buildWorkbook, loadData };
