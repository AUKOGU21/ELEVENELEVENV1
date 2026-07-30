// ── Brand Library data ────────────────────────────────────────────────────────
// Hardcoded for the MVP, but shaped so it can move to a `brands` table later with
// zero changes to the UI. Community insights (from brand_insights) append to
// `thingsToKnow` at runtime; the counts below are the seeded baseline.

export interface Brand {
  slug: string;
  name: string;
  description: string;
  growing?: boolean;
  // Broad observations — "what would someone benefit from knowing before they buy?"
  whatWomenLearned: string[];
  // Practical purchase guidance, shown as titled cards. Community insights get
  // appended here at runtime (their category becomes the card title).
  thingsToKnow: { title: string; body: string }[];
  // Feed brand_name values that map to this brand (case-insensitive contains).
  matchNames: string[];
}

export const BRANDS: Brand[] = [
  {
    slug: "tibi",
    name: "Tibi",
    description: "Modern, relaxed tailoring that rewards repeat buyers.",
    matchNames: ["tibi"],
    whatWomenLearned: [
      "Tibi is intentionally relaxed.",
      "Most women stay true to size.",
      "Pieces layer beautifully across seasons.",
      "Their archive is exceptionally cohesive and mixes well across seasons.",
    ],
    thingsToKnow: [
      { title: "Fit", body: "Don't size down expecting a fitted silhouette." },
      { title: "Best for", body: "Great for relaxed, structured dressing." },
      { title: "New to the brand", body: "Their weekly styling classes are worth watching." },
    ],
  },
  {
    slug: "negative-underwear",
    name: "Negative Underwear",
    description: "Minimal essentials with mixed community feedback on value.",
    matchNames: ["negative underwear", "negative"],
    whatWomenLearned: [
      "Value for money comes up frequently in community discussions, particularly around the Whipped collection.",
    ],
    thingsToKnow: [
      { title: "Value", body: "Several shoppers felt comparable alternatives offered similar quality at a lower price." },
    ],
  },
  {
    slug: "jaded-london",
    name: "Jaded London",
    description: "Statement pieces with an especially strong following among taller shoppers.",
    growing: true,
    matchNames: ["jaded london", "jaded"],
    whatWomenLearned: [
      "Frequently recommended by taller women.",
      "Pants are consistently much longer than most brands.",
      "Known for oversized silhouettes and streetwear-inspired fits.",
    ],
    thingsToKnow: [
      { title: "Length", body: "Jeans and sweatpants often hit the floor on women who are 5'11\"+." },
      { title: "Rise & fit", body: "Most pants lean low rise with a baggy fit." },
      { title: "Sizing", body: "Many shoppers size down if they want a less oversized look." },
    ],
  },
];

export const brandBySlug = (slug: string): Brand | undefined =>
  BRANDS.find((b) => b.slug === slug);

// The "things we've learned" count = seeded observations + purchase guidance.
export const seededCount = (b: Brand): number =>
  b.whatWomenLearned.length + b.thingsToKnow.length;

// Insight categories + "who is this true for" contexts for the Share flow.
export const INSIGHT_CATEGORIES = ["Fit", "Sizing", "Quality", "Fabric", "Styling", "Shopping experience", "Other"];
export const INSIGHT_CONTEXTS = ["General", "Tall women", "Petite women", "Curvy", "Athletic", "Larger bust", "Smaller bust", "Long torso", "Short torso", "Other"];
