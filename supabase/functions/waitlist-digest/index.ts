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

  // In-app activity (actions in the beta app)
  const accounts = joined.size;
  const [onboarded, decisionsN, weighins, outcomesN, votesN, savesN] = await Promise.all([
    tableCount("profiles?select=id&onboarding_completed=eq.true"),
    tableCount("decisions?select=id"),
    tableCount("responses?select=id"),
    tableCount("outcomes?select=id"),
    tableCount("response_votes?select=id"),
    tableCount("saved_decisions?select=id"),
  ]);
  let recentDecisions: any[] = [];
  try {
    const rd = await fetch(
      `${SUPABASE_URL}/rest/v1/decisions?select=brand_name,product_name,confidence_score,created_at,profiles(display_name)&order=created_at.desc&limit=5`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    recentDecisions = await rd.json();
    if (!Array.isArray(recentDecisions)) recentDecisions = [];
  } catch { /* ignore */ }

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

  const activityStats = [
    ["Beta accounts", `${accounts} (onboarded ${onboarded})`],
    ["Decisions posted", `${decisionsN}`],
    ["Weigh-ins", `${weighins}`],
    ["Outcomes logged", `${outcomesN}`],
    ["Helpful votes", `${votesN}`],
    ["Saves", `${savesN}`],
  ].map(([k, v]) => `<tr><td style="padding:2px 0;color:#6F665A;">${esc(k)}</td><td style="padding:2px 0 2px 16px;font-weight:600;color:#1C1712;">${esc(v)}</td></tr>`).join("");

  const decRows = recentDecisions.map((d: any) => {
    const who = (d.profiles?.display_name || "").trim() || "—";
    const item = [d.brand_name, d.product_name].filter(Boolean).join(" ") || "(item)";
    const when = d.created_at
      ? new Date(d.created_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "";
    const conf = d.confidence_score != null ? `${d.confidence_score}/10` : "";
    return `<tr><td style="padding:3px 0;color:#1C1712;">${esc(who)}</td><td style="padding:3px 12px;color:#6F665A;">${esc(item)}</td><td style="padding:3px 12px;color:#9A3F26;">${esc(conf)}</td><td style="padding:3px 0;color:#9c9488;white-space:nowrap;">${esc(when)}</td></tr>`;
  }).join("") || `<tr><td style="padding:3px 0;color:#9c9488;">no decisions posted yet</td></tr>`;

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
    <table style="font-size:14px;border-collapse:collapse;margin:8px 0 22px;">${activityStats}</table>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9c9488;margin-bottom:6px;">Recent decisions posted</p>
    <table style="font-size:13px;border-collapse:collapse;width:100%;">${decRows}</table>
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
