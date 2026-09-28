// Supabase Edge Function: check-in
// -----------------------------------------------------------------------------
// Keeps asking, kindly, until she closes the loop. Replaces outcome-reminder,
// which emailed once at five days and never again.
//
// Daily (pg_cron). For every open post that has advice (a weigh-in, or a rec on
// a Looking For), counted from when the first advice arrived:
//   step 1 at  3 days  "Ayan + Kimia want the verdict"
//   step 2 at 10 days  "Still deciding on the Salomons?"
//   step 3 at 21 days  "So... what happened with the Salomons?"  (the last ask)
// It stops the moment she answers: Bought and Passed close the post, and a
// Still deciding tap (outcomes.still_deciding_at) ends the check-ins too.
// A post that is already past several steps gets only the latest one, so the
// backlog doesn't arrive as a burst. One check-in per person per day, the post
// with the most advice first. Push when she has a working device, email when not.
// Every ask names the women who helped and carries one-tap answers:
//   /feed?open=<id>&close=bought|passed|deciding|found
//
// Test: POST { "test_decision_id": "<uuid>", "step": 1-3, "channels": ["push","email"] }
// sends that step to the post's owner now and records nothing.
// Dry run: POST { "dry_run": true } lists what today's run would send.
//
// Secrets: RESEND_API_KEY, REMINDER_SECRET (the cron's bearer), PUSH_HOOK_SECRET,
// SITE_URL (optional), EMAIL_FROM (optional). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected. The email template lives in this file.
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SECRET = Deno.env.get("REMINDER_SECRET") ?? "";
const PUSH_SECRET = Deno.env.get("PUSH_HOOK_SECRET") ?? "";
const SITE = Deno.env.get("SITE_URL") ?? "https://geteleveneleven.com";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";
const UNSUB = "mailto:hello@geteleveneleven.com?subject=Unsubscribe";

const STEP_DAYS = [3, 10, 21];
const MIN_GAP_DAYS = 4; // never two check-ins on one post closer than this
const DAY = 86_400_000;

type Candidate = {
  decision_id: string; owner_id: string; owner_email: string; owner_first: string | null;
  post_type: string | null; product_name: string | null; brand_name: string | null;
  lf_title: string | null; product_image_url: string | null;
  first_advice_at: string; advice_count: number; helper_names: string[];
  last_step: number | null; last_sent_at: string | null; has_push: boolean;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

// ── Words ────────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function cleanBrand(b: string): string {
  const spaced = b.replace(/[-_]+/g, " ").trim();
  return spaced === spaced.toLowerCase() || spaced === spaced.toUpperCase() ? titleCase(spaced) : spaced;
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max).replace(/\s+\S*$/, "");
  return cut.replace(/\s+(in|and|&|from|with|for|of|the|-)$/i, "");
}

// "JENDI TORTOISE CROCODILE" + "STEVEMADDEN" -> "Stevemadden Jendi Tortoise Crocodile"
// "Asics Gel-1130 in Black & Cream from Revolve.com" -> "Asics Gel-1130 in Black & Cream"
function itemName(c: Candidate): string {
  if (c.post_type === "looking_for") {
    // Her own words, read into a sentence: "Still looking for ballet style flats?"
    let t = (c.lf_title ?? "").replace(/[.\s]+$/, "").trim();
    const words = t.split(/\s+/);
    const titled = words.filter((w) => /^\p{Lu}/u.test(w)).length > words.length / 2;
    t = titled ? t.toLowerCase() : t.charAt(0).toLowerCase() + t.slice(1);
    return clip(t, 40);
  }
  let name = (c.product_name ?? "").replace(/\([^)]*\)/g, "").replace(/\s+from\s+\S+$/i, "").replace(/\s*-{2,}\s*/g, " ").trim();
  if (name && name === name.toUpperCase()) name = titleCase(name);
  const brand = c.brand_name ? cleanBrand(c.brand_name) : "";
  if (brand && name.split(/\s+/).length <= 3 && !name.toLowerCase().startsWith(brand.toLowerCase().split(" ")[0])) {
    name = `${brand} ${name.replace(/^the\s+/i, "")}`;
  }
  return clip(name || brand || "post", 36);
}

// "Mary Janes", "flats", "jeans" read as them; "cardigan", "XT-4 OG" as it.
function pronoun(item: string): "it" | "them" {
  const last = item.split(/\s+/).pop() ?? "";
  return /[a-z]s$/i.test(last) && !/ss$/i.test(last) ? "them" : "it";
}

// Whoever weighed in or sent recs: "Ayan", "Ayan + Kimia", "Ayan, Ebony + Sarah".
function whoList(names: string[]): { text: string; plural: boolean } {
  const n = names.filter(Boolean);
  if (n.length === 0) return { text: "Your mirrors", plural: true };
  if (n.length === 1) return { text: n[0], plural: false };
  if (n.length === 2) return { text: `${n[0]} + ${n[1]}`, plural: true };
  if (n.length === 3) return { text: `${n[0]}, ${n[1]} + ${n[2]}`, plural: true };
  return { text: `${n[0]}, ${n[1]} + ${n.length - 2} others`, plural: true };
}

type Copy = { title: string; body: string };

function copyFor(c: Candidate, step: number): Copy {
  const lf = c.post_type === "looking_for";
  const item = itemName(c);
  const it = pronoun(item);
  const who = whoList(c.helper_names);
  if (lf) {
    switch (step) {
      case 1: return { title: `${who.text} gave you some options`, body: "Did one make the cut?" };
      case 2: return { title: `Still looking for ${item}?`, body: "Your mirrors want to know what you ended up choosing." };
      default: return { title: `So... did you find the ${item}?`, body: `Found ${it}, still looking, or changed your mind? Last ask, promise.` };
    }
  }
  switch (step) {
    case 1: return { title: `${who.text} ${who.plural ? "want" : "wants"} the verdict`, body: `Did you buy the ${item}?` };
    case 2: return { title: `Still deciding on the ${item}?`, body: "Your mirrors want to know what happened." };
    default: return { title: `So... what happened with the ${item}?`, body: `Bought ${it}, passed, or still deciding? Last ask, promise.` };
  }
}

function link(c: Candidate, close?: string): string {
  return `${SITE}/feed?open=${c.decision_id}${close ? `&close=${close}` : ""}`;
}

// ── Email ────────────────────────────────────────────────────────────────────────────────────────────

function button(label: string, href: string): string {
  return `<tr><td align="center" style="padding:0 0 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:320px;">
              <tr><td align="center" bgcolor="#FFFFFF" style="border:2px solid #0A0A0A;">
                <a href="${href}" target="_blank" style="display:block;padding:17px 0;font-size:14px;font-weight:700;letter-spacing:3px;color:#0A0A0A;text-transform:uppercase;text-decoration:none;">${label}</a>
              </td></tr>
            </table>
          </td></tr>`;
}

function renderEmail(c: Candidate, copy: Copy): string {
  const lf = c.post_type === "looking_for";
  const buttons = lf
    ? button("Found it", link(c, "found")) + button("Still looking", link(c, "deciding"))
    : button("Bought it", link(c, "bought")) + button("Passed", link(c, "passed")) + button("Still deciding", link(c, "deciding"));
  const image = c.product_image_url
    ? `<tr><td align="center" class="px" style="padding:0 40px 40px;">
              <a href="${link(c)}" target="_blank"><img src="${esc(c.product_image_url)}" width="300" alt="${esc(itemName(c))}" style="width:100%;max-width:300px;height:auto;display:block;background:#F4F4F2;"></a>
            </td></tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${esc(copy.title)}</title>
  <style>
    html,body{margin:0!important;padding:0!important;width:100%!important;background:#EFEFED;}
    table,td{border-collapse:collapse!important;}
    img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;display:block;}
    a{text-decoration:none;}
    body,td,div,p,a,span{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}
    @media only screen and (max-width:620px){
      .container{width:100%!important;}
      .px{padding-left:22px!important;padding-right:22px!important;}
      .mark{font-size:24px!important;letter-spacing:5px!important;}
      .h2{font-size:19px!important;letter-spacing:1.5px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#EFEFED;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(copy.body)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFEFED;">
    <tr><td align="center" style="padding:34px 14px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;background:#FFFFFF;">
        <tr><td align="center" class="px" style="padding:46px 40px 34px;">
          <span class="mark" style="font-size:28px;line-height:1;font-weight:700;letter-spacing:7px;color:#0A0A0A;text-transform:uppercase;">ELEVENELEVEN</span>
        </td></tr>
        ${image}
        <tr><td align="center" class="px h2" style="padding:0 48px;font-size:22px;line-height:1.25;font-weight:700;letter-spacing:2px;color:#0A0A0A;text-transform:uppercase;">
          ${esc(copy.title)}
        </td></tr>
        <tr><td align="center" class="px" style="padding:22px 56px 34px;font-size:12px;line-height:2;font-weight:500;letter-spacing:1.2px;color:#0A0A0A;text-transform:uppercase;">
          ${esc(copy.body)}
        </td></tr>
        <tr><td class="px" style="padding:0 48px 42px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${buttons}</table>
        </td></tr>
        <tr><td style="border-top:1px solid #E4E4E1;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td align="center" class="px" style="padding:26px 48px 40px;font-size:10px;line-height:2;letter-spacing:0.8px;color:#8E8E88;text-transform:uppercase;">
          You're receiving this because you posted on ElevenEleven<br>
          <a href="mailto:hello@geteleveneleven.com" style="color:#8E8E88;text-decoration:underline;">hello@geteleveneleven.com</a>
          &nbsp;&middot;&nbsp;
          <a href="${UNSUB}" style="color:#8E8E88;text-decoration:underline;">Unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Sending ──────────────────────────────────────────────────────────────────

async function sendPush(c: Candidate, copy: Copy): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", "x-push-secret": PUSH_SECRET },
    body: JSON.stringify({ user_id: c.owner_id, title: copy.title, body: copy.body, url: link(c), notification_id: `checkin-${c.decision_id}` }),
  });
  const d = await r.json().catch(() => ({}));
  return r.ok && (d?.sent ?? 0) > 0;
}

async function sendEmail(c: Candidate, copy: Copy): Promise<boolean> {
  if (!RESEND_API_KEY || !c.owner_email) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM, to: [c.owner_email], subject: copy.title, html: renderEmail(c, copy),
      headers: { "List-Unsubscribe": `<${UNSUB}>` },
    }),
  });
  if (!r.ok) console.error("check-in email failed:", c.decision_id, r.status, await r.text());
  return r.ok;
}

// The latest step she's due, or null. Skips steps already past so an old post
// gets one check-in, not a burst.
function dueStep(c: Candidate, now: number): number | null {
  const age = now - new Date(c.first_advice_at).getTime();
  let due = 0;
  STEP_DAYS.forEach((d, i) => { if (age >= d * DAY) due = i + 1; });
  if (due === 0 || due <= (c.last_step ?? 0)) return null;
  if (c.last_sent_at && now - new Date(c.last_sent_at).getTime() < MIN_GAP_DAYS * DAY) return null;
  return due;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!SECRET || auth !== SECRET) return json({ error: "unauthorized" }, 401);

  const payload = await req.json().catch(() => ({}));
  const r = await rest("rpc/checkin_candidates", { method: "POST", body: "{}" });
  if (!r.ok) return json({ error: "candidates failed", detail: await r.text() }, 500);
  const all: Candidate[] = await r.json();

  // Test: one post, a chosen step, straight to its owner, nothing recorded.
  if (payload.test_decision_id) {
    const c = all.find((x) => x.decision_id === payload.test_decision_id);
    if (!c) return json({ error: "not an open post with advice" }, 404);
    const step = Math.min(3, Math.max(1, Number(payload.step ?? 1)));
    const copy = copyFor(c, step);
    const channels: string[] = payload.channels ?? ["push", "email"];
    const result: Record<string, boolean> = {};
    if (channels.includes("push")) result.push = await sendPush(c, copy);
    if (channels.includes("email")) result.email = await sendEmail(c, copy);
    return json({ test: true, step, to: c.owner_email, copy, result });
  }

  const now = Date.now();
  const due = all
    .map((c) => ({ c, step: dueStep(c, now) }))
    .filter((x): x is { c: Candidate; step: number } => x.step !== null)
    .sort((a, b) => b.c.advice_count - a.c.advice_count);

  // One per person per day; the rest wait for tomorrow.
  const seen = new Set<string>();
  const today = due.filter(({ c }) => (seen.has(c.owner_id) ? false : (seen.add(c.owner_id), true)));

  if (payload.dry_run) {
    return json({
      dry_run: true,
      sends: today.map(({ c, step }) => ({ to: c.owner_first, step, channel: c.has_push ? "push" : "email", title: copyFor(c, step).title })),
      waiting: due.length - today.length,
    });
  }

  const sent: unknown[] = [];
  for (const { c, step } of today) {
    const copy = copyFor(c, step);
    let channel: "push" | "email" | null = null;
    if (c.has_push && (await sendPush(c, copy))) channel = "push";
    else if (await sendEmail(c, copy)) channel = "email";
    if (!channel) continue;
    // Record the step, and any skipped ones, so the cadence moves forward.
    const rows = Array.from({ length: step - (c.last_step ?? 0) }, (_, i) => ({
      decision_id: c.decision_id, step: (c.last_step ?? 0) + i + 1, channel,
    }));
    await rest("decision_checkins", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify(rows) });
    sent.push({ decision_id: c.decision_id, step, channel });
  }
  return json({ sent: sent.length, details: sent, waiting: due.length - today.length });
});
