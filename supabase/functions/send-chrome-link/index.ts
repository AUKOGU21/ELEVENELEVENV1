// Supabase Edge Function: send-chrome-link
// -----------------------------------------------------------------------------
// "Send it to my laptop." Chrome extensions only install on a computer and most
// people find us on their phone, so /chrome emails them the store link to open
// later. One email, sent because they asked for it. Their address isn't stored,
// only a hash of it, for the limits below.
//
// POST { email }  ->  { ok: true }
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";
const STORE_URL = "https://chromewebstore.google.com/detail/eleveneleven/pooafgjdcbidgcfndaickfojhicljkjj";

// One email per address a day, and a ceiling for the form as a whole, so it can't
// be used to send mail to strangers in bulk.
const MAX_PER_DAY = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const admin = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };

async function hash(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function emailBlocked(email: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/email_blocked`, {
    method: "POST", headers: admin, body: JSON.stringify({ addr: email, transactional: true }),
  }).catch(() => null);
  return r?.ok ? (await r.json().catch(() => false)) === true : false;
}

function render(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>ELEVENELEVEN for Chrome</title>
<style>
html,body{margin:0!important;padding:0!important;width:100%!important;background:#EFEFED;}
table,td{border-collapse:collapse!important;}
body,td,div,p,a,span{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}
@media only screen and (max-width:620px){.container{width:100%!important;}.px{padding-left:26px!important;padding-right:26px!important;}.h1{font-size:27px!important;}}
</style></head><body style="margin:0;padding:0;background:#EFEFED;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">Your ELEVENELEVEN for Chrome link.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFEFED;">
<tr><td align="center" style="padding:40px 14px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;background:#FFFFFF;">
<tr><td align="center" class="px" style="padding:52px 48px 10px;">
  <div style="font-size:13px;font-weight:700;letter-spacing:5px;color:#0A0A0A;text-transform:uppercase;">ELEVENELEVEN</div>
</td></tr>
<tr><td align="center" class="px" style="padding:44px 52px 0;">
  <div class="h1" style="font-size:30px;line-height:1.14;font-weight:700;letter-spacing:-0.5px;color:#0A0A0A;">Here's your link.</div>
</td></tr>
<tr><td align="center" style="padding:30px 48px 52px;">
  <a href="${STORE_URL}" target="_blank"><img src="https://geteleveneleven.com/email/add-to-chrome-button-v3.jpg" width="300" height="60" alt="ADD TO CHROME" style="display:block;margin:0 auto;border:0;width:300px;max-width:100%;height:auto;font-size:13px;font-weight:700;letter-spacing:2px;color:#0A0A0A;"></a>
</td></tr>
<tr><td style="border-top:1px solid #ECECE8;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" class="px" style="padding:22px 48px 30px;font-size:10px;line-height:1.9;letter-spacing:0.8px;color:#9A9A94;text-transform:uppercase;">
You're receiving this one email because you asked us to send you this link.<br>
<a href="mailto:hello@geteleveneleven.com" style="color:#9A9A94;text-decoration:underline;">hello@geteleveneleven.com</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const { email: raw } = await req.json().catch(() => ({}));
    const email = String(raw ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email." }, 400);

    const h = await hash(email);
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const recent = await fetch(
      `${SUPABASE_URL}/rest/v1/events?kind=eq.chrome_link_sent&created_at=gte.${dayAgo}&select=meta&limit=${MAX_PER_DAY}`,
      { headers: admin },
    ).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const rows: { meta?: { h?: string } }[] = Array.isArray(recent) ? recent : [];
    if (rows.length >= MAX_PER_DAY || rows.some((r) => r.meta?.h === h)) return json({ ok: true, throttled: true });
    if (await emailBlocked(email)) return json({ ok: true });
    if (!RESEND_API_KEY) { console.error("no mailer"); return json({ error: "Couldn't send it." }, 500); }

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [email], subject: "Your ELEVENELEVEN for Chrome link", html: render() }),
    });
    if (!send.ok) {
      console.error("resend failed:", send.status, await send.text());
      return json({ error: "Couldn't send it." }, 502);
    }
    await fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: "POST", headers: { ...admin, Prefer: "return=minimal" },
      body: JSON.stringify({ kind: "chrome_link_sent", meta: { h } }),
    }).catch(() => {});
    return json({ ok: true });
  } catch (err) {
    console.error("send-chrome-link:", err);
    return json({ error: "Couldn't send it." }, 500);
  }
});
