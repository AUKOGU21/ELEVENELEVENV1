import { Profile } from "./supabase";

// ── Match score ───────────────────────────────────────────────────────────────
// How much two women have in common for the item at hand, 0 to 100.
//
// Two rules, both from looking at real scores (Nov 2026, every take sat between
// 25% and 66%):
//   1. Only what BOTH answered counts. Nobody has a fit preference or shopping
//      habits on file, so those used to hand everyone the same half credit, and
//      a close mirror could never read above ~89%. Unknowns are now left out and
//      the rest is scaled to 100.
//   2. What counts depends on the item. Jeans care about hips, thighs, height
//      and bottom size; a blazer about bust, torso and top size; a bag about none
//      of the body in detail: mostly taste, with overall shape and size as a
//      lighter read on "someone like you".
// Silhouette still leads for clothes; size labels still only support.

export interface MatchBreakdown {
  silhouette: number;
  proportions: number;
  height: number;
  fit_preference: number;
  sizing: number;
  style: number;
  behavioral: number;
  total: number; // 0-100
}

/** What part of the body an item is about. */
export type ItemGroup = "lower" | "upper" | "full" | "none";

/** The item being decided on: its category if posted with one, or any words that name it. */
export interface MatchItem { category?: string | null; text?: string | null }

const LOWER = /\b(bottoms?|jeans?|denim|pants?|trousers?|skirts?|shorts|leggings?|joggers?|sweatpants)\b/i;
const UPPER = /\b(tops?|outerwear|blazers?|jackets?|coats?|trench|shirts?|blouses?|tees?|t-shirts?|sweaters?|knit|cardigans?|hoodies?|vests?|bodysuits?|bras?|corsets?)\b/i;
const FULL = /\b(dress(es)?|gowns?|jumpsuits?|rompers?|swim\w*|bikinis?|one-piece|pajamas?|sets?|lingerie)\b/i;
const NONE = /\b(shoes?|sneakers?|boots?|heels?|sandals?|loafers?|flats|mules|bags?|totes?|purses?|clutch|accessor(y|ies)|jewelry|jewellery|necklaces?|earrings?|rings?|bracelets?|belts?|hats?|caps?|sunglasses|scarf|scarves|wallets?|watch(es)?|beauty|fragrance|perfume)\b/i;

export function itemGroup(item?: MatchItem | null): ItemGroup {
  const read = (s?: string | null): ItemGroup | null => {
    if (!s) return null;
    if (FULL.test(s)) return "full";
    if (LOWER.test(s)) return "lower";
    if (UPPER.test(s)) return "upper";
    if (NONE.test(s)) return "none";
    return null;
  };
  return read(item?.category) ?? read(item?.text) ?? "full";
}

// The weights for each kind of item. Same order of importance as CLAUDE.md for
// clothes; fit preference and shopping habits only count once both have them.
const WEIGHTS: Record<ItemGroup, Record<keyof Omit<MatchBreakdown, "total">, number>> = {
  full:  { silhouette: 30, proportions: 20, height: 15, fit_preference: 15, sizing: 10, style: 5,  behavioral: 5 },
  lower: { silhouette: 25, proportions: 25, height: 20, fit_preference: 15, sizing: 10, style: 5,  behavioral: 5 },
  upper: { silhouette: 25, proportions: 25, height: 10, fit_preference: 15, sizing: 10, style: 5,  behavioral: 5 },
  none:  { silhouette: 25, proportions: 0,  height: 10, fit_preference: 0,  sizing: 10, style: 40, behavioral: 15 },
};

/** Which fit answers matter for which items. */
export const PROPORTIONS_FOR: Record<ItemGroup, string[]> = {
  lower: ["Hip fit", "Thigh fit", "Waist definition", "Torso length"],
  upper: ["Bust fit", "Torso length", "Waist definition"],
  full: ["Bust fit", "Waist definition", "Hip fit", "Thigh fit", "Torso length"],
  none: [],
};

// ── Height ── inches apart, not buckets: 5'3" and 5'4" are the same height to a hem.
export function heightInches(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)\s*'\s*(\d+)?/);
  if (m) return parseInt(m[1], 10) * 12 + (m[2] ? parseInt(m[2], 10) : 0);
  // Old bucket labels: take the middle.
  const legacy: Record<string, number> = {
    "Under 5'0\"": 59, "5'0\" – 5'3\"": 62, "5'4\" – 5'6\"": 65, "5'7\" – 5'9\"": 68, "5'10\" – 6'0\"": 71, "Over 6'0\"": 74,
  };
  return legacy[s] ?? null;
}

function scoreHeight(a: string | null, b: string | null): number | null {
  const ai = heightInches(a), bi = heightInches(b);
  if (ai == null || bi == null) return null;
  const d = Math.abs(ai - bi);
  return d <= 1 ? 1 : d === 2 ? 0.75 : d === 3 ? 0.5 : d <= 5 ? 0.25 : 0;
}

// ── Size ── same size full credit, one size off half.
const LETTER_SIZE: Record<string, number> = { XXS: 0, XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6 };

export function sizeIndex(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.toUpperCase().replace(/\s/g, "");
  const letter = t.match(/^(XXS|XXL|XS|XL|S|M|L)/);
  if (letter) return LETTER_SIZE[letter[1]];
  if (t.startsWith("00")) return 0;
  const num = t.match(/\d+/);
  if (!num) return null;
  const v = parseInt(num[0], 10);
  return v <= 2 ? 1 : v <= 6 ? 2 : v <= 10 ? 3 : v <= 14 ? 4 : v <= 18 ? 5 : 6;
}

function scoreOneSize(a: string | null, b: string | null): number | null {
  const ai = sizeIndex(a), bi = sizeIndex(b);
  if (ai == null || bi == null) return null;
  const d = Math.abs(ai - bi);
  return d === 0 ? 1 : d === 1 ? 0.5 : 0;
}

function scoreSizing(a: Profile, b: Profile, g: ItemGroup): number | null {
  const parts = (g === "lower" ? [scoreOneSize(a.bottom_size, b.bottom_size)]
    : g === "upper" ? [scoreOneSize(a.top_size, b.top_size)]
    : [scoreOneSize(a.top_size, b.top_size), scoreOneSize(a.bottom_size, b.bottom_size)])
    .filter((x): x is number => x != null);
  return parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : null;
}

// ── Silhouette ── same 1, same family 2/3, neighboring family 1/3.
const SILHOUETTE_FAMILY: Record<string, string> = {
  "Lean and elongated": "lean",
  "Slim with subtle shape": "lean",
  "Straight and athletic": "lean",
  "Sculpted and athletic": "sculpted",
  "Soft and even": "soft",
  "Soft midsection": "soft",
  "Mid curve": "curvy",
  "Curved with definition": "curvy",
  "Full and curved": "curvy",
};
const SILHOUETTE_ADJACENT: Record<string, string[]> = {
  lean: ["sculpted", "soft"],
  sculpted: ["lean", "curvy"],
  soft: ["lean", "curvy"],
  curvy: ["soft", "sculpted"],
};

function scoreSilhouette(a: Profile, b: Profile): number | null {
  const sa = (a.silhouette_preference ?? [])[0];
  const sb = (b.silhouette_preference ?? [])[0];
  if (!sa || !sb) return null;
  if (sa === sb) return 1;
  const fa = SILHOUETTE_FAMILY[sa], fb = SILHOUETTE_FAMILY[sb];
  if (!fa || !fb) return 0;
  if (fa === fb) return 2 / 3;
  return SILHOUETTE_ADJACENT[fa]?.includes(fb) ? 1 / 3 : 0;
}

// ── Proportions ── each answer sits on a scale (smaller / about proportional /
// fuller), so a neighbor gets half credit rather than none.
const PROPORTION_SCALE: Record<string, string[]> = {
  "Bust fit": ["Smaller bust", "About proportional", "Fuller bust"],
  "Hip fit": ["Narrower hips", "About proportional", "Wider hips"],
  "Thigh fit": ["Slimmer thighs", "About proportional", "Fuller thighs"],
  "Torso length": ["Shorter torso", "About average", "Longer torso"],
  "Waist definition": ["Less defined", "Slightly defined", "Very defined"],
};

export function fitAnswer(p: { fit_details?: Record<string, string> | null }, cat: string): string | null {
  const v = (p.fit_details ?? {})[cat];
  return typeof v === "string" && v.trim() ? v : null;
}

function scoreProportions(a: Profile, b: Profile, g: ItemGroup): number | null {
  const scores: number[] = [];
  for (const cat of PROPORTIONS_FOR[g]) {
    const va = fitAnswer(a, cat), vb = fitAnswer(b, cat);
    if (!va || !vb) continue;
    if (va === vb) { scores.push(1); continue; }
    const scale = PROPORTION_SCALE[cat];
    const ia = scale?.indexOf(va) ?? -1, ib = scale?.indexOf(vb) ?? -1;
    scores.push(ia === -1 || ib === -1 ? 0 : Math.abs(ia - ib) === 1 ? 0.5 : 0);
  }
  return scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null;
}

// ── Fit preference ── only once both have one on file.
const FIT_PREF_ORDER = ["very fitted", "fitted", "slightly fitted", "relaxed", "oversized", "compressive"];

function scoreFitPreference(a: Profile, b: Profile): number | null {
  const pa = a.fit_preference?.toLowerCase().trim(), pb = b.fit_preference?.toLowerCase().trim();
  if (!pa || !pb) return null;
  if (pa === pb) return 1;
  const ai = FIT_PREF_ORDER.findIndex((p) => pa.includes(p)), bi = FIT_PREF_ORDER.findIndex((p) => pb.includes(p));
  if (ai === -1 || bi === -1) return 1 / 3;
  const d = Math.abs(ai - bi);
  return d === 1 ? 2 / 3 : d === 2 ? 1 / 3 : 0;
}

// ── Style ── read from the shorter list, so three picks that are all hers too
// is full overlap even if the other woman picked five. A neighboring style
// (minimal and classic, sporty and street) gets half credit: exact tags rarely
// line up, and without this a bag or shoe post could show a single-digit match.
const STYLE_NEIGHBORS: Record<string, string[]> = {
  classic: ["minimal", "preppy", "feminine"],
  minimal: ["classic"],
  preppy: ["classic"],
  sporty: ["street"],
  street: ["sporty", "statement", "trend-driven"],
  statement: ["trend-driven", "street"],
  "trend-driven": ["statement", "street"],
  feminine: ["bohemian", "classic"],
  bohemian: ["feminine"],
};

export function styleOverlap(a: string[] | null | undefined, b: string[] | null | undefined): number | null {
  const sa = new Set((a ?? []).map((x) => x.toLowerCase())), sb = new Set((b ?? []).map((x) => x.toLowerCase()));
  if (!sa.size || !sb.size) return null;
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  let s = 0;
  for (const x of small) s += big.has(x) ? 1 : (STYLE_NEIGHBORS[x] ?? []).some((n) => big.has(n)) ? 0.5 : 0;
  return s / small.size;
}

/** Exact shared style picks only, for saying "Similar style." out loud. */
export function sharedStyles(a: string[] | null | undefined, b: string[] | null | undefined): number {
  const sb = new Set((b ?? []).map((x) => x.toLowerCase()));
  return (a ?? []).filter((x) => sb.has(x.toLowerCase())).length;
}

// ── Shopping habits ── only once both have them on file.
function scoreOrdinal(a: string | null, b: string | null, order: string[]): number | null {
  if (!a || !b) return null;
  const ai = order.indexOf(a.toLowerCase()), bi = order.indexOf(b.toLowerCase());
  if (ai === -1 || bi === -1) return null;
  const d = Math.abs(ai - bi);
  return d === 0 ? 1 : d === 1 ? 0.5 : 0;
}

function scoreBehavioral(a: Profile, b: Profile): number | null {
  const parts = [
    scoreOrdinal(a.purchase_frequency, b.purchase_frequency, ["rarely", "monthly", "biweekly", "weekly"]),
    scoreOrdinal(a.risk_tolerance, b.risk_tolerance, ["conservative", "moderate", "adventurous"]),
  ].filter((x): x is number => x != null);
  return parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : null;
}

// ── Main ──
export function computeMatchScore(poster: Profile, responder: Profile, item?: MatchItem | null): MatchBreakdown {
  const g = itemGroup(item);
  const w = WEIGHTS[g];
  const raw: Record<keyof Omit<MatchBreakdown, "total">, number | null> = {
    silhouette: scoreSilhouette(poster, responder),
    proportions: scoreProportions(poster, responder, g),
    height: scoreHeight(poster.height_range, responder.height_range),
    fit_preference: scoreFitPreference(poster, responder),
    sizing: scoreSizing(poster, responder, g),
    style: styleOverlap(poster.style_aesthetics, responder.style_aesthetics),
    behavioral: scoreBehavioral(poster, responder),
  };

  // Scale to 100 over what both of them actually answered.
  const keys = Object.keys(raw) as (keyof typeof raw)[];
  const known = keys.filter((k) => raw[k] != null && w[k] > 0);
  const possible = known.reduce((s, k) => s + w[k], 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const out = {} as MatchBreakdown;
  for (const k of keys) out[k] = raw[k] != null && possible > 0 ? r1(((raw[k] as number) * w[k] / possible) * 100) : 0;
  // Nothing to compare yet: say so with a neutral middle, not a zero.
  out.total = possible > 0 ? r1(known.reduce((s, k) => s + (raw[k] as number) * w[k], 0) / possible * 100) : 50;
  return out;
}
