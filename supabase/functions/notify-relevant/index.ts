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
//   REMINDER_SECRET. The sending secrets now belong to `notify`.
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Requires decisions.relevance_notified_at.
// -----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REMINDER_SECRET = Deno.env.get("REMINDER_SECRET") ?? "";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtaXF1aWtveHh1a2Z1am5waXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTQ1NTUsImV4cCI6MjA5MDY3MDU1NX0.Q2JOtk1OZjz-XF0XbyDBw3p5cAidnB8_IEuCAqjplEA";

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
function firstName(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t ? t.split(" ")[0] : "Someone";
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


interface Candidate { userId: string; score: number; reason: string; }

Deno.serve(async (req) => {
  if (REMINDER_SECRET) {
    const raw = req.headers.get("authorization") ?? "";
    const auth = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw.trim();
    if (auth !== REMINDER_SECRET) return json({ error: "unauthorized" }, 401);
  }
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;

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

      // The bell row, the push and the email all come out of `notify`, which
      // holds the words. The reason this particular woman was picked rides along
      // as the quiet line, since it's the whole argument for interrupting her.
      const send = await fetch(SUPABASE_URL + "/functions/v1/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON_KEY },
        body: JSON.stringify({
          type: "relevant",
          user_id: pick.userId,
          decision_id: post.id,
          data: { actor_id: post.user_id, item, note: pick.reason },
        }),
      });
      if (!send.ok) { console.error("notify failed:", send.status, await send.text()); continue; }
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
