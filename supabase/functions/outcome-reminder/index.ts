// Supabase Edge Function: outcome-reminder
// -----------------------------------------------------------------------------
// Nudges a user to log the outcome of a decision they posted but never closed.
// Triggered by a daily pg_cron job. For every decision that is still `open`,
// older than REMINDER_DAYS (default 5), and not yet reminded, it emails the
// owner and stamps `outcome_reminded_at` so they're never reminded twice.
//
// Secrets (reuses the welcome/digest pipeline, only REMINDER_SECRET is new):
//   RESEND_API_KEY    - Resend API key (re_...)
//   REMINDER_SECRET   - shared secret; must match the cron job's Authorization header
//   REMINDER_DAYS     - optional, days to wait before nudging (default 5)
//   SITE_URL          - optional, defaults to https://geteleveneleven.com
//   EMAIL_FROM        - optional, defaults to "ElevenEleven <hello@geteleveneleven.com>"
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Requires a `outcome_reminded_at timestamptz` column on public.decisions.
// Source of truth for the design is emails/outcome-reminder.html.
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REMINDER_SECRET = Deno.env.get("REMINDER_SECRET") ?? "";
const REMINDER_DAYS = Number(Deno.env.get("REMINDER_DAYS") ?? "5");
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://geteleveneleven.com";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";
const UNSUBSCRIBE_URL = "mailto:hello@geteleveneleven.com?subject=Unsubscribe";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Keep in sync with emails/outcome-reminder.html
const TEMPLATE = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>how did it go?</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=Spline+Sans+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    html,body{margin:0!important;padding:0!important;width:100%!important;background:#ffffff;}
    *{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse!important;}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;display:block;}
    a{text-decoration:none;}
    body,td,div,p,a{font-family:'Hanken Grotesk',Helvetica,Arial,sans-serif;}
    .display{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}
    .mono{font-family:'Spline Sans Mono','Courier New',monospace;}
    .btn:hover{background:#9A3F26!important;}
    @media only screen and (max-width:620px){
      .container{width:100%!important;}
      .px{padding-left:24px!important;padding-right:24px!important;}
      .h1{font-size:34px!important;line-height:1.08!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;height:0;width:0;">
    did you decide on {{ITEM}}? log the outcome.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;background:#ffffff;">
          <tr>
            <td align="center" class="px" style="padding:8px 48px 36px;">
              <span class="mono" style="font-size:13px;letter-spacing:6px;color:#100E0C;text-transform:uppercase;">ELEVENELEVEN</span>
            </td>
          </tr>
          <tr>
            <td align="center" class="px h1 display" style="padding:8px 48px 8px;font-size:42px;line-height:1.05;font-weight:700;letter-spacing:-1px;color:#100E0C;">
              how did it go?
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:26px 56px 8px;font-size:17px;line-height:1.5;color:#3A3530;">
              you were deciding on {{ITEM}} a few days ago. did you buy it? did it work out?
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:0 56px 28px;font-size:15px;line-height:1.6;color:#6F665A;">
              log the outcome and close the loop. it sharpens what your mirrors see next time.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:6px 48px 4px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{SITE_URL}}/feed" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="0%" stroke="f" fillcolor="#CB5A3C">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:2px;">LOG YOUR OUTCOME</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a class="btn mono" href="{{SITE_URL}}/feed" target="_blank"
                 style="display:inline-block;background:#CB5A3C;color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase;padding:15px 32px;border-radius:0;">
                Log your outcome&nbsp;&rarr;
              </a>
              <!--<![endif]-->
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:42px 48px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="border-top:1px solid #ECE7DD;font-size:0;line-height:0;">&nbsp;</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td align="center" class="px mono" style="padding:22px 48px 8px;font-size:10px;letter-spacing:2px;color:#9c9488;text-transform:uppercase;line-height:1.8;">
              The Trust Layer For Online Decision Making
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:0 48px 36px;font-size:11px;line-height:1.7;color:#b3ab9e;">
              you're getting this because you posted a decision on ElevenEleven.<br>
              questions? <a href="mailto:hello@geteleveneleven.com" style="color:#b3ab9e;text-decoration:underline;">hello@geteleveneleven.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

Deno.serve(async (req) => {
  // Gate so randoms can't trigger sends against this URL.
  if (REMINDER_SECRET) {
    const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (auth !== REMINDER_SECRET) return json({ error: "unauthorized" }, 401);
  }
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);

  const cutoff = new Date(Date.now() - REMINDER_DAYS * 86_400_000).toISOString();

  // Decisions still open, old enough, not yet reminded, not deleted.
  const q = `decisions?select=id,user_id,brand_name,product_name` +
    `&status=eq.open&deleted_at=is.null&outcome_reminded_at=is.null` +
    `&created_at=lte.${cutoff}&order=created_at.asc&limit=200`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("decisions query failed:", res.status, detail);
    return json({ error: "query failed", detail }, 502);
  }
  const decisions: any[] = await res.json();
  if (!decisions.length) return json({ ok: true, sent: 0, note: "nothing due" });

  // Cache owner emails so two decisions by the same user share one lookup.
  const emailCache = new Map<string, string | null>();
  async function ownerEmail(userId: string): Promise<string | null> {
    if (emailCache.has(userId)) return emailCache.get(userId)!;
    const u = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const email = u?.email ?? null;
    emailCache.set(userId, email);
    return email;
  }

  let sent = 0, skipped = 0;
  for (const d of decisions) {
    const email = await ownerEmail(d.user_id);
    if (!email) { skipped++; continue; }

    const item = [d.brand_name, d.product_name].filter(Boolean).join(" ").trim() || "your pick";
    const html = TEMPLATE
      .replace(/\{\{ITEM\}\}/g, esc(item))
      .replace(/\{\{SITE_URL\}\}/g, SITE_URL);
    const subject = item === "your pick" ? "how did your pick turn out?" : `how did ${item} turn out?`;

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM, to: [email], subject, html,
        headers: { "List-Unsubscribe": `<${UNSUBSCRIBE_URL}>` },
      }),
    });
    if (!send.ok) {
      console.error("send failed for", d.id, send.status, await send.text());
      skipped++;
      continue;
    }

    // Stamp so this decision is never reminded again.
    await fetch(`${SUPABASE_URL}/rest/v1/decisions?id=eq.${d.id}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json", Prefer: "return=minimal",
      },
      body: JSON.stringify({ outcome_reminded_at: new Date().toISOString() }),
    });
    sent++;
  }

  console.log(`outcome-reminder: sent ${sent}, skipped ${skipped}, candidates ${decisions.length}`);
  return json({ ok: true, sent, skipped, candidates: decisions.length });
});
