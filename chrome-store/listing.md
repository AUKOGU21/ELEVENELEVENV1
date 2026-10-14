# ElevenEleven: Chrome Web Store submission

Everything the Chrome Web Store developer dashboard asks for, in the order it asks.
Upload file: `dist-extension/eleveneleven-chrome-1.0.0.zip`. Images: `chrome-store/assets/`.

---

## Store listing tab

**Name** (from the manifest): ElevenEleven

**Summary** (from the manifest, 132 characters max):
Still second-guessing? Turn any product page into a conversation. Add it to ELEVENELEVEN in one click and get firsthand advice.

**Description** (paste into the long description field):
Still second-guessing? Turn any product page into a conversation. Add what you're considering to ELEVENELEVEN in one click and get relevant firsthand advice before you buy.

**Category:** Shopping

**Language:** English (United States)

**Store icon (128 × 128):** `extension/icons/icon-128.png`

**Screenshots (1280 × 800):**
1. `chrome-store/assets/screenshot-1.png`: the side panel open beside a product page, post filled in
2. `chrome-store/assets/screenshot-2.png`: the E11 logo on a product photo

**Small promo tile (440 × 280):** `chrome-store/assets/promo-tile.png`

**Official URL / Homepage:** https://geteleveneleven.com

**Support URL / email:** hello@geteleveneleven.com

---

## Privacy practices tab

**Single purpose description:**
ElevenEleven lets you post a product you're shopping for to ElevenEleven, so women with a similar body and style can tell you whether to buy it. Clicking the icon (or the logo on a product photo) opens ElevenEleven in Chrome's side panel with that product already filled in.

**Permission justifications:**

- **activeTab:** To read the product on the page the user is on, only when she clicks the ElevenEleven icon or the right-click menu item.
- **scripting:** To read the product's name, brand, price and photo from that page at the moment she clicks, so the post opens already filled in.
- **sidePanel:** To open ElevenEleven beside the store in Chrome's side panel, so she can keep shopping while she posts.
- **storage:** To pass the product from the click to the side panel, and to remember whether she dismissed the offer to show the logo on product photos.
- **contextMenus:** To add "Post to ElevenEleven" to the right-click menu on pages, images and links.
- **Host permissions (optional, https://*/* and http://*/*):** Not requested at install. Only if the user turns on "Post straight from product photos" in the side panel, Chrome asks her for access so the extension can show the ElevenEleven logo when she hovers a product photo. Nothing is sent anywhere unless she taps the logo.

**Remote code:** No, I am not using remote code. (The side panel shows the ElevenEleven website, geteleveneleven.com, in a frame; no remote scripts are executed in the extension.)

**Data usage: what the extension collects** (tick these):
- **Website content:** the product name, brand, price, photo and page address of the product she chooses to post, sent only when she clicks.

Leave everything else unticked (no personally identifiable information, health, financial, authentication, personal communications, location, web history, or user activity collection by the extension).

**Certifications** (tick all three):
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://geteleveneleven.com/privacy

---

## Distribution tab

**Visibility:** Public (or Unlisted to share only by link first)

**Regions:** All regions (or United States only)

**Pricing:** Free
