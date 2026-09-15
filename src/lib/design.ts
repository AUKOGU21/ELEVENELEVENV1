// ── The editorial system ──────────────────────────────────────────────────────
// One place for the redesign's type, colour and rules.
//
// Hierarchy comes from typography, scale, spacing, thin rules and the product
// photographs. Not from boxes: no cards inside cards, no pills, no grey
// containers, no icon tiles, and corners of 2px at most. The previous design is
// tagged `design-v1` in git if it ever needs to come back.
import type React from "react";
import { SANS_APP } from "./type";

/** Heavy condensed grotesk, for the big moments only. */
export const DISPLAY = "'Anton', 'Helvetica Neue', Helvetica, Arial, sans-serif";
/** Everything else. */
export const SANS = SANS_APP;

export const C = {
  paper: "#F7F4EF",       // warm off-white ground
  well: "#EFEBE5",        // behind product photographs
  ink: "#141210",
  inkSoft: "#3A3632",
  muted: "#8A8178",       // metadata
  faint: "#B4ACA3",
  rule: "rgba(20,18,16,0.14)",
  ruleStrong: "#141210",
  burgundy: "#761919",    // E11's primary: index.css --primary, hsl(0 65% 28%)
  scrim: "rgba(20,18,16,0.46)",
} as const;

export const RADIUS = 2;

/** Oversized, tightly set display type. Uppercase by nature. */
export const display = (size: number | string, color: string = C.ink): React.CSSProperties => ({
  fontFamily: DISPLAY,
  fontSize: size,
  fontWeight: 400,
  lineHeight: 0.9,
  letterSpacing: "-0.005em",
  textTransform: "uppercase",
  color,
  margin: 0,
});

/** Small uppercase grotesk for metadata: eyebrows, labels, counts, tabs. */
export const meta = (size = 11, color: string = C.muted): React.CSSProperties => ({
  fontFamily: SANS,
  fontSize: size,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color,
  margin: 0,
});

/** A bold grotesk line: names, brands, concern titles. */
export const strong = (size = 13, color: string = C.ink): React.CSSProperties => ({
  fontFamily: SANS,
  fontSize: size,
  fontWeight: 700,
  letterSpacing: "0.01em",
  color,
  margin: 0,
});

/** Running text. */
export const body = (size = 14, color: string = C.inkSoft): React.CSSProperties => ({
  fontFamily: SANS,
  fontSize: size,
  fontWeight: 400,
  lineHeight: 1.55,
  color,
  margin: 0,
});

export const hairline = (color: string = C.rule): React.CSSProperties => ({
  height: 1,
  background: color,
  border: "none",
  margin: 0,
});

// ── The state word ────────────────────────────────────────────────────────────
// The one piece of large type on a tile. Open decisions invite you in, in
// burgundy. Resolved ones state what happened, in black. No badges, no "open",
// no "in progress".
export type DecisionState = "weigh_in" | "deciding" | "bought" | "didnt_buy" | "recommend" | "found";

export const STATE_WORD: Record<DecisionState, string> = {
  weigh_in: "WEIGH IN.",
  deciding: "DECIDING.",   // her own open post: you can't weigh in on yourself
  bought: "BOUGHT.",
  didnt_buy: "DIDN'T BUY.",
  recommend: "RECOMMEND.", // someone else's open Looking For
  found: "FOUND IT.",
};

export const stateColor = (s: DecisionState): string =>
  s === "bought" || s === "didnt_buy" || s === "found" ? C.ink : C.burgundy;
