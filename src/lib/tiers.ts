import type React from "react";

// ── Badges ────────────────────────────────────────────────────────────────────
// Two, and only two (2026-11-12, replacing the four-tier ladder):
//
//   Top Contributor  earned: the top 15% of people who weigh in, by helpful votes.
//   Expert           given by E11 by hand (is_expert). She writes her own
//                    categories and experience; they show on her profile only.
//
// The database decides who holds which (refresh_badges() in Postgres) and stores
// it in profiles.badge_tier. The app only reads that field: never work a badge
// out from vote counts here, or the two would disagree.

export type Badge = "Expert" | "Top Contributor";

export const BADGES: Record<Badge, { ring: string; ink: string }> = {
  Expert:            { ring: "#C49E64", ink: "#8A6620" }, // brand gold; darker gold for type
  "Top Contributor": { ring: "#9AABBF", ink: "#4F647D" }, // soft slate blue; deeper slate for type
};

const DEFAULT_RING = "rgba(28,23,18,0.14)";

/** The badge a stored badge_tier holds, or null for anything else (including old ladder names). */
export function badgeOf(badgeTier: string | null | undefined): Badge | null {
  return badgeTier === "Expert" || badgeTier === "Top Contributor" ? badgeTier : null;
}

/** Ring colour for a stored badge_tier string. No badge reads as the default hairline. */
export function ringFor(badgeTier: string | null | undefined): string {
  const b = badgeOf(badgeTier);
  return b ? BADGES[b].ring : DEFAULT_RING;
}

/** The colour for a badge's label, or null with no badge. */
export function badgeInk(badgeTier: string | null | undefined): string | null {
  const b = badgeOf(badgeTier);
  return b ? BADGES[b].ink : null;
}

/**
 * Style for an avatar's ring. Sits outside the image via box-shadow so it never
 * eats into the photo or shifts layout.
 */
export function ringStyle(badgeTier: string | null | undefined, width = 2): React.CSSProperties {
  const colour = ringFor(badgeTier);
  return { boxShadow: `0 0 0 ${width}px ${colour}`, borderRadius: "50%" };
}
