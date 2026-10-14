// ElevenEleven for Chrome
// -----------------------------------------------------------------------------
// Click the E11 logo in the toolbar on any product page, or right-click a page,
// a product photo or a link and pick "Post to ElevenEleven". Either way a new
// tab opens on geteleveneleven.com/post with the product already filled in.
//
// The product is read right here, from the page she's looking at: it's already
// loaded in her browser, so there's no bot wall and no wait. That is the whole
// point of doing it in the extension: the site's server-side lookup has to fetch
// the store itself and can take 15 to 20 seconds on stores that block servers.
// What we pass:
//
//   /post?url=<page>&name=&brand=&price=&cat=&img=<photo>&src=extension
//
// If the page can't be read (a chrome:// page, the Web Store, a PDF) or a field
// is missing, the site falls back to its own lookup from the url.
//
// Permissions show no install warning: activeTab (the page she's on, only at the
// moment she clicks), scripting (to read that page then) and contextMenus.
// -----------------------------------------------------------------------------
const SITE = "https://geteleveneleven.com";
const MENU_ID = "post-to-eleveneleven";

const isWeb = (u) => typeof u === "string" && /^https?:\/\//i.test(u);

/**
 * Runs inside the product page. Must be self-contained: it's serialized and
 * injected, so it can't see anything outside this function. Reads the same
 * signals the site's lookup does, strongest first: JSON-LD Product schema,
 * then Open Graph / product meta tags, then the page's own heading.
 */
function readProduct() {
  const clean = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
  const meta = (...names) => {
    for (const n of names) {
      const el = document.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
      const v = clean(el && el.getAttribute("content"));
      if (v) return v;
    }
    return "";
  };
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const imgOf = (v) => {
    v = first(v);
    return typeof v === "string" ? v : v && (v.url || v.contentUrl) ? v.url || v.contentUrl : "";
  };

  // JSON-LD: find a Product (or ProductGroup) anywhere, including inside @graph.
  let ld = null;
  const visit = (node) => {
    if (!node || ld) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== "object") return;
    const t = [].concat(node["@type"] || []).map(String);
    if (t.some((x) => /^(Product|ProductGroup|IndividualProduct)$/i.test(x))) { ld = node; return; }
    if (node["@graph"]) visit(node["@graph"]);
  };
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(s.textContent)); } catch (e) { /* malformed block: skip */ }
    if (ld) break;
  }

  let ldPrice = "";
  if (ld) {
    const offers = [].concat(ld.offers || (ld.hasVariant && [].concat(ld.hasVariant)[0] && [].concat(ld.hasVariant)[0].offers) || []);
    for (const o of offers) {
      const p = o && (o.price || o.lowPrice || (o.priceSpecification && first(o.priceSpecification).price));
      if (p) { ldPrice = String(p); break; }
    }
  }

  const brandOf = (b) => clean(typeof first(b) === "string" ? first(b) : first(b) && first(b).name);
  const h1 = clean(document.querySelector("h1") && document.querySelector("h1").innerText);

  // A bot check ("Just a moment...") or an error page has no product on it: send
  // nothing and let the site look the url up instead of posting the store's domain.
  const host = location.hostname.replace(/^www\./, "");
  const looksEmpty = (v) => !v || v.replace(/^www\./, "") === host || /^(just a moment|access denied|attention required|error|page not found|404)\b/i.test(v);
  if (/^(just a moment|attention required|access denied)/i.test(document.title)) return { name: "", brand: "", price: "", category: "", image: "" };

  const name = [clean(ld && ld.name), meta("og:title", "twitter:title"), h1].find((v) => !looksEmpty(v)) || "";
  const brand = brandOf(ld && ld.brand) || meta("product:brand", "og:brand", "brand") || meta("og:site_name");
  const image = imgOf(ld && ld.image) || meta("og:image", "og:image:secure_url", "twitter:image");
  const price = ldPrice || meta("product:price:amount", "og:price:amount", "price");
  const category = clean(ld && (typeof ld.category === "string" ? ld.category : "")) || meta("product:category");

  let absImage = "";
  try { absImage = image ? new URL(image, location.href).href : ""; } catch (e) { absImage = ""; }

  return {
    name: name.slice(0, 160),
    brand: brand.slice(0, 80),
    price: price.replace(/[^0-9.,]/g, "").slice(0, 20),
    category: category.slice(0, 80),
    image: /^https?:/i.test(absImage) ? absImage : "",
  };
}

async function readTab(tab) {
  if (!tab || typeof tab.id !== "number" || !isWeb(tab.url) || tab.url.startsWith(SITE)) return null;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readProduct });
    return res && res.result ? res.result : null;
  } catch (e) {
    return null; // pages Chrome won't let extensions read: fall back to the url alone
  }
}

function openPost(pageUrl, imageUrl, fromTab, read) {
  let target = `${SITE}/post`;
  // Our own site, a new tab or a chrome:// page has no product to read.
  if (isWeb(pageUrl) && !pageUrl.startsWith(SITE)) {
    const q = new URLSearchParams({ url: pageUrl });
    if (read) {
      if (read.name) q.set("name", read.name);
      if (read.brand) q.set("brand", read.brand);
      if (read.price) q.set("price", read.price);
      if (read.category) q.set("cat", read.category);
    }
    // The photo she right-clicked beats the one the page advertises.
    const img = isWeb(imageUrl) ? imageUrl : read && read.image;
    if (isWeb(img)) q.set("img", img);
    q.set("src", "extension");
    target += `?${q.toString()}`;
  }
  chrome.tabs.create({
    url: target,
    // Right next to the store she's on, so going back to shopping is one tab over.
    ...(fromTab && typeof fromTab.index === "number" ? { index: fromTab.index + 1 } : {}),
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Post to ElevenEleven",
    contexts: ["page", "image", "link"],
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  openPost(tab.url, null, tab, await readTab(tab));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (info.mediaType === "image") openPost(info.pageUrl, info.srcUrl, tab, await readTab(tab));
  // A link points at another page we haven't loaded: the site looks that one up.
  else if (info.linkUrl) openPost(info.linkUrl, null, tab, null);
  else openPost(info.pageUrl, null, tab, await readTab(tab));
});
