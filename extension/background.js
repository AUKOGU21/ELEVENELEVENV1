// ElevenEleven for Chrome
// -----------------------------------------------------------------------------
// Click the E11 logo in the toolbar on any product page, or right-click a page,
// a product photo or a link and pick "Post to ElevenEleven". Either way a new
// tab opens on geteleveneleven.com/post with the product already read in:
//
//   /post?url=<product page>&img=<photo she right-clicked>&src=extension
//
// The site does the rest (reads the page, fills in brand, name, price, photo).
// Signed out, she signs in and lands back on the same pre-filled post.
//
// Permissions are the two that show no install warning: activeTab (the page
// she's on, only at the moment she clicks) and contextMenus.
// -----------------------------------------------------------------------------
const SITE = "https://geteleveneleven.com";
const MENU_ID = "post-to-eleveneleven";

const isWeb = (u) => typeof u === "string" && /^https?:\/\//i.test(u);

function openPost(pageUrl, imageUrl, fromTab) {
  let target = `${SITE}/post`;
  // Our own site, a new tab or a chrome:// page has no product to read.
  if (isWeb(pageUrl) && !pageUrl.startsWith(SITE)) {
    target += `?url=${encodeURIComponent(pageUrl)}&src=extension`;
    if (isWeb(imageUrl)) target += `&img=${encodeURIComponent(imageUrl)}`;
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

chrome.action.onClicked.addListener((tab) => openPost(tab.url, null, tab));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (info.mediaType === "image") openPost(info.pageUrl, info.srcUrl, tab);
  else if (info.linkUrl) openPost(info.linkUrl, null, tab);
  else openPost(info.pageUrl, null, tab);
});
