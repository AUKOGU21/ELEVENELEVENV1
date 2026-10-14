// The side panel: geteleveneleven.com, full height, beside the store she's on.
//
// background.js decides what to show (the pre-filled post for the product she
// clicked) and puts it in chrome.storage.session as panelTarget. This page loads
// it, and swaps it whenever she clicks the logo on another product while the
// panel is still open.
const SITE = "https://geteleveneleven.com";
const frame = document.getElementById("app");
const wait = document.getElementById("wait");
let shown = null;

frame.addEventListener("load", () => { wait.style.display = "none"; });

function show(target) {
  if (!target || !target.url || target.at === shown) return;
  shown = target.at;
  frame.src = target.url;
}

chrome.storage.session.get("panelTarget").then(({ panelTarget }) => {
  if (panelTarget) show(panelTarget);
  // Opened some other way (Chrome's own side panel menu) with nothing queued:
  // give her the app rather than a blank panel.
  else setTimeout(() => { if (shown === null) { shown = 0; frame.src = `${SITE}/feed`; } }, 1200);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.panelTarget) show(changes.panelTarget.newValue);
});

// ── Opt-in: the E11 logo on product photos ─────────────────────────────────────
// Asking for "all sites" access here, when she's already using the panel and
// can see what it's for, rather than at install. Turning it on fires Chrome's
// own permission prompt; background.js does the rest. The × hides this for good.
const ALL_SITES = { origins: ["https://*/*", "http://*/*"] };
const optin = document.getElementById("optin");
const optinText = document.getElementById("optinText");
const turnOn = document.getElementById("turnOn");

Promise.all([chrome.permissions.contains(ALL_SITES), chrome.storage.local.get("photoOptinDismissed")])
  .then(([on, { photoOptinDismissed }]) => { if (!on && !photoOptinDismissed) optin.style.display = "flex"; });

turnOn.addEventListener("click", async () => {
  const granted = await chrome.permissions.request(ALL_SITES).catch(() => false);
  if (!granted) return; // she said no in Chrome's prompt: leave the line, she can try again
  optinText.textContent = "On. Hover a product photo to post it.";
  turnOn.style.display = "none";
  setTimeout(() => { optin.style.display = "none"; }, 2600);
});

document.getElementById("later").addEventListener("click", () => {
  optin.style.display = "none";
  chrome.storage.local.set({ photoOptinDismissed: true });
});
