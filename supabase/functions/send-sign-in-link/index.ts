// Supabase Edge Function: send-sign-in-link
// -----------------------------------------------------------------------------
// "Email me a sign-in link." The way back in for anyone the password has failed:
// she forgot it, or her browser saved a different one than the account holds.
//
// Before this there was no way back at all. No reset, no link. A friend created
// an account, landed back on the form, and Chrome offered her a second strong
// password on top of the first. Six sign-ins failed and nothing on the page could
// help her.
//
// Why not Supabase's own magic link: auth email on this project goes through
// Supabase's default mailer, which is capped at two emails an hour for the whole
// project and arrives from a supabase.io address. So this generates the link with
// the admin API and sends it through Resend, in the same shell as every other
// ElevenEleven email.
//
// It never says whether an address has an account. The answer is the same either
// way, so the form can't be used to find out who's a member.
//
// POST { email }  ->  { ok: true }
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://geteleveneleven.com";
const FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";

// One link a minute and five an hour, per address.
const MIN_GAP_MS = 60_000;
const MAX_PER_HOUR = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return (s || "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;").split('"').join("&quot;");
}
const admin = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };

function render(link: string): string {
  const url = esc(link);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only">
<title>Your sign-in link</title>
<style>
html,body{margin:0!important;padding:0!important;width:100%!important;background:#EFEFED;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse!important;}
a{text-decoration:none;}
body,td,div,p,a,span{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}
@media only screen and (max-width:620px){
 .container{width:100%!important;}
 .px{padding-left:26px!important;padding-right:26px!important;}
 .h1{font-size:27px!important;}
}
</style></head><body style="margin:0;padding:0;background:#EFEFED;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">Tap to sign in. It works for an hour.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFEFED;">
<tr><td align="center" style="padding:40px 14px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;background:#FFFFFF;">
<tr><td align="center" class="px" style="padding:52px 48px 10px;">
  <div style="font-size:13px;font-weight:700;letter-spacing:5px;color:#0A0A0A;text-transform:uppercase;">ELEVENELEVEN</div>
</td></tr>
<tr><td align="center" class="px" style="padding:44px 52px 0;">
  <div class="h1" style="font-size:30px;line-height:1.14;font-weight:700;letter-spacing:-0.5px;color:#0A0A0A;">Here's your way in.</div>
  <div style="font-size:14.5px;line-height:1.6;color:#3A3A36;padding-top:14px;">Tap below to sign in. The link works once, for an hour.</div>
</td></tr>
<tr><td align="center" style="padding:30px 48px 52px;">
  <a href="${url}" target="_blank" style="font-size:12px;font-weight:700;letter-spacing:2.4px;color:#0A0A0A;text-transform:uppercase;text-decoration:underline;">Sign in&nbsp;&rarr;</a>
</td></tr>
<tr><td style="border-top:1px solid #ECECE8;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" class="px" style="padding:22px 48px 30px;font-size:10px;line-height:1.9;letter-spacing:0.8px;color:#9A9A94;text-transform:uppercase;">
You're receiving this because someone asked to sign in with this address. If it wasn't you, ignore it.<br>
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

    // Throttle before anything else, so the limit holds whether or not the
    // address belongs to anyone.
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const recent = await fetch(
      `${SUPABASE_URL}/rest/v1/sign_in_link_requests?email=eq.${encodeURIComponent(email)}` +
        `&created_at=gte.${hourAgo}&select=created_at&order=created_at.desc`,
      { headers: admin },
    ).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const rows: { created_at: string }[] = Array.isArray(recent) ? recent : [];
    const tooSoon = rows.length > 0 && Date.now() - new Date(rows[0].created_at).getTime() < MIN_GAP_MS;
    if (tooSoon || rows.length >= MAX_PER_HOUR) return json({ ok: true, throttled: true });

    const logged = await fetch(`${SUPABASE_URL}/rest/v1/sign_in_link_requests`, {
      method: "POST",
      headers: { ...admin, Prefer: "return=representation" },
      body: JSON.stringify({ email }),
    }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const requestId = Array.isArray(logged) ? logged[0]?.id : null;

    // Only ever sign in an account that already exists. A link must never be
    // the thing that creates one.
    const userId = await fetch(`${SUPABASE_URL}/rest/v1/rpc/user_id_for_email`, {
      method: "POST", headers: admin, body: JSON.stringify({ p_email: email }),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!userId) return json({ ok: true });

    const redirectTo = `${SITE}/feed`;
    const gen = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/generate_link?redirect_to=${encodeURIComponent(redirectTo)}`,
      { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email, redirect_to: redirectTo }) },
    );
    if (!gen.ok) {
      console.error("generate_link failed:", gen.status, await gen.text());
      return json({ ok: true });
    }
    const g = await gen.json();
    const link: string | undefined = g?.action_link ?? g?.properties?.action_link;
    if (!link || !RESEND_API_KEY) {
      console.error("no link or no mailer", !!link, !!RESEND_API_KEY);
      return json({ ok: true });
    }

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [email], subject: "Your sign-in link", html: render(link) }),
    });
    if (!send.ok) {
      console.error("resend failed:", send.status, await send.text());
      return json({ ok: true });
    }

    if (requestId) {
      await fetch(`${SUPABASE_URL}/rest/v1/sign_in_link_requests?id=eq.${requestId}`, {
        method: "PATCH", headers: { ...admin, Prefer: "return=minimal" }, body: JSON.stringify({ sent: true }),
      }).catch(() => {});
    }
    return json({ ok: true });
  } catch (err) {
    console.error("send-sign-in-link:", err);
    return json({ ok: true });
  }
});
