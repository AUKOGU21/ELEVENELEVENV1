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
    return `<tr><td style="padding:3px 0;color:#1C1712;">${esc(name)}</td><td style="padding:3px 12px;color:#6F665A;">${esc(r.email || "")}</td><td style="padding:3px 12px;color:#9A3F26;">${esc(src)}</td><td style="padding:3px 0;color:#9c9488;white-space:nowrap;">${esc(when)}</td></tr>`;
  }).join("");

  const html = `
  <div style="font-family:Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1C1712;">
    <p style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#9c9488;">ELEVENELEVEN · WAITLIST</p>
    <p style="font-size:28px;font-weight:700;margin:4px 0 0;">${total} signups</p>
    <p style="font-size:15px;color:#6F665A;margin:2px 0 20px;">${last24} in the last 24 hours</p>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9c9488;margin-bottom:4px;">By source</p>
    <table style="font-size:14px;border-collapse:collapse;margin-bottom:22px;">${sourceRows}</table>
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9c9488;margin-bottom:6px;">Latest signups</p>
    <table style="font-size:13px;border-collapse:collapse;width:100%;">${latestRows}</table>
  </div>`;

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [DIGEST_TO],
      subject: `waitlist: ${total} signups (${last24} in last 24h)`,
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
