import { Profile } from "./supabase";

export interface MatchBreakdown {
  silhouette: number;     // 0-30
  proportions: number;    // 0-20
  height: number;         // 0-15
  fit_preference: number; // 0-15
  sizing: number;         // 0-10
  style: number;          // 0-5
  behavioral: number;     // 0-5
  total: number;          // 0-100
}

// -------------------------------------------------------------------
// HEIGHT (15 pts max)
// Ordinal buckets — degrades by bucket distance
// -------------------------------------------------------------------
const HEIGHT_ORDER = [
  "Under 5'0\"",
  "5'0\" – 5'3\"",
  "5'4\" – 5'6\"",
  "5'7\" – 5'9\"",
  "5'10\" – 6'0\"",
  "Over 6'0\"",
];

function scoreHeight(a: string | null, b: string | null): number {
  if (!a || !b) return 7; // unknown — give half credit
  const ai = HEIGHT_ORDER.indexOf(a);
  const bi = HEIGHT_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return 7;
  const delta = Math.abs(ai - bi);
  if (delta === 0) return 15;
  if (delta === 1) return 10;
  if (delta === 2) return 5;
  return 0;
}

// -------------------------------------------------------------------
// SIZING (10 pts max)
// Split 5 pts top, 5 pts bottom — adjacent size = partial credit
// -------------------------------------------------------------------
const SIZE_ORDER = [
  "XXS (00)",
  "XS (0–2)",
  "S (4–6)",
  "M (8–10)",
  "L (12–14)",
  "XL (16–18)",
  "XXL (20–22)",
];

function scoreSingleSize(a: string | null, b: string | null, max: number): number {
  if (!a || !b) return max * 0.5; // unknown — half credit
  const ai = SIZE_ORDER.indexOf(a);
  const bi = SIZE_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return max * 0.5;
  const delta = Math.abs(ai - bi);
  if (delta === 0) return max;
  if (delta === 1) return max * 0.5;
  return 0;
}

function scoreSizing(a: Profile, b: Profile): number {
  const top = scoreSingleSize(a.top_size, b.top_size, 5);
  const bottom = scoreSingleSize(a.bottom_size, b.bottom_size, 5);
  return top + bottom;
}

// -------------------------------------------------------------------
// SILHOUETTE MATCH (30 pts max)
// Jaccard similarity on selected silhouette arrays
// -------------------------------------------------------------------
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function scoreSilhouette(a: Profile, b: Profile): number {
  const arrA = a.silhouette_preference ?? [];
  const arrB = b.silhouette_preference ?? [];
  if (arrA.length === 0 && arrB.length === 0) return 15; // both unknown — half credit
  return jaccardSimilarity(arrA, arrB) * 30;
}

// -------------------------------------------------------------------
// BODY PROPORTIONS (20 pts max)
// Compare each FIT_CATEGORY answer — partial credit per matching dimension
// Categories: Torso length, Bust fit, Waist definition, Hip fit, Thigh fit
// -------------------------------------------------------------------
const PROPORTION_CATEGORIES = [
  "Torso length",
  "Bust fit",
  "Waist definition",
  "Hip fit",
  "Thigh fit",
];

function scoreProportions(a: Profile, b: Profile): number {
  const detailsA = (a.fit_details ?? {}) as Record<string, string>;
  const detailsB = (b.fit_details ?? {}) as Record<string, string>;

  const answered = PROPORTION_CATEGORIES.filter(
    (cat) => detailsA[cat] || detailsB[cat]
  );

  if (answered.length === 0) return 10; // both unknown — half credit

  const matching = answered.filter(
    (cat) => detailsA[cat] && detailsB[cat] && detailsA[cat] === detailsB[cat]
  ).length;

  return (matching / answered.length) * 20;
}

// -------------------------------------------------------------------
// FIT PREFERENCE (15 pts max)
// Ordinal preference: very_fitted → oversized
// Stored as free text from fit_details["Overall fit"] or fit_preference field
// -------------------------------------------------------------------
const FIT_PREF_ORDER = [
  "very fitted",
  "fitted",
  "slightly fitted",
  "relaxed",
  "oversized",
  "compressive",
];

function normalizeFitPref(val: string | null): string | null {
  if (!val) return null;
  return val.toLowerCase().trim();
}

function scoreFitPreference(a: Profile, b: Profile): number {
  const prefA = normalizeFitPref(a.fit_preference);
  const prefB = normalizeFitPref(b.fit_preference);

  if (!prefA || !prefB) return 7; // unknown — half credit

  if (prefA === prefB) return 15;

  const ai = FIT_PREF_ORDER.findIndex((p) => prefA.includes(p));
  const bi = FIT_PREF_ORDER.findIndex((p) => prefB.includes(p));

  if (ai === -1 || bi === -1) return 5;

  const delta = Math.abs(ai - bi);
  if (delta === 1) return 10;
  if (delta === 2) return 5;
  return 0;
}

// -------------------------------------------------------------------
// STYLE & AESTHETIC OVERLAP (5 pts max)
// Jaccard on style_aesthetics arrays
// -------------------------------------------------------------------
function scoreStyle(a: Profile, b: Profile): number {
  const arrA = a.style_aesthetics ?? [];
  const arrB = b.style_aesthetics ?? [];
  if (arrA.length === 0 && arrB.length === 0) return 2.5;
  return jaccardSimilarity(arrA, arrB) * 5;
}

// -------------------------------------------------------------------
// BEHAVIORAL SIMILARITY (5 pts max)
// Purchase frequency + risk tolerance
// -------------------------------------------------------------------
const FREQUENCY_ORDER = ["rarely", "monthly", "biweekly", "weekly"];
const RISK_ORDER = ["conservative", "moderate", "adventurous"];

function scoreOrdinal(a: string | null, b: string | null, order: string[], max: number): number {
  if (!a || !b) return max * 0.5;
  const ai = order.indexOf(a.toLowerCase());
  const bi = order.indexOf(b.toLowerCase());
  if (ai === -1 || bi === -1) return max * 0.5;
  const delta = Math.abs(ai - bi);
  if (delta === 0) return max;
  if (delta === 1) return max * 0.5;
  return 0;
}

function scoreBehavioral(a: Profile, b: Profile): number {
  const freq = scoreOrdinal(a.purchase_frequency, b.purchase_frequency, FREQUENCY_ORDER, 2.5);
  const risk = scoreOrdinal(a.risk_tolerance, b.risk_tolerance, RISK_ORDER, 2.5);
  return freq + risk;
}

// -------------------------------------------------------------------
// MAIN FUNCTION
// -------------------------------------------------------------------
export function computeMatchScore(poster: Profile, responder: Profile): MatchBreakdown {
  const silhouette = scoreSilhouette(poster, responder);
  const proportions = scoreProportions(poster, responder);
  const height = scoreHeight(poster.height_range, responder.height_range);
  const fit_preference = scoreFitPreference(poster, responder);
  const sizing = scoreSizing(poster, responder);
  const style = scoreStyle(poster, responder);
  const behavioral = scoreBehavioral(poster, responder);

  const total = silhouette + proportions + height + fit_preference + sizing + style + behavioral;

  return {
    silhouette: Math.round(silhouette * 10) / 10,
    proportions: Math.round(proportions * 10) / 10,
    height: Math.round(height * 10) / 10,
    fit_preference: Math.round(fit_preference * 10) / 10,
    sizing: Math.round(sizing * 10) / 10,
    style: Math.round(style * 10) / 10,
    behavioral: Math.round(behavioral * 10) / 10,
    total: Math.round(total * 10) / 10,
  };
}
