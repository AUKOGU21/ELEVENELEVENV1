// ── /d/:id link previews ──────────────────────────────────────────────────────
// iMessage, WhatsApp and the rest fetch a URL and read its meta tags. They do
// not run JavaScript, so a single-page app hands them whatever is hardcoded in
// index.html: every decision would preview as the same house advert.
//
// So /d/:id is rewritten here first. This serves the real index.html with the
// decision's own title, description and product photograph swapped in. The app
// boots exactly as before, because it is the same HTML with the same scripts.

type Decision = {
  product_name: string | null;
  brand_name: string | null;
  product_image_url: string | null;
  uncertainty_text: string | null;
  lf_title: string | null;
  post_type: string | null;
  status: string | null;
  profiles: { display_name: string | null } | null;
};

const SITE = "https://geteleveneleven.com";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Kimia Rahimi" -> "Kimia". Falls back to something that still reads as a person. */
const firstNameOf = (n: string | null | undefined) =>
  (n || "").trim().split(/\s+/)[0] || "Someone";

/** The first concern she named, which is the actual question she wants answered. */
const firstConcern = (d: Decision) =>
  (d.uncertainty_text ?? "").split(",").map((s) => s.trim()).filter(Boolean)[0] ?? null;

async function fetchDecision(id: string): Promise<Decision | null> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const select =
    "product_name,brand_name,product_image_url,uncertainty_text,lf_title,post_type,status,profiles(display_name)";
  const endpoint =
    `${url}/rest/v1/decisions?id=eq.${encodeURIComponent(id)}` +
    `&is_public=is.true&deleted_at=is.null&select=${select}&limit=1`;

  try {
    const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return null;
    const rows = (await res.json()) as Decision[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

function metaFor(d: Decision | null, id: string) {
  if (!d) {
    return {
      title: "ELEVENELEVEN",
      description: "Never second-guess a purchase again.",
      image: `${SITE}/apple-touch-icon.png`,
      url: `${SITE}/d/${id}`,
    };
  }
  const name = firstNameOf(d.profiles?.display_name);
  const isLF = d.post_type === "looking_for";
  const decided = d.status === "closed" || d.status === "purchased";

  const title = isLF
    ? `${name} is looking for something`
    : decided
      ? `${name} made her decision`
      : `${name} wants your take`;

  // What she is deciding on, then what she is unsure about.
  const item = isLF
    ? d.lf_title ?? "something"
    : [d.brand_name, d.product_name].filter(Boolean).join(" ") || "something she's considering";
  const concern = firstConcern(d);
  const description = concern ? `${item}. ${concern}` : item;

  return {
    title,
    description,
    image: d.product_image_url || `${SITE}/apple-touch-icon.png`,
    url: `${SITE}/d/${id}`,
  };
}

/** Replace what index.html hardcodes, and add what it has no way to know. */
function inject(html: string, m: ReturnType<typeof metaFor>) {
  const tags = [
    `<title>${esc(m.title)} · ELEVENELEVEN</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="ELEVENELEVEN" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:image" content="${esc(m.image)}" />`,
    `<meta property="og:url" content="${esc(m.url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${esc(m.image)}" />`,
  ].join("\n    ");

  return html
    // Drop the static tags so crawlers don't read the house ones first.
    .replace(/\s*<title>[\s\S]*?<\/title>/i, "")
    .replace(/\s*<meta\s+name="description"[^>]*>/gi, "")
    .replace(/\s*<meta\s+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/\s*<meta\s+name="twitter:(?!site)[^"]*"[^>]*>/gi, "")
    .replace("</head>", `  ${tags}\n  </head>`);
}

export default async function handler(req: { url?: string }, res: {
  setHeader: (k: string, v: string) => void;
  status: (n: number) => { send: (b: string) => void };
}) {
  const url = new URL(req.url ?? "/", SITE);
  const id = url.searchParams.get("id") ?? "";

  // The app itself is the source of truth for markup: fetch the built shell
  // rather than keeping a second copy of it in here that can drift.
  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : SITE;
  let html = "";
  try {
    html = await (await fetch(`${origin}/index.html`)).text();
  } catch {
    res.setHeader("Location", `${SITE}/feed`);
    res.status(302).send("");
    return;
  }

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const decision = uuid.test(id) ? await fetchDecision(id) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Short cache: a decision's framing can change, and previews are re-fetched.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(inject(html, metaFor(decision, id)));
}
