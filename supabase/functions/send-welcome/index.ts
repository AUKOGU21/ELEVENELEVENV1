// Supabase Edge Function: send-welcome
// -----------------------------------------------------------------------------
// Sends the ElevenEleven welcome email via Resend the moment a beta user
// confirms their account. Wired to a Database Webhook on `auth.users`
// (events: INSERT + UPDATE). It fires exactly once — at the confirmation
// transition (email_confirmed_at goes from null -> set).
//
// Secrets (set with `supabase secrets set ...`, never hard-coded):
//   RESEND_API_KEY    - Resend API key (re_...)
//   HERO_IMAGE_URL    - public https URL of the hero graphic
//   WEBHOOK_SECRET    - shared secret; must match the webhook's Authorization header
//   SITE_URL          - optional, defaults to https://geteleveneleven.com
//   EMAIL_FROM        - optional, defaults to "ElevenEleven <hello@geteleveneleven.com>"
//
// Source of truth for the design is emails/welcome.html — keep TEMPLATE in sync.
// -----------------------------------------------------------------------------

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const HERO_IMAGE_URL = Deno.env.get("HERO_IMAGE_URL") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://geteleveneleven.com";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";
const UNSUBSCRIBE_URL = "mailto:hello@geteleveneleven.com?subject=Unsubscribe";

const SUBJECT = "welcome to the no-guess list";

function renderEmail(): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${SUBJECT}</title>
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
      .h1{font-size:30px!important;line-height:1.12!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;height:0;width:0;">
    welcome to the no-guess list — one step closer to confident decision-making.
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
            <td align="center" class="px h1 display" style="padding:8px 48px 8px;font-size:38px;line-height:1.08;font-weight:700;letter-spacing:-1px;color:#100E0C;">
              welcome to the<br>no&#8209;guess&nbsp;list
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:30px 0 30px;">
              <a href="${SITE_URL}" target="_blank" style="text-decoration:none;">
                <img src="${HERO_IMAGE_URL}" width="600" alt="ElevenEleven — Stop guessing. Start shopping with confidence." style="width:100%;max-width:600px;height:auto;display:block;background:#e9e6e0;">
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" class="px display" style="padding:6px 56px 0;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.4px;color:#100E0C;">
              you're one step closer to confident decision&#8209;making.
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:14px 64px 0;font-size:15px;line-height:1.6;color:#6F665A;">
              no more guessing, no more generic reviews. just real outcomes from people who share your body, your taste, and your standards.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:34px 48px 8px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${SITE_URL}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="0%" stroke="f" fillcolor="#CB5A3C">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:2px;">SHOP WITH CONFIDENCE</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a class="btn mono" href="${SITE_URL}" target="_blank"
                 style="display:inline-block;background:#CB5A3C;color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase;padding:17px 38px;border-radius:0;">
                Shop with confidence&nbsp;&rarr;
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
              you're receiving this because you signed up for ElevenEleven.<br>
              questions? <a href="mailto:hello@geteleveneleven.com" style="color:#b3ab9e;text-decoration:underline;">hello@geteleveneleven.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Verify the shared secret so randoms can't trigger sends against this URL.
  if (WEBHOOK_SECRET) {
    const auth = req.headers.get("authorization") ?? req.headers.get("x-webhook-secret") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const record = payload.record ?? payload;
  const oldRecord = payload.old_record ?? null;
  const email: string | undefined = record?.email;

  if (!email) return json({ skipped: "no email on record" });

  // Fire exactly once: only at the moment the account becomes confirmed.
  const justConfirmed =
    !!record.email_confirmed_at && (!oldRecord || !oldRecord.email_confirmed_at);
  if (!justConfirmed) return json({ skipped: "not a confirmation transition" });

  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: SUBJECT,
      html: renderEmail(),
      headers: { "List-Unsubscribe": `<${UNSUBSCRIBE_URL}>` },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Resend send failed:", res.status, detail);
    return json({ error: "resend failed", status: res.status, detail }, 502);
  }

  const data = await res.json();
  console.log("Welcome email sent:", email, data?.id);
  return json({ ok: true, id: data?.id });
});
