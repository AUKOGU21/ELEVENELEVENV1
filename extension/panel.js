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
