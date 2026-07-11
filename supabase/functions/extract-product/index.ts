import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_KEY) {
      console.error("ANTHROPIC_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    console.log("Request body keys:", Object.keys(body));

    // ── Screenshot path ──────────────────────────────────────────
    if (body.imageBase64) {
      const mediaType = body.mediaType || "image/jpeg";
      console.log("Processing image, mediaType:", mediaType);

      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 256,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: body.imageBase64,
                  },
                },
                {
                  type: "text",
                  text: `Look at this product screenshot and extract the following information.
Return ONLY a valid JSON object with these exact keys (use null if not found):
{
  "brand": "brand name",
  "name": "product name/title",
  "retailer": "retailer name if different from brand",
  "color": "color if visible",
  "category": "clothing category e.g. dress, top, jeans",
  "price": "price as a plain number only e.g. 89.99 — no currency symbol, no range, just the number. Use the sale price if shown.",
  "source_url": "the full URL visible in the browser address bar, e.g. https://www.net-a-porter.com/... — return null if no URL is visible"
}
Do not include any explanation, just the JSON.`,
                },
              ],
            },
          ],
        }),
      });

      console.log("Anthropic response status:", anthropicRes.status);

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error("Anthropic error:", errText);
        return new Response(
          JSON.stringify({ _error: errText, _status: anthropicRes.status, brand: "", name: "", retailer: "", color: null, category: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const anthropicData = await anthropicRes.json();
      console.log("Anthropic response:", JSON.stringify(anthropicData));

      const rawText = anthropicData.content?.[0]?.text ?? "";
      console.log("Raw text from Claude:", rawText);

      // Extract JSON from the response (Claude sometimes adds markdown)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON found in response");
        return new Response(
          JSON.stringify({ brand: "", name: "", retailer: "", color: null, category: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const extracted = JSON.parse(jsonMatch[0]);
      console.log("Extracted product:", JSON.stringify(extracted));

      return new Response(
        JSON.stringify(extracted),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── URL path ─────────────────────────────────────────────────
    if (body.url) {
      console.log("Processing URL:", body.url);

      const origin = (() => { try { return new URL(body.url).origin; } catch { return ""; } })();

      // Direct HTML fetch — browser UA first, then social-crawler UAs that many
      // sites whitelist (Facebook/Googlebot get clean OG/JSON-LD even when the
      // browser UA is challenged).
      const FETCH_ATTEMPTS = [
        {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
        {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      ];

      let html = "";
      for (const headers of FETCH_ATTEMPTS) {
        try {
          const htmlRes = await fetch(body.url, { headers, signal: AbortSignal.timeout(9000), redirect: "follow" });
          if (htmlRes.ok) {
            html = await htmlRes.text();
            console.log("Fetched HTML with UA:", (headers["User-Agent"] as string).slice(0, 40));
            break;
          }
          console.log("Non-OK response:", htmlRes.status, "with UA:", (headers["User-Agent"] as string).slice(0, 40));
        } catch (e) {
          console.log("Fetch attempt failed:", e);
        }
      }

      // ---- Pull every field from the strongest source in the HTML ----
      // Priority for name/image/brand/price: JSON-LD Product schema (most
      // reliable, present on the vast majority of retail PDPs) → OpenGraph /
      // Twitter / itemprop meta → <title> / URL slug / description.
      let f = extractFields(html);

      // If the direct fetch was blocked (Cloudflare/Akamai) or returned a JS
      // shell, we'll have no image and/or only a junk name. Re-fetch through
      // Jina Reader, which renders JS and proxies past most bot walls, then
      // run the same parser over the rendered HTML and fill any gaps.
      const weak = !f.image || (isJunkName(f.ldName) && isJunkName(f.ogTitle));
      if (weak) {
        try {
          // Jina Reader now requires an API key (unauthenticated calls 401). With
          // the key it renders JS and proxies past bot walls (Revolve/Akamai etc.),
          // which is what gets us a clean product image on sites that block us.
          const JINA_KEY = Deno.env.get("JINA_API_KEY");
          const jr = await fetch(`https://r.jina.ai/${body.url}`, {
            headers: {
              "x-return-format": "html",
              "x-timeout": "15",
              ...(JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}` } : {}),
            },
            signal: AbortSignal.timeout(22000),
          });
          console.log("Jina status:", jr.status, "keyed:", !!JINA_KEY);
          if (jr.ok) {
            const jf = extractFields(await jr.text());
            f = {
              ldName: !isJunkName(f.ldName) ? f.ldName : jf.ldName,
              ldImage: f.ldImage || jf.ldImage,
              ldBrand: f.ldBrand || jf.ldBrand,
              ldPrice: f.ldPrice || jf.ldPrice,
              ldCategory: f.ldCategory || jf.ldCategory,
              ogTitle: !isJunkName(f.ogTitle) ? f.ogTitle : jf.ogTitle,
              ogImage: f.ogImage || jf.ogImage,
              ogDesc: f.ogDesc || jf.ogDesc,
              ogPrice: f.ogPrice || jf.ogPrice,
              image: f.image || jf.image,
            };
            console.log("Jina fallback applied — image:", !!f.image, "name:", !isJunkName(f.ldName) || !isJunkName(f.ogTitle));
          } else {
            console.log("Jina non-OK:", jr.status);
          }
        } catch (e) {
          console.log("Jina fallback failed:", e);
        }
      }

      // Microlink as a last-ditch image grab if everything above still has none.
      if (!f.image) {
        try {
          const mlRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(body.url)}&meta=true`);
          const mlData = await mlRes.json();
          if (mlData.status === "success" && mlData.data?.image?.url) f.image = mlData.data.image.url;
          if (isJunkName(f.ogTitle) && mlData.data?.title) f.ogTitle = mlData.data.title;
        } catch (e) {
          console.log("Microlink failed:", e);
        }
      }

      // ---- Resolve final fields ----
      const domainBrand = extractDomainBrand(body.url);

      // Parse a product name + brand out of the best title string ("Name | Brand")
      const rawTitle = decodeEntities(f.ogTitle || "");
      let titleName = "", titleBrand = "";
      if (rawTitle) {
        const parts = rawTitle.split(/\s*[|–—]\s*/);
        if (parts.length >= 2) {
          const raw = parts[0].trim();
          titleName = raw === raw.toUpperCase() ? toTitleCase(raw) : raw; // Zara ships ALL CAPS
          titleBrand = parts[parts.length - 1].trim().split(" ")[0] || ""; // "ZARA United States" → "Zara"
        } else {
          titleName = parts[0].trim();
        }
      }

      // Name: first non-junk candidate, JSON-LD wins. Rejects SKU codes like "1183C102_751".
      const name = firstGood([f.ldName, titleName, slugToName(body.url), f.ogDesc.split(".")[0]]);

      // Brand: JSON-LD brand, then the title's brand half, then the domain.
      // Reject CDN/WAF names a challenge page may leak (e.g. "Cloudflare").
      const WAF = /^(cloudflare|incapsula|imperva|akamai|distil|perimeterx|datadome|fastly)$/i;
      const brandCand = firstGood([f.ldBrand, titleBrand]);
      const brand = brandCand && !WAF.test(brandCand) ? brandCand : domainBrand;

      // Image: JSON-LD → OG/Twitter → Jina/Microlink, made absolute; Zara CDN last resort.
      const imageUrl = absolutize(f.ldImage || f.ogImage || f.image, origin) || zaraFallback(body.url);

      // Price: JSON-LD → meta. Parse to a number and round to 2 decimals to kill
      // float artifacts (e.g. "22921.800001" → "22921.8").
      let price: string | null = f.ldPrice || f.ogPrice;
      if (price) {
        const n = parseFloat(price.replace(/[^0-9.]/g, ""));
        price = Number.isFinite(n) ? String(Math.round(n * 100) / 100) : null;
      }

      // Category: classify from the page's structured signals (JSON-LD
      // taxonomy + URL path section + name), never from the prose description
      // which is too noisy ("thank" → tank, etc.). Null if nothing matches.
      const pathForCat = (() => {
        try { return decodeURIComponent(new URL(body.url).pathname).replace(/[-_/]+/g, " "); }
        catch { return ""; }
      })();
      const category = resolveCategory([f.ldCategory, pathForCat, name]);

      console.log("Final — brand:", brand, "name:", name, "image:", imageUrl, "price:", price, "category:", category);

      return new Response(
        JSON.stringify({
          brand,
          name,
          retailer: domainBrand,
          image_url: imageUrl,
          price,
          color: null,
          category,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "No url or imageBase64 provided" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractDomainBrand(url: string): string {
  try {
    const domain = new URL(url).hostname.replace("www.", "").split(".")[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return "";
  }
}

interface Fields {
  ldName: string | null; ldImage: string | null; ldBrand: string | null; ldPrice: string | null;
  ldCategory: string | null;
  ogTitle: string; ogImage: string | null; ogDesc: string; ogPrice: string | null;
  image: string | null;
}

// Classify a single clean signal (JSON-LD taxonomy, URL path, or product name)
// into one of the 7 app categories. Order matters: more specific garment types
// are checked first so "denim jacket" → Outerwear, not Bottoms.
function categoryFromText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const groups: [string, string[]][] = [
    ["Shoes", ["shoe", "boot", "sneaker", "heel", "sandal", "loafer", "pump", "mule", "footwear", "clog"]],
    ["Bags", ["bag", "purse", "handbag", "tote", "clutch", "backpack", "crossbody", "satchel"]],
    ["Accessories", ["accessor", "belt", "scarf", "beanie", "jewel", "earring", "necklace", "bracelet", "sunglass", "glove", "hosiery"]],
    ["Outerwear", ["jacket", "coat", "blazer", "cardigan", "parka", "trench", "outerwear", "puffer", "anorak"]],
    ["Dresses", ["dress", "gown", "romper", "jumpsuit", "frock"]],
    ["Bottoms", ["jean", "denim", "trouser", "pant", "shorts", "skirt", "legging", "chino", "cargo", "culotte"]],
    ["Tops", ["t-shirt", "tee", "tank", "top", "shirt", "blouse", "sweater", "sweatshirt", "hoodie", "crop", "knit", "cami", "camisole", "bodysuit", "turtleneck", "polo", "vest", "henley", "crew", "long sleeve", "longsleeve", "tunic"]],
  ];
  for (const [cat, kws] of groups) {
    if (kws.some((k) => s.includes(k))) return cat;
  }
  return null;
}

// First category match across signals, tried in priority order.
function resolveCategory(signals: (string | null | undefined)[]): string | null {
  for (const sig of signals) {
    const c = categoryFromText(sig);
    if (c) return c;
  }
  return null;
}

// Parse all product signals out of an HTML document. Used on both the direct
// fetch and the Jina-rendered HTML so the two paths stay identical.
function extractFields(html: string): Fields {
  const f: Fields = {
    ldName: null, ldImage: null, ldBrand: null, ldPrice: null, ldCategory: null,
    ogTitle: "", ogImage: null, ogDesc: "", ogPrice: null, image: null,
  };
  if (!html) return f;

  const ld: { name?: string; image?: string; brand?: string; price?: string; category?: string } = {};
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walkJsonLd(JSON.parse(m[1].trim()), ld); } catch { /* malformed JSON-LD, skip */ }
  }
  f.ldName = ld.name ?? null;
  f.ldImage = ld.image ?? null;
  f.ldBrand = ld.brand ?? null;
  f.ldPrice = ld.price != null ? String(ld.price) : null;
  f.ldCategory = ld.category ?? null;

  f.ogTitle = metaContent(html, "og:title") || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "");
  f.ogImage = metaContent(html, "og:image") || metaContent(html, "og:image:secure_url") ||
              metaContent(html, "twitter:image") || metaContent(html, "twitter:image:src") || metaContent(html, "image");
  f.ogDesc = metaContent(html, "og:description") || "";
  f.ogPrice = metaContent(html, "og:price:amount") || metaContent(html, "product:price:amount") || metaContent(html, "price");

  // Convenience: the single best image this document offers.
  f.image = f.ldImage || f.ogImage;
  return f;
}

// Read a <meta> content value by property / name / itemprop, in either attribute order.
function metaContent(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]+content=["']([^"']+)["']`, "i"));
  if (a?.[1]) return a[1];
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${k}["']`, "i"));
  return b?.[1] ?? null;
}

// Recursively walk a parsed JSON-LD blob and pull name/image/brand/price from
// the first Product node found (handles @graph arrays and nested objects).
function walkJsonLd(
  node: unknown,
  acc: { name?: string; image?: string; brand?: string; price?: string; category?: string },
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) walkJsonLd(n, acc); return; }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const types = (Array.isArray(t) ? t : [t]).map((x) => String(x || "").toLowerCase());
  if (types.some((x) => x.includes("product"))) {
    if (!acc.name && typeof obj.name === "string") acc.name = obj.name;
    if (!acc.image) {
      const img = obj.image;
      if (typeof img === "string") acc.image = img;
      else if (Array.isArray(img) && img.length) acc.image = typeof img[0] === "string" ? img[0] : (img[0] as Record<string, string>)?.url;
      else if (img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string") acc.image = (img as Record<string, string>).url;
    }
    if (!acc.brand) {
      const b = obj.brand;
      if (typeof b === "string") acc.brand = b;
      else if (b && typeof b === "object" && typeof (b as Record<string, unknown>).name === "string") acc.brand = (b as Record<string, string>).name;
    }
    if (!acc.price) {
      const offers = obj.offers;
      const offer = (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown> | undefined;
      if (offer && typeof offer === "object") {
        const spec = offer.priceSpecification as Record<string, unknown> | undefined;
        const p = offer.price ?? offer.lowPrice ?? spec?.price ?? spec?.lowPrice;
        if (p != null) acc.price = String(p);
      }
    }
    if (!acc.category) {
      const c = obj.category;
      if (typeof c === "string") acc.category = c;
      else if (Array.isArray(c)) acc.category = c.filter((x) => typeof x === "string").join(" ");
    }
  }
  for (const k of Object.keys(obj)) {
    if (k === "@type") continue;
    const v = obj[k];
    if (v && typeof v === "object") walkJsonLd(v, acc);
  }
}

// Titles a bot wall / error page returns instead of the product — discard these
// so we fall back to the URL slug for a name.
const BLOCKED_TITLE = /^(just a moment|attention required|access denied|are you (a )?(human|robot)|robot check|captcha|please wait|checking your browser|one moment|site maintenance|403 forbidden|forbidden|404|page not found|not found|error)\b/i;

// A name is junk if it's empty, too short, a bot-wall title, or a bare SKU/style
// code with no spaces and a digit (e.g. "1183C102_751", "p02786321").
function isJunkName(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = decodeEntities(String(s)).trim();
  if (t.length < 3) return true;
  if (BLOCKED_TITLE.test(t)) return true;
  if (!/\s/.test(t) && /\d/.test(t) && /^[\w\-.]+$/.test(t)) return true;
  return false;
}

// First non-junk string in priority order, trimmed and entity-decoded.
function firstGood(candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (!isJunkName(c)) return decodeEntities(String(c).trim());
  }
  return "";
}

function decodeEntities(s: string): string {
  return (s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return _; } })
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Turn the longest URL path segment into a readable product name.
function slugToName(url: string): string {
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    const slug = segs.sort((a, b) => b.length - a.length)[0] ?? "";
    const cleaned = slug
      .replace(/\.\w{2,4}$/, "")   // file extension
      .replace(/-p\d{5,}$/i, "")    // Zara-style product IDs
      .replace(/-\d{5,}$/, "")      // trailing numeric IDs
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
    return cleaned.length > 3 ? cleaned : "";
  } catch {
    return "";
  }
}

// Make a possibly-relative image URL absolute.
function absolutize(u: string | null, base: string): string | null {
  if (!u) return null;
  const t = u.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return "https:" + t;
  try { return new URL(t, base).href; } catch { return t; }
}

// Zara renders images in JS; reconstruct the CDN URL from the product ID.
function zaraFallback(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("zara.com")) {
      const idMatch = u.pathname.match(/p(\d{7,})/i);
      if (idMatch) return `https://static.zara.net/assets/public/product/p${idMatch[1]}/image/main.jpg?ts=1&dpr=1`;
    }
  } catch { /* ignore */ }
  return null;
}
