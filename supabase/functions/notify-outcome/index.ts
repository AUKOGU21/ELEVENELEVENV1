// Supabase Edge Function: notify-outcome
// -----------------------------------------------------------------------------
// Closes the loop. When the asker logs an outcome on a decision, this emails
// everyone who weighed in: "you helped {asker} decide, here's what happened."
// Called by the app (OutcomeModal.tsx) right after the outcome is saved, with
// { decision_id }. Everything is re-resolved server-side with the service role.
//
// Secrets (reused, nothing new):
//   RESEND_API_KEY  - Resend API key (re_...)
//   SITE_URL        - optional, defaults to https://geteleveneleven.com
//   EMAIL_FROM      - optional, defaults to "ElevenEleven <hello@geteleveneleven.com>"
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Source of truth for the design is emails/outcome-notify.html — keep TEMPLATE in sync.
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://geteleveneleven.com";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";
const UNSUBSCRIBE_URL = "mailto:hello@geteleveneleven.com?subject=Unsubscribe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sb(path: string): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

async function emailFor(userId: string): Promise<string | null> {
  const u = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return u?.email ?? null;
}

function firstName(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t ? t.split(/\s+/)[0] : "she";
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Keep in sync with emails/outcome-notify.html
const TEMPLATE = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>here's what happened</title>
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
      .h1{font-size:32px!important;line-height:1.1!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;height:0;width:0;">
    {{ASKER}} just logged the outcome on the {{ITEM}} you weighed in on.
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
            <td align="center" class="px h1 display" style="padding:8px 48px 8px;font-size:40px;line-height:1.06;font-weight:700;letter-spacing:-1px;color:#100E0C;">
              here's what happened
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:26px 56px 6px;font-size:17px;line-height:1.5;color:#3A3530;">
              Remember the <strong style="font-weight:600;color:#100E0C;">{{ITEM}}</strong> you weighed in on? <strong style="font-weight:600;color:#100E0C;">{{ASKER}}</strong> just logged the outcome.
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:6px 56px 6px;font-size:18px;line-height:1.45;font-weight:600;color:#9A3F26;">
              {{OUTCOME_LINE}}
            </td>
          </tr>
          {{NOTE_BLOCK}}
          <tr>
            <td align="center" style="padding:22px 48px 4px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{SITE_URL}}/feed" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="0%" stroke="f" fillcolor="#CB5A3C">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:2px;">SEE THE OUTCOME</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a class="btn mono" href="{{SITE_URL}}/feed" target="_blank"
                 style="display:inline-block;background:#CB5A3C;color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase;padding:15px 32px;border-radius:0;">
                See the outcome&nbsp;&rarr;
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
              you're getting this because you weighed in on {{ASKER}}'s decision. seeing how it turned out is the whole point.<br>
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const decisionId: string | undefined = payload.decision_id;
  if (!decisionId) return json({ error: "decision_id required" }, 400);

  // Decision + asker
  const decisions = await sb(`decisions?id=eq.${decisionId}&select=user_id,brand_name,product_name`);
  const decision = Array.isArray(decisions) ? decisions[0] : null;
  if (!decision) return json({ skipped: "decision not found" });
  const askerId: string = decision.user_id;

  // Everyone who weighed in (distinct), minus the asker
  const responses = await sb(`responses?decision_id=eq.${decisionId}&select=user_id`);
  const weigherIds = [...new Set((Array.isArray(responses) ? responses : [])
    .map((r: any) => r.user_id).filter((id: string) => id && id !== askerId))];
  if (!weigherIds.length) return json({ skipped: "no weigh-ins to notify" });

  // Outcome details (latest for this decision)
  const outcomes = await sb(`outcomes?decision_id=eq.${decisionId}&select=did_purchase,outcome_type,fit_result_note,outcome_notes,outcome_detail_other&order=created_at.desc&limit=1`);
  const outcome = Array.isArray(outcomes) ? outcomes[0] : null;

  const askerProfs = await sb(`profiles?id=eq.${askerId}&select=display_name`);
  const asker = firstName(Array.isArray(askerProfs) ? askerProfs[0]?.display_name : null);
  const item = [decision.brand_name, decision.product_name].filter(Boolean).join(" ").trim() || "your pick";

  const bought = outcome?.did_purchase === true || outcome?.outcome_type === "bought_it";
  const outcomeLine = bought ? "She bought it." : "She decided to pass.";
  const noteRaw = (outcome?.fit_result_note || outcome?.outcome_notes || outcome?.outcome_detail_other || "").toString().trim();
  const noteBlock = noteRaw
    ? `<tr><td align="center" class="px" style="padding:14px 56px 4px;font-size:15px;line-height:1.6;color:#6F665A;font-style:italic;">&ldquo;${esc(noteRaw)}&rdquo;</td></tr>`
    : "";

  // Dry run: confirm resolution without sending (for testing).
  if (payload.dry) {
    return json({ dry: true, asker, item, outcomeLine, note: noteRaw || null, weighers: weigherIds.length });
  }

  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);

  const html = TEMPLATE
    .replace(/\{\{ASKER\}\}/g, esc(asker))
    .replace(/\{\{ITEM\}\}/g, esc(item))
    .replace(/\{\{OUTCOME_LINE\}\}/g, outcomeLine)
    .replace(/\{\{NOTE_BLOCK\}\}/g, noteBlock)
    .replace(/\{\{SITE_URL\}\}/g, SITE_URL);

  const subject = item === "your pick"
    ? `${asker} closed the loop`
    : `${asker} decided on the ${item} you weighed in on`;

  let sent = 0;
  const results: Record<string, string> = {};
  for (const wid of weigherIds) {
    const to = await emailFor(wid as string);
    if (!to) { results[wid as string] = "no-email"; continue; }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        headers: { "List-Unsubscribe": `<${UNSUBSCRIBE_URL}>` },
      }),
    });
    if (res.ok) { sent++; results[wid as string] = "sent"; }
    else { results[wid as string] = `err-${res.status}`; console.error("resend failed", res.status, await res.text()); }
  }

  console.log("Outcome notifications:", JSON.stringify(results));
  return json({ ok: true, weighers: weigherIds.length, sent });
});
