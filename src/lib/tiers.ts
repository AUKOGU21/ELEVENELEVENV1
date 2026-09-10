import type React from "react";

// ── Tiers ─────────────────────────────────────────────────────────────────────
// Earned on helpful votes. The ladder lives here and nowhere else: the profile
// pages, the ring around an avatar, and the promotion trigger in Postgres all
// read the same thresholds and the same names.
//
// If you change a threshold or a name here, change announce_tier_promotion() in
// the database to match, and migrate any stored profiles.badge_tier values.

export interface Tier {
  label: string;
  min: number;
  /** The ring around her avatar. Null for the default, which is a hairline. */
  ring: string | null;
}

export const TIERS: Tier[] = [
  { label: "E11 Insider",   min: 100, ring: "#C49E64" },  // brand gold, richest
  { label: "Expert",        min: 50,  ring: "#DAC08A" },  // soft gold
  { label: "Trusted Voice", min: 25,  ring: "#6B1F2A" },  // deep maroon
  { label: "Contributor",   min: 5,   ring: "#E3A9AF" },  // warm pink
];

const DEFAULT_RING = "rgba(28,23,18,0.14)";

/** The tier a given number of helpful votes earns, or null below the first rung. */
export function tierFor(helpfulVotes: number): Tier | null {
  return TIERS.find((t) => helpfulVotes >= t.min) ?? null;
}

/** The next rung up, for "3 more to Trusted Voice" style copy. */
export function nextTier(helpfulVotes: number): Tier | null {
  const above = TIERS.filter((t) => helpfulVotes < t.min);
  return above.length ? above[above.length - 1] : null;
}

/** Ring colour for a stored badge_tier string. Unknown or absent reads default. */
export function ringFor(badgeTier: string | null | undefined): string {
  if (!badgeTier) return DEFAULT_RING;
  return TIERS.find((t) => t.label === badgeTier)?.ring ?? DEFAULT_RING;
}

/**
 * Style for an avatar's ring. Sits outside the image via box-shadow so it never
 * eats into the photo or shifts layout.
 */
export function ringStyle(badgeTier: string | null | undefined, width = 2): React.CSSProperties {
  const colour = ringFor(badgeTier);
  return { boxShadow: `0 0 0 ${width}px ${colour}`, borderRadius: "50%" };
}
