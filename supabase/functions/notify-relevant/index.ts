// Supabase Edge Function: notify-relevant
// -----------------------------------------------------------------------------
// Category 1 of the notification system: RELEVANCE. "Someone needs your help."
//
// Finds open decisions nobody has weighed in on, works out who is actually
// qualified to answer, and reaches out to a handful of them.
//
// Qualification is demonstrated category expertise, NOT product similarity. The
// woman who has spent five weeks hunting a designer bag is the right person to
// judge someone else's bag, even when the two bags are nothing alike. Matching
// on the product string would both miss her and generate noise.
//
// Signals, strongest first:
//   3  an OPEN Looking For whose words land in the post's category
//   2  a logged purchase of the same brand
//   2  a past weigh-in on a post in the same category
//   1  a decision of her own in the same category
//
// Never notified: the poster, anyone who already weighed in on that post,
// anyone who got a relevance email inside COOLDOWN_HOURS.
//
// Triggered by pg_cron. POST {"dry_run": true} to see the matches it would make
// without sending anything.
//
// Secrets (all already set for outcome-reminder):
//   RESEND_API_KEY, REMINDER_SECRET, SITE_URL, EMAIL_FROM
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Requires decisions.relevance_notified_at.
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REMINDER_SECRET = Deno.env.get("REMINDER_SECRET") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://geteleveneleven.com";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";

// Give the feed a few hours to answer organically before we go asking.
const MIN_AGE_HOURS = Number(Deno.env.get("RELEVANCE_MIN_AGE_HOURS") ?? "3");
// Stop chasing a post nobody answered a week ago.
const MAX_AGE_DAYS = Number(Deno.env.get("RELEVANCE_MAX_AGE_DAYS") ?? "7");
// Only posts with at most this many weigh-ins count as needing help.
const MAX_WEIGHINS = Number(Deno.env.get("RELEVANCE_MAX_WEIGHINS") ?? "0");
// At most this many women asked per post.
const MAX_PER_POST = Number(Deno.env.get("RELEVANCE_MAX_PER_POST") ?? "5");
// One woman is never asked twice inside this window, across all posts.
const COOLDOWN_HOURS = Number(Deno.env.get("RELEVANCE_COOLDOWN_HOURS") ?? "48");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return (s || "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}
function firstName(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t ? t.split(" ")[0] : "Someone";
}
function fill(tpl: string, key: string, value: string): string {
  return tpl.split("{{" + key + "}}").join(value);
}
async function sb(path: string): Promise<any> {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },
  });
  return r.ok ? r.json() : null;
}

// What a Looking For has to say for us to read it as being about a category.
// Keyed to CATEGORY_OPTIONS in Feed.tsx.
const CATEGORY_WORDS: Record<string, string[]> = {
  Bags: ["bag", "purse", "tote", "clutch", "handbag", "crossbody", "satchel", "backpack"],
  Shoes: ["shoe", "sneaker", "boot", "heel", "sandal", "loafer", "flat", "mule", "pump", "trainer"],
  Dresses: ["dress", "gown"],
  Tops: ["top", "shirt", "blouse", "tee", "sweater", "knit", "cardigan", "tank", "bodysuit"],
  Bottoms: ["jean", "pant", "trouser", "skirt", "short", "denim", "legging"],
  Outerwear: ["coat", "jacket", "blazer", "trench", "parka", "puffer"],
  Accessories: ["scarf", "belt", "hat", "sunglass", "jewel", "necklace", "earring", "bracelet", "accessory"],
};

function lookingForMatchesCategory(text: string, category: string): boolean {
  const words = CATEGORY_WORDS[category];
  if (!words) return false;
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
}

// Design shell matches the other ElevenEleven emails.
const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <title>she needs your take</title>
  <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=Spline+Sans+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    html,body{margin:0!important;padding:0!important;width:100%!important;background:#ffffff;}
    table,td{border-collapse:collapse!important;}
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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
    {{POSTER}} is deciding on {{ITEM}} and no one has answered.
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
              {{POSTER}} needs your take.
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:26px 56px 8px;font-size:17px;line-height:1.5;color:#3A3530;">
              she's deciding on {{ITEM}}, and nobody has weighed in yet.
            </td>
          </tr>
          <tr>
            <td align="center" class="px" style="padding:0 56px 28px;font-size:15px;line-height:1.6;color:#6F665A;">
              {{REASON}}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:6px 48px 4px;">
              <a class="btn mono" href="{{SITE_URL}}/feed" target="_blank"
                 style="display:inline-block;background:#CB5A3C;color:#ffffff;font-size:13px;letter-spacing:2px;text-transform:uppercase;padding:15px 32px;">
                Weigh in&nbsp;&rarr;
              </a>
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
              you're getting this because you know this category.<br>
              questions? <a href="mailto:hello@geteleveneleven.com" style="color:#b3ab9e;text-decoration:underline;">hello@geteleveneleven.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

interface Candidate { userId: string; score: number; reason: string; }

Deno.serve(async (req) => {
  if (REMINDER_SECRET) {
    const raw = req.headers.get("authorization") ?? "";
    const auth = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw.trim();
    if (auth !== REMINDER_SECRET) return json({ error: "unauthorized" }, 401);
  }
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;
  if (!dryRun && !RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);

  const now = Date.now();
  const notBefore = new Date(now - MAX_AGE_DAYS * 86400000).toISOString();
  const notAfter = new Date(now - MIN_AGE_HOURS * 3600000).toISOString();

  const posts: any[] = (await sb(
    "decisions?select=id,user_id,brand_name,product_name,product_category,created_at" +
    "&post_type=eq.decision&status=eq.open&deleted_at=is.null&relevance_notified_at=is.null" +
    "&created_at=gte." + notBefore + "&created_at=lte." + notAfter + "&order=created_at.desc&limit=50"
  )) ?? [];
  if (!posts.length) return json({ ok: true, sent: 0, note: "no posts due" });

  const coolCutoff = new Date(now - COOLDOWN_HOURS * 3600000).toISOString();
  const recent: any[] = (await sb(
    "notifications?select=user_id&type=eq.relevant&created_at=gte." + coolCutoff
  )) ?? [];
  const onCooldown = new Set<string>(recent.map((r) => r.user_id));

  const emailCache = new Map<string, string | null>();
  async function emailFor(userId: string): Promise<string | null> {
    if (emailCache.has(userId)) return emailCache.get(userId)!;
    const u = await fetch(SUPABASE_URL + "/auth/v1/admin/users/" + userId, {
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const email = u?.email ?? null;
    emailCache.set(userId, email);
    return email;
  }
  const nameCache = new Map<string, string | null>();
  async function nameFor(userId: string): Promise<string | null> {
    if (nameCache.has(userId)) return nameCache.get(userId)!;
    const p = (await sb("profiles?id=eq." + userId + "&select=display_name"))?.[0];
    const n = p?.display_name ?? null;
    nameCache.set(userId, n);
    return n;
  }

  const results: any[] = [];
  let sent = 0;

  for (const post of posts) {
    const category: string | null = post.product_category;
    const weighIns: any[] = (await sb("responses?select=user_id&decision_id=eq." + post.id + "&deleted_at=is.null")) ?? [];
    if (weighIns.length > MAX_WEIGHINS) continue;

    const excluded = new Set<string>([post.user_id, ...weighIns.map((r) => r.user_id)]);
    const best = new Map<string, Candidate>();
    const consider = (userId: string, score: number, reason: string) => {
      if (excluded.has(userId) || onCooldown.has(userId)) return;
      const prev = best.get(userId);
      if (!prev || score > prev.score) best.set(userId, { userId, score, reason });
    };

    // Signal 3 — an open Looking For about this category.
    if (category) {
      const lfs: any[] = (await sb(
        "decisions?select=user_id,lf_title,lf_context&post_type=eq.looking_for&status=eq.open&deleted_at=is.null&limit=200"
      )) ?? [];
      for (const lf of lfs) {
        const text = (lf.lf_title ?? "") + " " + (lf.lf_context ?? "");
        if (lookingForMatchesCategory(text, category)) {
          consider(lf.user_id, 3, "You've been looking for " + (lf.lf_title ?? "one of these") + ", so you know what to look for here.");
        }
      }
    }

    // Signal 2 — she has bought this brand before.
    if (post.brand_name) {
      const brandPosts: any[] = (await sb(
        "decisions?select=id,user_id&brand_name=eq." + encodeURIComponent(post.brand_name) + "&deleted_at=is.null&limit=200"
      )) ?? [];
      const ids = brandPosts.filter((d) => d.id !== post.id).map((d) => d.id);
      if (ids.length) {
        const outs: any[] = (await sb("outcomes?select=decision_id&decision_id=in.(" + ids.join(",") + ")&did_purchase=is.true")) ?? [];
        const bought = new Set(outs.map((o) => o.decision_id));
        for (const d of brandPosts) {
          if (bought.has(d.id)) consider(d.user_id, 2, "You've bought " + post.brand_name + " before.");
        }
      }
    }

    // Signals 2 and 1 — weighed in on this category, or decided in it herself.
    if (category) {
      const catPosts: any[] = (await sb(
        "decisions?select=id,user_id&product_category=eq." + encodeURIComponent(category) + "&deleted_at=is.null&limit=300"
      )) ?? [];
      const catIds = catPosts.filter((d) => d.id !== post.id).map((d) => d.id);
      if (catIds.length) {
        const catResponses: any[] = (await sb("responses?select=user_id&decision_id=in.(" + catIds.join(",") + ")&deleted_at=is.null")) ?? [];
        for (const r of catResponses) {
          consider(r.user_id, 2, "You've weighed in on " + category.toLowerCase() + " before.");
        }
        for (const d of catPosts) {
          if (d.id !== post.id) consider(d.user_id, 1, "You've been through a " + category.toLowerCase() + " decision yourself.");
        }
      }
    }

    const picks = [...best.values()].sort((a, b) => b.score - a.score).slice(0, MAX_PER_POST);
    const poster = firstName(await nameFor(post.user_id));
    const item = [post.brand_name, post.product_name].filter(Boolean).join(" ").trim() || "an item";
    const detail: any = { decision_id: post.id, item, poster, category, picks: [] as any[] };

    for (const pick of picks) {
      const email = await emailFor(pick.userId);
      detail.picks.push({ user_id: pick.userId, name: await nameFor(pick.userId), email, score: pick.score, reason: pick.reason });
      if (dryRun || !email) continue;

      // In-app bell, and push for anyone who has it on, via the notifications trigger.
      await fetch(SUPABASE_URL + "/rest/v1/notifications", {
        method: "POST",
        headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: pick.userId, type: "relevant", decision_id: post.id,
          data: { actor_name: poster, item, reason: pick.reason }, email_sent: true,
        }),
      }).catch((e) => console.error("notification insert failed:", e));

      let html = fill(TEMPLATE, "POSTER", esc(poster));
      html = fill(html, "ITEM", esc(item));
      html = fill(html, "REASON", esc(pick.reason));
      html = fill(html, "SITE_URL", SITE_URL);

      const send = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_FROM, to: [email],
          subject: poster + " needs your take on " + item,
          html,
          headers: { "List-Unsubscribe": "<mailto:hello@geteleveneleven.com?subject=Unsubscribe>" },
        }),
      });
      if (!send.ok) { console.error("send failed:", send.status, await send.text()); continue; }
      onCooldown.add(pick.userId);
      sent++;
    }

    results.push(detail);

    if (!dryRun && picks.length > 0) {
      await fetch(SUPABASE_URL + "/rest/v1/decisions?id=eq." + post.id, {
        method: "PATCH",
        headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ relevance_notified_at: new Date().toISOString() }),
      });
    }
  }

  console.log("notify-relevant: " + (dryRun ? "DRY RUN" : "sent " + sent) + ", posts considered " + posts.length);
  return json({ ok: true, dry_run: dryRun, sent, posts_considered: posts.length, results });
});
