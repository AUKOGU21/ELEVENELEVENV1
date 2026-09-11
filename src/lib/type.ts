// ── Type ──────────────────────────────────────────────────────────────────────
// One typeface across the whole app, matching the emails and onboarding.
//
// The app used to set headlines in Georgia. It read as a default rather than a
// choice, which is the same reason the webfonts came out of the emails: a face
// nobody picked makes the product look like it was assembled rather than made.
//
// Helvetica does the work instead. It needs help Georgia didn't: at headline
// sizes it wants weight and a tightened track, or it reads as body copy that
// happened to get large. HEADLINE carries both, so a heading is one spread
// rather than three properties to remember.

export const SANS_APP = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** A headline: the face, the weight and the track that make it read as one. */
export const HEADLINE = {
  fontFamily: SANS_APP,
  fontWeight: 700,
  letterSpacing: "-0.015em",
} as const;
