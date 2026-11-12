// ── Why her? ──────────────────────────────────────────────────────────────────
// What's behind a match %, as a few short lines anyone would recognize:
// "Same height. 5'6".", "Similar hips & thighs.", "Owns these exact jeans.",
// "You've trusted her advice before."
//
// Alexis's rules (Nov 2026):
//   - Plain words, never profile labels ("soft and even", "fits at the hip").
//   - Only what's true for this pair AND matters for this item: no body lines
//     on a bag; hips and thighs for jeans, bust and torso for a blazer.
//   - Answers everyone shares ("about proportional") say nothing, so skip them.
//   - Four lines at most. One gray line for a difference that changes how to
//     read her take ("3" taller than you.").
// The facts come from one database call per post (match_why), which also feeds
// the order takes and recs are listed in.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { heightInches, itemGroup, sharedStyles, sizeIndex, type ItemGroup } from "@/lib/matching";

export interface WhyProfile {
  height: string | null;
  silhouette: string | null;
  top: string | null;
  bottom: string | null;
  fit: Record<string, string>;
  style: string[];
  brands: { name: string; domain?: string | null }[];
}

export interface WhyPerson {
  profile: WhyProfile | null;
  brand: string | null;
  owns_item: boolean;
  bought: boolean;
  fav: boolean;
  trusted: boolean;
  calls_n: number;
  calls_right: number;
}

export interface WhyData {
  category: string | null;
  brand: string | null;
  poster: WhyProfile | null;
  people: Record<string, WhyPerson>;
}

export interface WhyLine { text: string; diff?: boolean }

// One fetch per post per session.
const cache = new Map<string, Promise<WhyData | null>>();

export function loadWhy(decisionId: string): Promise<WhyData | null> {
  let p = cache.get(decisionId);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.rpc("match_why", { p_decision: decisionId });
      if (error || !data) { cache.delete(decisionId); return null; }
      return data as WhyData;
    })();
    cache.set(decisionId, p);
  }
  return p;
}

/** The facts for one post, for signed-in members only (it carries fit answers). */
export function useWhy(decisionId: string | null | undefined, signedIn: boolean, count = 0): WhyData | null {
  const [data, setData] = useState<WhyData | null>(null);
  const seen = useRef<{ id: string | null | undefined; count: number }>({ id: null, count });
  useEffect(() => {
    if (!decisionId || !signedIn) { setData(null); return; }
    // A new take or rec landed on the post we already had: fetch again.
    if (seen.current.id === decisionId && seen.current.count !== count) refreshWhy(decisionId);
    seen.current = { id: decisionId, count };
    let live = true;
    loadWhy(decisionId).then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, [decisionId, signedIn, count]);
  return data;
}

/** Forget a post's facts, e.g. after a new take lands on it. */
export function refreshWhy(decisionId: string) { cache.delete(decisionId); }

// ── Wording ──

const PLURAL = /\b(jeans|pants|trousers|shorts|leggings|joggers|sweatpants|sneakers|boots|shoes|heels|sandals|loafers|flats|mules|sunglasses|earrings|pajamas)\b/i;
const NOUN = /\b(jeans|pants|trousers|shorts|leggings|joggers|skirt|dress|jumpsuit|romper|blazer|jacket|coat|trench|sweater|cardigan|shirt|blouse|top|tee|bodysuit|bra|bikini|swimsuit|sneakers|boots|shoes|heels|sandals|loafers|flats|mules|bag|tote|purse|clutch|necklace|earrings|ring|bracelet|belt|hat|sunglasses|scarf|wallet|watch|pajamas)\b/i;

/** "Owns these exact jeans." / "Owns this exact coat." / "Owns this exact item." */
function ownsLine(text: string | null | undefined): string {
  const m = (text ?? "").match(NOUN);
  if (!m) return "Owns this exact item.";
  const noun = m[1].toLowerCase();
  return PLURAL.test(noun) ? `Owns these exact ${noun}.` : `Owns this exact ${noun}.`;
}

const MIDDLE = new Set(["About proportional", "About average", "Slightly defined"]);

/** Same answer on every one of these, and at least one of them says something. */
function sameAndTelling(a: WhyProfile, b: WhyProfile, cats: string[]): boolean {
  const pairs = cats.map((c) => [a.fit?.[c], b.fit?.[c]]);
  if (pairs.some(([x, y]) => !x || !y || x !== y)) return false;
  return pairs.some(([x]) => !MIDDLE.has(x as string));
}

const BODY: Record<Exclude<ItemGroup, "none">, { cats: string[]; text: string }[]> = {
  lower: [{ cats: ["Hip fit", "Thigh fit"], text: "Similar hips & thighs." }, { cats: ["Hip fit"], text: "Similar hips." }, { cats: ["Thigh fit"], text: "Similar thighs." }],
  upper: [{ cats: ["Bust fit", "Torso length"], text: "Similar bust & torso." }, { cats: ["Bust fit"], text: "Similar bust." }, { cats: ["Torso length"], text: "Similar torso length." }],
  full: [
    { cats: ["Bust fit", "Hip fit"], text: "Similar bust & hips." },
    { cats: ["Hip fit", "Thigh fit"], text: "Similar hips & thighs." },
    { cats: ["Bust fit", "Torso length"], text: "Similar bust & torso." },
    { cats: ["Hip fit"], text: "Similar hips." },
    { cats: ["Bust fit"], text: "Similar bust." },
  ],
};

const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "her";

export function whyLines(
  data: WhyData | null,
  userId: string | null | undefined,
  opts: { itemText?: string | null; posterName?: string | null; viewerIsPoster: boolean },
): WhyLine[] {
  if (!data || !userId) return [];
  const person = data.people?.[userId];
  const a = data.poster, b = person?.profile;
  if (!person) return [];
  const g = itemGroup({ category: data.category, text: opts.itemText });
  const you = opts.viewerIsPoster ? "you" : firstName(opts.posterName);
  const body = a && b ? pairLines(a, b, g, you) : null;
  const out: WhyLine[] = [];
  if (body?.height) out.push(body.height);
  if (body?.body) out.push(body.body);

  // What she owns and what she's earned.
  if (person.owns_item) out.push({ text: ownsLine(opts.itemText) });
  if (person.trusted) out.push({ text: opts.viewerIsPoster ? "You've trusted her advice before." : `${firstName(opts.posterName)} has trusted her advice before.` });
  if (!person.owns_item && person.brand) {
    if (person.bought) out.push({ text: `Has bought ${person.brand}.` });
    else if (person.fav) out.push({ text: `Loves ${person.brand}.` });
  }
  if (person.calls_n >= 3 && person.calls_right / person.calls_n >= 0.75) out.push({ text: "Usually calls it right." });

  // Softer signals, only if there's room.
  out.push(...(body?.soft ?? []));
  return finish(out, body?.diff ?? null);
}

function finish(out: WhyLine[], diff: WhyLine | null): WhyLine[] {
  const kept = out.slice(0, diff ? 3 : 4);
  return diff ? [...kept, diff] : kept;
}

/**
 * What two women share, body and taste only. `you` is the first woman; lines
 * describe the second ("3\" taller than you."). Used for takes (poster vs the
 * woman who weighed in) and feed cards (you vs the poster).
 */
export function pairLines(a: WhyProfile, b: WhyProfile, g: ItemGroup, you: string): { height?: WhyLine; body?: WhyLine; soft: WhyLine[]; diff: WhyLine | null } {
  const res: { height?: WhyLine; body?: WhyLine; soft: WhyLine[]; diff: WhyLine | null } = { soft: [], diff: null };
  if (g !== "none") {
    // Height, for anything you wear on the body.
    const ha = heightInches(a.height), hb = heightInches(b.height);
    if (ha != null && hb != null) {
      const d = hb - ha;
      if (d === 0 && b.height) res.height = { text: `Same height. ${b.height.replace(/\s/g, "")}.` };
      else if (Math.abs(d) === 1) res.height = { text: "About the same height." };
      else if (Math.abs(d) >= 3) res.diff = { text: `${Math.abs(d)}" ${d > 0 ? "taller" : "shorter"} than ${you}.`, diff: true };
    }
    // Body, in the words that matter for this item.
    const hit = BODY[g].find((o) => sameAndTelling(a, b, o.cats));
    if (hit) res.body = { text: hit.text };
    if (!hit && a.silhouette && a.silhouette === b.silhouette) res.soft.push({ text: "Similar shape." });
  }
  if (sharedStyles(a.style, b.style) >= 2) res.soft.push({ text: "Similar style." });
  if (g !== "none") {
    const same = (x: string | null, y: string | null) => { const i = sizeIndex(x), j = sizeIndex(y); return i != null && i === j; };
    const sizeSame = g === "lower" ? same(a.bottom, b.bottom) : g === "upper" ? same(a.top, b.top) : same(a.top, b.top) && same(a.bottom, b.bottom);
    if (sizeSame) res.soft.push({ text: "Same size." });
  }
  return res;
}

/** A profiles row (any shape the app loads) as the fields the panel reads. */
export function toWhyProfile(p: any): WhyProfile | null {
  if (!p) return null;
  const fit: Record<string, string> = {};
  if (p.fit_details && typeof p.fit_details === "object") {
    for (const [k, v] of Object.entries(p.fit_details)) if (!k.startsWith("_") && typeof v === "string") fit[k] = v;
  }
  return {
    height: p.height_range ?? null,
    silhouette: (p.silhouette_preference ?? [])[0] ?? null,
    top: p.top_size ?? null,
    bottom: p.bottom_size ?? null,
    fit,
    style: p.style_aesthetics ?? [],
    brands: Array.isArray(p.favorite_brands) ? p.favorite_brands : [],
  };
}

/** Feed card: what you (the viewer) have in common with the woman who posted. */
export function cardLines(viewer: WhyProfile | null, poster: any, item: { category?: string | null; text?: string | null }): WhyLine[] | null {
  const her = toWhyProfile(poster);
  if (!viewer || !her) return null;
  const g = itemGroup(item);
  const r = pairLines(viewer, her, g, "you");
  const out: WhyLine[] = [];
  if (r.height) out.push(r.height);
  if (r.body) out.push(r.body);
  out.push(...r.soft);
  return finish(out, r.diff);
}

/** Nudges the order takes and recs are listed in: what she's earned, on top of the match. */
export function whyBoost(data: WhyData | null, userId: string | null | undefined): number {
  const p = userId ? data?.people?.[userId] : null;
  if (!p) return 0;
  let n = 0;
  if (p.owns_item) n += 8;
  else if (p.bought) n += 5;
  else if (p.fav) n += 3;
  if (p.trusted) n += 6;
  if (p.calls_n >= 3 && p.calls_right / p.calls_n >= 0.75) n += 4;
  return n;
}

// ── The one-time tip ──
const TIP_KEY = "ee_why_tip_seen";

export function whyTipSeen(): boolean {
  try { return localStorage.getItem(TIP_KEY) === "1"; } catch { return true; }
}

export function markWhyTipSeen() {
  try { localStorage.setItem(TIP_KEY, "1"); } catch { /* private mode: it just shows again */ }
}
