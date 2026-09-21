// ── Looking For types ─────────────────────────────────────────────────────────
// The shapes a "what should I buy?" post and its picks travel in. These used to
// live inside LookingForCard and RecommendationCard, two components the redesign
// replaced with LookingForView. The components went; the types are still the
// contract between the feed, the view and the recommendation modal.

export interface RecommendationData {
  id: string;
  recommendation: "buy" | "do_not_buy" | string;
  reasoning: string;
  fit_note: string | null;
  who_for: string | null;
  product_url: string | null;
  product_name: string | null;
  brand_name: string | null;
  price_note: string | null;
  product_image_url: string | null;
  match_score: number | null;
  /** Null when a guest sent it. Exactly one of these two is set. */
  user_id: string | null;
  created_at: string;
  profiles: { display_name: string | null; avatar_url?: string | null; badge_tier?: string | null } | null;
  /** Someone who answered from a shared link without an account. */
  guest_id?: string | null;
  guests?: { first_name: string; last_initial: string | null } | null;
}

/** What she ended up buying, once she's logged it. */
export interface LookingForOutcome {
  chosen_recommendation_id?: string | null;
  confidence_after?: number | null;
  alt_product_url?: string | null;
  alt_product_name?: string | null;
  alt_product_image_url?: string | null;
  alt_brand_name?: string | null;
  alt_price_note?: string | null;
  alt_reason?: string | null;
  bought_alternative?: boolean | null;
  // Received-it lifecycle, same shape decision cards use.
  arrival_status?: string | null;
  next_prompt_at?: string | null;
  kept?: boolean | null;
  recommend?: boolean | null;
  take?: string | null;
  photo_url?: string | null;
  followed_up_at?: string | null;
}

export interface LookingForFoundPayload {
  chosenRecommendationId: string | null;
  /** True when she bought the exact piece someone recommended. */
  boughtExact: boolean;
  productUrl: string | null;
  productName: string | null;
  productBrand: string | null;
  productPrice: string | null;
  productImageUrl: string | null;
  /** Why she went this way. Optional free text. */
  reason: string | null;
  confidenceAfter: number;
}

export interface LookingForDecision {
  id: string;
  user_id: string;
  created_at: string;
  status: string;
  confidence_score: number | null;
  lf_title: string | null;
  lf_budget: string | null;
  lf_occasion: string | null;
  lf_priorities: string[] | null;
  lf_context: string | null;
  matchScore?: number | null;
  recommendations: RecommendationData[];
  outcomes?: LookingForOutcome[] | null;
  profiles: { display_name: string | null; avatar_url: string | null; city: string | null; badge_tier?: string | null } | null;
}
