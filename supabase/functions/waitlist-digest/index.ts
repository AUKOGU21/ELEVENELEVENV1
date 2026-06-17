// Supabase Edge Function: waitlist-digest
// -----------------------------------------------------------------------------
// Reads the waitlist and emails a signup summary via Resend. Triggered by a
// pg_cron job every 2 hours (server-side, so it runs even when no app is open).
//
// Secrets:
//   RESEND_API_KEY   - Resend API key (already set project-wide)
//   DIGEST_SECRET    - shared secret; must match the cron job's Authorization header
//   DIGEST_TO        - recipient email (defaults below)
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DIGEST_SECRET = Deno.env.get("DIGEST_SECRET") ?? "";
const DIGEST_TO = Deno.env.get("DIGEST_TO") ?? "alexiskukogu@gmail.com";
const FROM = "ElevenEleven <hello@geteleveneleven.com>";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Exact row count via PostgREST without fetching rows
async function tableCount(path: string): Promise<number> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`, {
      method: "HEAD",
      headers: {
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    });
    const n = (r.headers.get("content-range") || "").split("/")[1];
    return n && n !== "*" ? parseInt(n) : 0;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (DIGEST_SECRET) {
    const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (auth !== DIGEST_SECRET) return new Response("unauthorized", { status: 401 });
  }
  if (!RESEND_API_KEY) return new Response("RESEND_API_KEY not set", { status: 500 });

  // Read the waitlist with the service role (bypasses RLS)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?select=first_name,last_name,email,source,utm_source,created_at&order=created_at.desc`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const rows: any[] = await res.json();

  // Who converted: waitlist emails that now have a beta account
  const joined = new Set<string>();
  try {
    const au = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const aj = await au.json();
    for (const u of (aj.users || [])) if (u.email) joined.add(String(u.email).toLowerCase());
  } catch (e) {
    console.error("auth list failed:", e);
  }
  const isJoined = (email: string) => joined.has((email || "").toLowerCase());
  const converted = rows.filter((r) => isJoined(r.email));

  // In-app activity is computed further below (after the waitlist stats) so it
  // can reuse `now` / `dayAgo`.

  const now = Date.now();
  const dayAgo = now - 86_400_000;
  const total = rows.length;
  const last24 = rows.filter((r) => r.created_at && new Date(r.created_at).getTime() >= dayAgo).length;

  const bySource: Record<string, number> = {};
  for (const r of rows) {
    const k = r.utm_source || r.source || "direct";
    bySource[k] = (bySource[k] || 0) + 1;
  }
  const sourceRows = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `<tr><td style="padding:2px 0;color:#6F665A;">${esc(s)}</td><td style="padding:2px 0 2px 16px;font-weight:600;color:#1C1712;">${n}</td></tr>`)
    .join("");

  const latestRows = rows.slice(0, 15).map((r) => {
    const name = `${(r.first_name || "").trim()} ${(r.last_name || "").trim()}`.trim() || "—";
    const when = r.created_at
      ? new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "";
    const src = r.utm_source || r.source || "";
    const badge = isJoined(r.email) ? ` <span style="color:#16a34a;font-size:11px;font-weight:600;">✓ joined</span>` : "";
    return `<tr><td style="padding:3px 0;color:#1C1712;">${esc(name)}${badge}</td><td style="padding:3px 12px;color:#6F665A;">${esc(r.email || "")}</td><td style="padding:3px 12px;color:#9A3F26;">${esc(src)}</td><td style="padding:3px 0;color:#9c9488;white-space:nowrap;">${esc(when)}</td></tr>`;
  }).join("");

  // ── In-app activity: funnel, 24h deltas, liquidity gaps, silent accounts, feed ──
  async function rowsOf(path: string): Promise<any[]> {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { return []; }
  }
  const [profilesA, decisionsA, responsesA, savesA, outcomesA, votesA] = await Promise.all([
    rowsOf("profiles?select=id,display_name,onboarding_completed"),
    rowsOf("decisions?select=id,user_id,brand_name,product_name,created_at"),
    rowsOf("responses?select=user_id,decision_id,recommendation,created_at"),
    rowsOf("saved_decisions?select=user_id,decision_id,created_at"),
    rowsOf("outcomes?select=user_id,decision_id,created_at"),
    rowsOf("response_votes?select=id"),
  ]);
  let authUsers: any[] = [];
  try {
    const au = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    authUsers = (await au.json()).users || [];
  } catch { /* ignore */ }
  const TEAM = new Set(["aukogu@mba2026.hbs.edu", "alexiskukogu@gmail.com", "srishtisat_09@berkeley.edu"]);

  const nameOf = (uid: string) => (profilesA.find((x) => x.id === uid)?.display_name || "").trim() || "—";
  const itemFor = (d: any) => [d?.brand_name, d?.product_name].filter(Boolean).join(" ") || "(item)";
  const itemOf = (did: string) => itemFor(decisionsA.find((x) => x.id === did));
  const fmtWhen = (ts: string | number | null) => ts ? new Date(ts).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const isRecent = (ts: string | null) => !!ts && new Date(ts).getTime() >= dayAgo;

  const pc: Record<string, { posts: number; weighs: number; saves: number; outcomes: number }> = {};
  const bump = (uid: string, k: "posts" | "weighs" | "saves" | "outcomes") => { if (!uid) return; (pc[uid] ||= { posts: 0, weighs: 0, saves: 0, outcomes: 0 })[k]++; };
  for (const d of decisionsA) bump(d.user_id, "posts");
  for (const r of responsesA) bump(r.user_id, "weighs");
  for (const s of savesA) bump(s.user_id, "saves");
  for (const o of outcomesA) bump(o.user_id, "outcomes");

  const accounts = authUsers.length || joined.size;
  const onboardedN = profilesA.filter((p) => p.onboarding_completed).length;
  const postedN = Object.values(pc).filter((v) => v.posts > 0).length;
  const weighedN = Object.values(pc).filter((v) => v.weighs > 0).length;
  const outcomeUsersN = Object.values(pc).filter((v) => v.outcomes > 0).length;

  const funnelRows = [
    ["Accounts", `${accounts}`],
    ["Onboarded", `${onboardedN}`],
    ["Posted a decision", `${postedN}`],
    ["Weighed in", `${weighedN}`],
    ["Logged an outcome", `${outcomeUsersN}`],
  ].map(([k, v]) => `<tr><td style="padding:2px 0;color:#6F665A;">${esc(k)}</td><td style="padding:2px 0 2px 16px;font-weight:600;color:#1C1712;">${esc(v)}</td></tr>`).join("");

  const totalsLine = `${decisionsA.length} posts · ${responsesA.length} weigh-ins · ${outcomesA.length} outcomes · ${votesA.length} votes · ${savesA.length} saves`;
  const delta24Line = `+${authUsers.filter((u) => isRecent(u.created_at)).length} accounts · +${decisionsA.filter((d) => isRecent(d.created_at)).length} posts · +${responsesA.filter((r) => isRecent(r.created_at)).length} weigh-ins · +${savesA.filter((s) => isRecent(s.created_at)).length} saves`;

  const weighCount: Record<string, number> = {};
  for (const r of responsesA) weighCount[r.decision_id] = (weighCount[r.decision_id] || 0) + 1;
  const avgWeigh = decisionsA.length ? (responsesA.length / decisionsA.length).toFixed(1) : "0";
  const zeroRows = decisionsA.filter((d) => !weighCount[d.id])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((d) => `<tr><td style="padding:3px 0;color:#1C1712;">${esc(nameOf(d.user_id))}</td><td style="padding:3px 12px;color:#6F665A;">${esc(itemFor(d))}</td><td style="padding:3px 0;color:#9c9488;white-space:nowrap;">${esc(fmtWhen(d.created_at))}</td></tr>`)
    .join("") || `<tr><td style="padding:3px 0;color:#16a34a;">every post has a weigh-in</td></tr>`;

  const silent = authUsers.filter((u) => {
    if (TEAM.has((u.email || "").toLowerCase())) return false;
    const c = pc[u.id];
    return !c || (c.posts === 0 && c.weighs === 0);
  }).map((u) => nameOf(u.id)).filter((n) => n !== "—");
  const silentLine = silent.length ? esc(silent.join(", ")) : "none";

  const feed: Array<{ t: number; txt: string }> = [];
  for (const s of savesA) feed.push({ t: new Date(s.created_at || 0).getTime(), txt: `${nameOf(s.user_id)} saved ${itemOf(s.decision_id)}` });
  for (const r of responsesA) feed.push({ t: new Date(r.created_at || 0).getTime(), txt: `${nameOf(r.user_id)} weighed in (${r.recommendation || "?"}) on ${itemOf(r.decision_id)}` });
  for (const o of outcomesA) feed.push({ t: new Date(o.created_at || 0).getTime(), txt: `${nameOf(o.user_id)} logged an outcome on ${itemOf(o.decision_id)}` });
  for (const d of decisionsA) feed.push({ t: new Date(d.created_at || 0).getTime(), txt: `${nameOf(d.user_id)} posted ${itemFor(d)}` });
  const feedRows = feed.filter((e) => e.t > 0).sort((a, b) => b.t - a.t).slice(0, 12)
    .map((e) => `<tr><td style="padding:3px 0;color:#9c9488;white-space:nowrap;">${esc(fmtWhen(e.t))}</td><td style="padding:3px 0 3px 12px;color:#1C1712;">${esc(e.txt)}</td></tr>`).join("");

  const html = `
  <div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1C1712;">
    <p style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#9c9488;">ELEVENELEVEN · WAITLIST</p>
    <p style="font-size:28px;font-weight:700;margin:4px 0 0;">${total} signups</p>
    <p style="font-size:15px;color:#6F665A;margin:2px 0 20px;">${last24} in the last 24 hours</p>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9c9488;margin-bottom:4px;">Joined the beta</p>
    <p style="font-size:20px;font-weight:700;margin:0 0 4px;color:#16a34a;">${converted.length} of ${total} converted</p>
    <p style="font-size:13px;color:#6F665A;margin:0 0 22px;">${converted.length ? esc(converted.map((c) => ((c.first_name || "").trim() || (c.email || ""))).join(", ")) : "none yet"}</p>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9c9488;margin-bottom:4px;">By source</p>
    <table style="font-size:14px;border-collapse:collapse;margin-bottom:22px;">${sourceRows}</table>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9c9488;margin-bottom:6px;">Latest signups</p>
    <table style="font-size:13px;border-collapse:collapse;width:100%;">${latestRows}</table>
    <div style="border-top:1px solid #ECE7DD;margin:28px 0 18px;"></div>
    <p style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#9c9488;">In-app activity</p>
    <p style="font-size:13px;color:#1C1712;margin:6px 0 2px;font-weight:600;">Last 24h: ${delta24Line}</p>
    <p style="font-size:12px;color:#9c9488;margin:0 0 16px;">All time: ${totalsLine}</p>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9c9488;margin-bottom:4px;">Activation funnel</p>
    <table style="font-size:14px;border-collapse:collapse;margin:4px 0 20px;">${funnelRows}</table>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9A3F26;margin-bottom:6px;">Posts needing a weigh-in · cover these (avg ${avgWeigh}/post)</p>
    <table style="font-size:13px;border-collapse:collapse;width:100%;margin-bottom:20px;">${zeroRows}</table>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9c9488;margin-bottom:4px;">Silent accounts · joined, no activity</p>
    <p style="font-size:13px;color:#6F665A;margin:0 0 20px;line-height:1.5;">${silentLine}</p>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9c9488;margin-bottom:6px;">Recent activity</p>
    <table style="font-size:13px;border-collapse:collapse;width:100%;">${feedRows}</table>
  </div>`;

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [DIGEST_TO],
      subject: `waitlist: ${total} signups · ${converted.length} joined`,
      html,
    }),
  });

  if (!send.ok) {
    const detail = await send.text();
    console.error("digest send failed:", send.status, detail);
    return new Response(JSON.stringify({ error: "resend failed", detail }), { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true, total, last24 }), { headers: { "Content-Type": "application/json" } });
});
