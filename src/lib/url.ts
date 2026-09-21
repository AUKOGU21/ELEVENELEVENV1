// ── Product link helpers ──────────────────────────────────────────────────────
// Lived inside Feed until the weigh-in sheet moved out of it and needed them
// too. Behaviour is unchanged.

/**
 * Normalize a pasted URL (add https:// when the scheme is missing) and check it
 * is a real http(s) link. Returns null for anything unusable, so callers can
 * treat "no valid link" and "empty" the same way.
 */
export function normalizeProductUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
