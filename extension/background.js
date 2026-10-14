// ElevenEleven for Chrome
// -----------------------------------------------------------------------------
// Click the E11 logo in the toolbar on any product page, or right-click a page,
// a product photo or a link and pick "Post to ElevenEleven". Either way the side
// panel opens beside the store (panel.html) on geteleveneleven.com/post, with the
// product already filled in. She keeps shopping on the left.
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
// moment she clicks), scripting (to read that page then), sidePanel, storage
// (to hand the product to the panel) and contextMenus.
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

/** The /post link for this product: page, and whatever we read off it. */
function postUrl(pageUrl, imageUrl, read) {
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
  return target;
}

/**
 * Open the side panel beside the store, then fill it. The open has to come
 * first and without awaiting anything: Chrome only lets an extension open the
 * panel in direct response to her click. The product is read after and handed
 * to the panel (panel.js) through session storage. If the panel can't open
 * (Chrome older than 116), the post opens in a tab next to the store instead.
 */
function present(tab, pageUrl, imageUrl, { readPage = true } = {}) {
  let panel = null;
  try {
    panel = chrome.sidePanel && tab && typeof tab.windowId === "number"
      ? chrome.sidePanel.open({ windowId: tab.windowId })
      : null;
  } catch (e) {
    panel = null;
  }
  (async () => {
    const read = readPage ? await readTab(tab) : null;
    const url = postUrl(pageUrl, imageUrl, read);
    let opened = false;
    try { if (panel) { await panel; opened = true; } } catch (e) { opened = false; }
    if (opened) {
      await chrome.storage.session.set({ panelTarget: { url, at: Date.now() } });
    } else {
      chrome.tabs.create({ url, ...(tab && typeof tab.index === "number" ? { index: tab.index + 1 } : {}) });
    }
  })();
}

// ── The logo on product photos (opt-in) ────────────────────────────────────────
// Off until she turns it on in the side panel, which asks Chrome for the "all
// sites" permission (optional in the manifest, so installing never shows that
// warning). With it, hover.js runs on pages she opens; without it, nothing does.
const ALL_SITES = { origins: ["https://*/*", "http://*/*"] };
const HOVER_ID = "e11-hover";

async function syncHover() {
  const on = await chrome.permissions.contains(ALL_SITES);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [HOVER_ID] });
  if (on && !existing.length) {
    await chrome.scripting.registerContentScripts([{
      id: HOVER_ID, matches: ALL_SITES.origins, js: ["hover.js"], runAt: "document_idle", persistAcrossSessions: true,
    }]);
    // Tabs already open don't need a reload to get it.
    const tabs = await chrome.tabs.query({ url: ALL_SITES.origins });
    for (const t of tabs) chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["hover.js"] }).catch(() => {});
  } else if (!on && existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [HOVER_ID] });
  }
}

chrome.permissions.onAdded.addListener(() => syncHover());
chrome.permissions.onRemoved.addListener(() => syncHover());
chrome.runtime.onStartup.addListener(() => syncHover());

// Her click on the logo on a photo (hover.js): same panel, with that photo.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "e11-post-photo" && sender.tab) present(sender.tab, msg.pageUrl, msg.image);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Post to ElevenEleven",
    contexts: ["page", "image", "link"],
  });
  syncHover();
});

chrome.action.onClicked.addListener((tab) => present(tab, tab.url, null));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (info.mediaType === "image") present(tab, info.pageUrl, info.srcUrl);
  // A link points at another page we haven't loaded: the site looks that one up.
  else if (info.linkUrl) present(tab, info.linkUrl, null, { readPage: false });
  else present(tab, info.pageUrl, null);
});
