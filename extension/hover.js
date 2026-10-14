// The E11 logo on product photos. Opt-in: this file only runs once she has
// turned it on from the side panel and granted Chrome's "all sites" permission
// (background.js registers it then). Pinterest's Save button, in our colours.
//
// Hover a large photo on a product page and the logo sits in its top-left
// corner; click it and the side panel opens on that product with that photo.
// Product pages only, so it never follows her around the rest of the web.
(() => {
  if (window.top !== window || window.__e11Hover) return;
  window.__e11Hover = true;

  const MIN = 200; // px on screen: thumbnails and icons never get the logo

  function isProductPage() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      if (/"@type"\s*:\s*"(Product|ProductGroup)"/i.test(s.textContent || "")) return true;
    }
    const og = document.querySelector('meta[property="og:type"]');
    if (og && /product/i.test(og.getAttribute("content") || "")) return true;
    if (document.querySelector('meta[property="product:price:amount"], meta[property="og:price:amount"]')) return true;
    return !!document.querySelector('[itemtype*="schema.org/Product"]');
  }

  // One button, in a shadow root so the store's CSS can't restyle it.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      button {
        position: fixed; display: none; width: 34px; height: 34px; padding: 0; border: 0; cursor: pointer;
        border-radius: 8px; background: transparent; box-shadow: 0 2px 8px rgba(0,0,0,.28);
        transition: transform .12s ease;
      }
      button:hover { transform: scale(1.08); }
      img { width: 100%; height: 100%; display: block; border-radius: 8px; }
    </style>
    <button type="button" title="Post to ElevenEleven" aria-label="Post to ElevenEleven">
      <img alt="" src="${chrome.runtime.getURL("icons/icon-48.png")}">
    </button>`;
  const btn = root.querySelector("button");
  let target = null;
  let hideTimer = null;

  const place = () => {
    if (!target || !target.isConnected) return hide();
    const r = target.getBoundingClientRect();
    if (r.width < MIN || r.height < MIN || r.bottom < 0 || r.top > innerHeight) return hide();
    btn.style.left = `${Math.max(4, r.left + 10)}px`;
    btn.style.top = `${Math.max(4, r.top + 10)}px`;
    btn.style.display = "block";
  };
  function hide() { btn.style.display = "none"; target = null; }

  const srcOf = (img) => img.currentSrc || img.src || "";

  // Stores lay transparent layers (zoom, carousels, links) over their photos,
  // so the element under the cursor is rarely the <img>. Look through the stack
  // under the pointer for the first large photo instead.
  const photoAt = (x, y) => {
    for (const el of document.elementsFromPoint(x, y).slice(0, 8)) {
      if (el === host) return target; // on the logo itself: keep the current photo
      if (el instanceof HTMLImageElement && /^https?:/i.test(srcOf(el))) {
        const r = el.getBoundingClientRect();
        return r.width >= MIN && r.height >= MIN ? el : null;
      }
    }
    return null;
  };

  let product = null; // checked once per page, rechecked when a single-page store changes url
  let checkedAt = "";
  let checkedTime = 0;
  let frame = 0;
  document.addEventListener("mousemove", (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      // Stores often add their product data after the page loads: until it shows
      // up, look again every couple of seconds instead of deciding once.
      const now = Date.now();
      if (checkedAt !== location.href || (!product && now - checkedTime > 2000)) {
        checkedAt = location.href; checkedTime = now; product = isProductPage();
      }
      const img = product ? photoAt(e.clientX, e.clientY) : null;
      if (img) {
        clearTimeout(hideTimer);
        hideTimer = null;
        if (!host.isConnected) document.documentElement.appendChild(host);
        target = img;
        place();
      } else if (target && !hideTimer) {
        hideTimer = setTimeout(() => { hideTimer = null; hide(); }, 250);
      }
    });
  }, { passive: true, capture: true });
  addEventListener("scroll", place, { passive: true, capture: true });
  addEventListener("resize", place, { passive: true });

  btn.addEventListener("click", (e) => {
    // Product photos usually sit inside a link: don't follow it.
    e.preventDefault();
    e.stopPropagation();
    if (!target) return;
    chrome.runtime.sendMessage({ type: "e11-post-photo", pageUrl: location.href, image: srcOf(target) });
    hide();
  });
})();
