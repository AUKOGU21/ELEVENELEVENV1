import { useState } from "react";

// Product images are scraped from arbitrary retailer sites, so two things go wrong:
//   1. Some are stored as http:// — the browser blocks them as mixed content on our
//      https page. Upgrading to https:// fixes every store that serves https (most).
//   2. Some are genuinely unreachable (dead links, broken SSL, hotlink blocks). Those
//      should fall back to a clean placeholder, never the broken-image glyph.
const toHttps = (u: string) => u.replace(/^http:\/\//i, "https://");

export function ProductImage({
  url,
  fallback,
  style,
}: {
  url: string | null | undefined;
  fallback: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <>{fallback}</>;
  return (
    <img
      src={toHttps(url)}
      alt=""
      onError={() => setBroken(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover", ...style }}
    />
  );
}
