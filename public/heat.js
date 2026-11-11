// Lead temperature: Hot, Warm or Cold, worked out from what the team logs.
// Shared by the app (browser) and the Excel export (server) so both agree.
// An owner can pin a temperature by hand; the pin wins until they set it back to Auto.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VCRM_HEAT = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const HOT = 6, WARM = 3; // score thresholds
  const STAGE_PTS = { Contacted: 1, Meeting: 3, Proposal: 5 };
  const TOUCH = ["call", "email", "meeting", "visit"];
  // What people write drives the temperature. The newest entry in the last 30 days that says something counts,
  // and it's weighted so the note alone can make a lead Hot (ready to buy), Warm (buying signal) or Cold (brush-off).
  // Brush-offs are checked first so "not interested" never reads as "interested".
  const SAYS = [
    [-6, "not interested", /\b(not|no longer|isn'?t|aren'?t|wasn'?t) (interested|a fit|a good fit)|\bno interest\b|do not (call|contact)|don'?t (call|contact)|stop (calling|contacting)|remove (us|them|me) from|\bwent with\b|signed with (another|someone else)|chose (another|someone else)|\bno need\b|don'?t need/],
    [-3, "put us off", /under contract (until|through|thru)|locked in|(?<!un)happy with (their|our|the) current|\bno budget\b|not in (the|this year'?s) budget|not right now|call (back )?(next|in the new) year|maybe next year|not until|wrong (contact|person|number)|bad number|\bdeclined\b|\bpass(ed)? on\b/],
    [6, "ready to buy", /ready to (sign|move|start|go)|verbal(ly)? (yes|agreed|approved)|budget (is )?approved|send (the |over the |them the |us the )?(contract|agreement|msa)|\bsigning\b|wants? to (start|begin)|start date|\bawarded\b|approved (it|the|our)/],
    [3, "buying signal", /\binterested\b|pricing|\bquote\b|proposal|\bbid\b|\brfp\b|walk ?through|site (walk|survey|tour)|asked (for|about)|wants? (a|to|more|info|pricing|numbers)|requested|follow ?up meeting|set (up )?a meeting|next meeting|decision maker|\bbudget\b|unhappy with|problems? with (their|the) (current )?(security|guards|vendor|company)|switch(ing)? (vendors|providers|companies)|\bhot\b/],
    [-1, "no answer yet", /no answer|voice ?mail|\bvm\b|left (a )?message|no response|didn'?t (answer|respond|call back)|gatekeeper|not available|couldn'?t reach/],
  ];
  function readNotes(entries, t) {
    const withText = entries.filter((x) => x.text && ago(day(x), t) <= 30).sort((x, y) => String(y.at || day(y)).localeCompare(String(x.at || day(x))));
    for (const x of withText) {
      const txt = String(x.text).toLowerCase();
      for (const [pts, label, re] of SAYS) if (re.test(txt)) return { pts, label, date: day(x) };
    }
    return null;
  }
  const day = (x) => String(x.date || x.at || "").slice(0, 10);
  const ago = (d, today) => Math.floor((new Date(today + "T12:00:00") - new Date(d + "T12:00:00")) / 864e5);

  // a: account. ctx: { activity (this account's entries), deals (this account's), nextDue (earliest open follow-up date or ""), today "YYYY-MM-DD" }
  function score(a, ctx) {
    const t = ctx.today, why = [];
    if (a.type === "client" || a.stage === "Current client" || a.stage === "Won") return { tier: "", auto: "", score: 0, why: ["Client"] };
    if (a.stage === "Lost" || a.stage === "Parked") return { tier: pin(a) || "Cold", auto: "Cold", score: 0, why: [a.stage], pinned: !!pin(a) };
    let s = 0;
    const sp = STAGE_PTS[a.stage] || 0;
    if (sp) { s += sp; why.push(a.stage + " stage"); }
    const openDeal = (ctx.deals || []).some((d) => !["Won", "Lost"].includes(d.stage));
    if (openDeal) { s += 3; why.push("open deal"); }
    const touches = (ctx.activity || []).filter((x) => TOUCH.includes(x.kind) && day(x));
    const recent = touches.filter((x) => ago(day(x), t) <= 30);
    if (recent.some((x) => x.kind === "meeting" || x.kind === "visit")) { s += 2; why.push("meeting or visit in the last 30 days"); }
    else if (recent.length) { s += 1; why.push("call or email in the last 30 days"); }
    if (recent.length >= 3) { s += 1; why.push(recent.length + " contacts in 30 days"); }
    const said = readNotes((ctx.activity || []).filter((x) => [...TOUCH, "note", "handoff"].includes(x.kind) && day(x)), t);
    if (said) { s += said.pts; why.push(`latest note reads as ${said.label} (${said.pts > 0 ? "+" : ""}${said.pts})`); }
    if ((a.people || []).some((p) => p.role === "Decision maker")) { s += 1; why.push("decision maker on file"); }
    if (ctx.nextDue && ctx.nextDue >= t) { s += 1; why.push("follow-up scheduled"); }
    if (ctx.nextDue && ctx.nextDue < t) { s -= 1; why.push("follow-up date passed"); }
    const last = [a.lastTouch, a.lastVisit, ...touches.map(day)].filter(Boolean).sort().pop();
    if (last && ago(last, t) > 60) { s -= 4; why.push("no contact in 60+ days"); }
    if (!last) why.push("not contacted yet");
    const auto = s >= HOT ? "Hot" : s >= WARM ? "Warm" : "Cold";
    return { tier: pin(a) || auto, auto, score: s, why, pinned: !!pin(a) };
  }
  function pin(a) { const h = a.heatPin; return h && ["Hot", "Warm", "Cold"].includes(h.tier) ? h.tier : ""; }
  return { score, TIERS: ["Hot", "Warm", "Cold"], HOT, WARM };
});
