// Supabase Edge Function: notify
// -----------------------------------------------------------------------------
// One place that turns an event into (a) an in-app notification row, which the
// bell reads and whose insert trigger fires the push, and (b) an email.
//
// The copy lives in EVENTS below and nowhere else. The email subject IS the push
// title and the email's one line IS the push body, so the inbox and the phone
// can never drift apart.
//
// Everyone gets the email, push or no push. That is deliberate: only a handful
// of women have push enabled, so email is the channel that actually arrives.
//
// POST { type, user_id, data: { name, item, tier, actor_id, decision_id } }
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://geteleveneleven.com";
const FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";
const UNSUB = "mailto:hello@geteleveneleven.com?subject=Unsubscribe";

const CHERRY = SITE + "/email/cherry-faded.jpg";
const LEGS = SITE + "/email/legs-faded.jpg";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return (s || "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}

interface Event {
  hero?: string;          // photograph behind the words; absent means plain white
  subject: string;
  head: string;
  sub: string;
  cta: string;
  path: string;
  foot: string;
  push: string;
}

export const EVENTS: Record<string, Event> = {
  follow: {
    hero: CHERRY,
    subject: "Someone has good taste",
    head: "Someone has good taste.",
    sub: "{name} just followed you on ELEVENELEVEN.",
    cta: "See {name}", path: "/profile/{actor_id}",
    foot: "You're receiving this because someone followed you",
    push: "{name} just followed you. Tap to see {name}.",
  },
  tier: {
    hero: LEGS,
    subject: "New tier: {tier}",
    head: "You're now a {tier}.",
    sub: "Keep sharing what you know.",
    cta: "See your profile", path: "/profile",
    foot: "You're receiving this because women found your takes helpful",
    push: "You're now a {tier}. Keep sharing what you know.",
  },
  weigh_in: {
    subject: "{name} weighed in",
    head: "{name} weighed in.",
    sub: "On your {item}.",
    cta: "See what she said", path: "/feed",
    foot: "You're receiving this because you posted a decision",
    push: "{name} weighed in on your {item}. Tap to read it.",
  },
  comment: {
    subject: "{name} commented",
    head: "{name} commented.",
    sub: "On your {item}.",
    cta: "See the comment", path: "/feed",
    foot: "You're receiving this because you posted a decision",
    push: "{name} commented on your {item}. Tap to read it.",
  },
  comment_thread: {
    subject: "{name} commented too",
    head: "{name} commented too.",
    sub: "On {item}.",
    cta: "See the thread", path: "/feed",
    foot: "You're receiving this because you commented",
    push: "{name} also commented on {item}. Tap to read it.",
  },
  reply: {
    subject: "{name} replied",
    head: "{name} replied.",
    sub: "To your take on {item}.",
    cta: "See the reply", path: "/feed",
    foot: "You're receiving this because you weighed in",
    push: "{name} replied to your take on {item}. Tap to read it.",
  },
  relevant: {
    subject: "{name} needs your take",
    head: "{name} needs your take.",
    sub: "She's deciding on {item} and nobody has answered yet.",
    cta: "Weigh in", path: "/feed",
    foot: "You're receiving this because you know this category",
    push: "{name} needs your take on {item}. Tap to weigh in.",
  },
  outcome: {
    subject: "{name} closed the loop",
    head: "{name} closed the loop.",
    sub: "She shared what she decided on {item}.",
    cta: "See the outcome", path: "/feed",
    foot: "You're receiving this because you weighed in",
    push: "{name} shared what she decided. Tap to see the outcome.",
  },
  recommendation: {
    subject: "{name} sent you a pick",
    head: "{name} sent you a pick.",
    sub: "For {item}.",
    cta: "See the rec", path: "/feed",
    foot: "You're receiving this because you asked the community",
    push: "{name} sent you a pick for {item}. Tap to see it.",
  },
  follow_post: {
    subject: "{name} posted",
    head: "{name} posted.",
    sub: "She's deciding on {item}.",
    cta: "See the decision", path: "/feed",
    foot: "You're receiving this because you follow her",
    push: "{name} posted {item}. Tap to see it.",
  },
};

function fill(tpl: string, v: Record<string, string>): string {
  let out = tpl;
  for (const k of Object.keys(v)) out = out.split("{" + k + "}").join(v[k]);
  return out;
}

function render(e: Event, v: Record<string, string>): string {
  const head = esc(fill(e.head, v));
  const sub = esc(fill(e.sub, v));
  const cta = esc(fill(e.cta, v));
  const url = SITE + fill(e.path, v);
  const subject = esc(fill(e.subject, v));

  const body = e.hero
    ? `<tr><td background="${e.hero}" bgcolor="#F5F4F2" valign="top" align="center" class="hero px" height="750"
         style="background-image:url('${e.hero}');background-size:cover;background-position:center top;background-repeat:no-repeat;background-color:#F5F4F2;height:750px;padding:64px 44px 0;">
         <!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:750px;">
         <v:fill type="frame" src="${e.hero}" color="#F5F4F2" /><v:textbox inset="0,0,0,0"><![endif]-->
         <div style="font-size:13px;font-weight:700;letter-spacing:5px;color:#0A0A0A;text-transform:uppercase;padding-bottom:44px;">ELEVENELEVEN</div>
         <div class="h1" style="font-size:32px;line-height:1.12;font-weight:700;letter-spacing:-0.5px;color:#0A0A0A;">${head}</div>
         <div style="font-size:14.5px;line-height:1.6;color:#3A3A36;padding-top:14px;">${sub}</div>
         <div style="padding-top:30px;"><a href="${url}" target="_blank" style="font-size:12px;font-weight:700;letter-spacing:2.4px;color:#0A0A0A;text-transform:uppercase;text-decoration:underline;">${cta}&nbsp;&rarr;</a></div>
         <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
       </td></tr>`
    : `<tr><td align="center" class="px" style="padding:52px 48px 10px;">
         <div style="font-size:13px;font-weight:700;letter-spacing:5px;color:#0A0A0A;text-transform:uppercase;">ELEVENELEVEN</div>
       </td></tr>
       <tr><td align="center" class="px" style="padding:44px 52px 0;">
         <div class="h1" style="font-size:30px;line-height:1.14;font-weight:700;letter-spacing:-0.5px;color:#0A0A0A;">${head}</div>
         <div style="font-size:14.5px;line-height:1.6;color:#3A3A36;padding-top:14px;">${sub}</div>
       </td></tr>
       <tr><td align="center" style="padding:30px 48px 52px;">
         <a href="${url}" target="_blank" style="font-size:12px;font-weight:700;letter-spacing:2.4px;color:#0A0A0A;text-transform:uppercase;text-decoration:underline;">${cta}&nbsp;&rarr;</a>
       </td></tr>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only">
<title>${subject}</title>
<style>
html,body{margin:0!important;padding:0!important;width:100%!important;background:#EFEFED;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse!important;}
img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;display:block;}
a{text-decoration:none;}
body,td,div,p,a,span{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}
@media only screen and (max-width:620px){
 .container{width:100%!important;}
 .px{padding-left:26px!important;padding-right:26px!important;}
 .h1{font-size:27px!important;}
 .hero{padding-top:52px!important;height:auto!important;padding-bottom:78%!important;}
}
</style></head><body style="margin:0;padding:0;background:#EFEFED;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${sub}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFEFED;">
<tr><td align="center" style="padding:40px 14px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;background:#FFFFFF;">
${body}
<tr><td style="border-top:1px solid #ECECE8;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" class="px" style="padding:22px 48px 30px;font-size:10px;line-height:1.9;letter-spacing:0.8px;color:#9A9A94;text-transform:uppercase;">
${esc(e.foot)}<br>
<a href="mailto:hello@geteleveneleven.com" style="color:#9A9A94;text-decoration:underline;">hello@geteleveneleven.com</a>
&nbsp;&middot;&nbsp;<a href="${UNSUB}" style="color:#9A9A94;text-decoration:underline;">Unsubscribe</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const payload = await req.json().catch(() => ({}));
    const { type, user_id, data = {}, decision_id = null, skip_email = false } = payload;
    const e = EVENTS[type as string];
    if (!e) return json({ error: "unknown type: " + type }, 400);
    if (!user_id) return json({ error: "user_id required" }, 400);

    // Resolve the actor's name from their profile when we're given an id, so the
    // copy is always the real person and the client can't set it.
    let resolved: string | null = null;
    if (data.actor_id) {
      const prof = await fetch(
        SUPABASE_URL + "/rest/v1/profiles?id=eq." + data.actor_id + "&select=display_name",
        { headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY } },
      ).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const full = prof?.[0]?.display_name ?? "";
      resolved = full.trim() ? full.trim().split(" ")[0] : null;
    }

    const v: Record<string, string> = {
      name: resolved ?? data.name ?? data.actor_name ?? "Someone",
      item: data.item ?? "your decision",
      tier: data.tier ?? "Contributor",
      actor_id: data.actor_id ?? "",
    };

    // In-app row. Its insert trigger fires the push, which reads the same copy.
    await fetch(SUPABASE_URL + "/rest/v1/notifications", {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id, type, decision_id,
        // push_title / push_body ride along so send-push renders the exact same
        // words as the email without keeping its own copy of the map.
        data: {
          ...data,
          actor_name: v.name,
          item: v.item,
          push_title: fill(e.subject, v),
          push_body: fill(e.push, v),
          url: SITE + fill(e.path, v),
        },
        email_sent: !skip_email,
      }),
    }).catch((err) => console.error("notification insert failed:", err));

    if (skip_email || !RESEND_API_KEY) return json({ ok: true, emailed: false });

    const u = await fetch(SUPABASE_URL + "/auth/v1/admin/users/" + user_id, {
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const to = u?.email;
    if (!to) return json({ ok: true, emailed: false, note: "no email on file" });

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [to],
        subject: fill(e.subject, v),
        html: render(e, v),
        headers: { "List-Unsubscribe": "<" + UNSUB + ">" },
      }),
    });
    if (!send.ok) {
      const detail = await send.text();
      console.error("resend failed:", send.status, detail);
      return json({ ok: true, emailed: false, error: detail }, 200);
    }
    return json({ ok: true, emailed: true, to });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
