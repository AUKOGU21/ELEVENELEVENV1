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

      let imageUrl: string | null = null;
      let title: string = "";
      let description: string = "";
      let price: string | null = null;

      // Strategy 1: Direct HTML fetch — try browser UA first, fall back to Googlebot
      const origin = (() => { try { const u = new URL(body.url); return u.origin; } catch { return ""; } })();

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
          const htmlRes = await fetch(body.url, {
            headers,
            signal: AbortSignal.timeout(9000),
            redirect: "follow",
          });
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

      try {
        if (html) {
          // Extract og:image
          const ogImageMatch =
            html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
          if (ogImageMatch?.[1]) imageUrl = ogImageMatch[1];

          // Extract og:title or <title>
          const ogTitleMatch =
            html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
          if (ogTitleMatch?.[1]) {
            title = ogTitleMatch[1];
          } else {
            const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleTagMatch?.[1]) title = titleTagMatch[1];
          }

          // Extract og:description
          const ogDescMatch =
            html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
          if (ogDescMatch?.[1]) description = ogDescMatch[1];

          // Extract price — try multiple sources in priority order

          // 1. og:price:amount or product:price:amount meta tags
          const ogPriceMatch =
            html.match(/<meta[^>]+property=["'](?:og|product):price:amount["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](?:og|product):price:amount["']/i);
          if (ogPriceMatch?.[1]) price = ogPriceMatch[1].trim();

          // 2. JSON-LD structured data (Product schema)
          if (!price) {
            const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
            for (const match of jsonLdMatches) {
              try {
                const json = JSON.parse(match[1]);
                const items = Array.isArray(json) ? json : [json];
                for (const item of items) {
                  const offers = item.offers ?? item["@graph"]?.find?.((g: Record<string, unknown>) => g["@type"] === "Product")?.offers;
                  if (offers) {
                    const offer = Array.isArray(offers) ? offers[0] : offers;
                    const p = offer.price ?? offer.lowPrice;
                    if (p != null) { price = String(p); break; }
                  }
                }
                if (price) break;
              } catch { /* malformed JSON-LD, skip */ }
            }
          }

          // 3. meta name="price" (some older retailers)
          if (!price) {
            const namePriceMatch =
              html.match(/<meta[^>]+name=["']price["'][^>]+content=["']([^"']+)["']/i) ||
              html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']price["']/i);
            if (namePriceMatch?.[1]) price = namePriceMatch[1].trim();
          }

          // Strip currency symbols/commas from price
          if (price) price = price.replace(/[^0-9.]/g, "") || null;

          console.log("Direct fetch — title:", title, "imageUrl:", imageUrl, "price:", price);
        }
      } catch (e) {
        console.log("Direct HTML fetch failed:", e);
      }

      // Strategy 2: Microlink as fallback for image/title
      if (!imageUrl || !title) {
        try {
          const mlRes = await fetch(
            `https://api.microlink.io/?url=${encodeURIComponent(body.url)}&meta=true`,
          );
          const mlData = await mlRes.json();
          console.log("Microlink status:", mlData.status);
          if (mlData.status === "success" && mlData.data) {
            if (!imageUrl && mlData.data.image?.url) imageUrl = mlData.data.image.url;
            if (!title && mlData.data.title) title = mlData.data.title;
          }
        } catch (e) {
          console.log("Microlink failed:", e);
        }
      }

      // Parse brand/name from title (e.g. "Product Name | Brand" or "Brand - Product")
      const domainBrand = extractDomainBrand(body.url);
      let productName = "";
      let brand = domainBrand;

      if (title) {
        // Decode HTML entities
        title = title.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
        const parts = title.split(/\s*[|–—]\s*/); // split on | – —
        if (parts.length >= 2) {
          // Title-case the product name (Zara returns ALL CAPS titles)
          const raw = parts[0].trim();
          productName = raw === raw.toUpperCase()
            ? raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
            : raw;
          // Strip country/region suffixes from brand (e.g. "ZARA United States" → "Zara")
          const rawBrand = parts[parts.length - 1].trim();
          brand = rawBrand.split(" ")[0] || domainBrand;
        } else {
          productName = title;
        }
      }

      // Fallback: parse product name from URL slug
      if (!productName) {
        try {
          const pathname = new URL(body.url).pathname;
          const segments = pathname.split("/").filter(Boolean);
          // Find the longest slug segment (likely the product name)
          const slug = segments.sort((a, b) => b.length - a.length)[0] ?? "";
          const cleaned = slug
            .replace(/\.\w{2,4}$/, "")           // remove file extension (.html, .htm)
            .replace(/-p\d{5,}$/i, "")            // remove Zara-style product IDs (-p02786321)
            .replace(/-\d{5,}$/, "")              // remove trailing numeric IDs
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .trim();
          if (cleaned.length > 3) productName = cleaned;
        } catch { /* ignore */ }
      }

      // Attempt to enrich from description if name still weak
      if (!productName || productName.length < 4) {
        if (description) productName = description.split(".")[0].trim();
      }

      // For Zara specifically — try their CDN image pattern from the URL product ID
      if (!imageUrl) {
        try {
          const hostname = new URL(body.url).hostname;
          if (hostname.includes("zara.com")) {
            const pathname = new URL(body.url).pathname;
            const idMatch = pathname.match(/p(\d{7,})/i);
            if (idMatch) {
              // Zara CDN pattern — attempt common image URL
              const productId = idMatch[1];
              imageUrl = `https://static.zara.net/assets/public/product/p${productId}/image/main.jpg?ts=1&dpr=1`;
            }
          }
        } catch { /* ignore */ }
      }

      console.log("Final result — brand:", brand, "name:", productName, "image:", imageUrl);

      return new Response(
        JSON.stringify({
          brand,
          name: productName,
          retailer: domainBrand,
          image_url: imageUrl,
          price,
          color: null,
          category: null,
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
