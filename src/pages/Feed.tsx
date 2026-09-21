import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import DecisionTile, { isResolved } from "@/components/DecisionTile";
import MatchSeal from "@/components/MatchSeal";
import DecisionView from "@/components/DecisionView";
import LookingForView from "@/components/LookingForView";
import { C as E11, SANS as E11_SANS, meta as e11Meta, display as e11Display, body as e11Body, strong as e11Strong } from "@/lib/design";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ThumbsUp, Check, ExternalLink, SlidersHorizontal, X, User, Info, ChevronDown, ChevronUp, Camera, ArrowRight, Bookmark, MoreHorizontal, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { computeMatchScore } from "@/lib/matching";
import { SILHOUETTE_OPTIONS } from "@/components/onboarding/OnboardingData";
import { DialInFitModal, shouldShowFitPrompt, missingFitCategories } from "@/components/DialInFitModal";
import { imageToJpeg } from "@/lib/image";
import OutcomeModal, { parsePrimaryUncertainty, outcomeDetailQuestion, outcomeDetailOptions, FIT_RESULT_OPTIONS } from "@/components/OutcomeModal";
import { type CommentData } from "@/components/CommentThread";
import FollowButton from "@/components/FollowButton";
import { track } from "@/lib/track";
import { ringStyle } from "@/lib/tiers";
import { ProductImage } from "@/components/ProductImage";
import FeedBanner from "@/components/FeedBanner";
import NotificationBanner from "@/components/NotificationBanner";
import NotificationPrompt from "@/components/NotificationPrompt";
import NotificationBell from "@/components/NotificationBell";
import { type LookingForFoundPayload } from "@/lib/lookingFor";
import RecommendationModal, { RecommendationDraft } from "@/components/RecommendationModal";
import ReferralPopup from "@/components/ReferralPopup";
import { ensureInviteCode, ensureReferral } from "@/lib/referral";
import { toast } from "sonner";
import { normalizeProductUrl } from "@/lib/url";
import WeighInSheet, { CONTEXT_OPTIONS, type WeighInPayload } from "@/components/WeighInSheet";

// ─── Product-link helpers ───────────────────────────────────────────────────
// normalizeProductUrl moved to lib/url so the extracted weigh-in sheet can use
// the same one.

// Clean label for a product link chip — the bare domain, e.g. "skims.com".
function prettyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResponseRow {
  id: string;
  recommendation: "buy" | "do_not_buy" | "need_more_info";
  reasoning: string;
  photo_url: string | null;
  product_url: string | null;
  match_score: number | null;
  helpfulness_votes: number;
  // Her exact words from the weigh-in context step (CONTEXT_OPTIONS).
  personal_experience?: string | null;
  user_id: string;
  created_at: string;
  profiles: { display_name: string | null; avatar_url?: string | null } | null;
  replies?: { id: string; user_id: string; body: string; created_at: string; profiles: { display_name: string | null; avatar_url?: string | null; badge_tier?: string | null } | null }[];
}

interface OutcomeRow {
  did_purchase: boolean | null;
  outcome_type: string | null;
  primary_uncertainty: string | null;
  tipping_factor: string | null;
  tipping_factor_other: string | null;
  size_bought: string | null;
  fit_result: string | null;
  fit_result_note: string | null;
  size_recommendation: string | null;
  outcome_detail: string | null;
  outcome_detail_other: string | null;
  kept: boolean | null;
  recommend: boolean | null;
  confidence_after: number | null;
  take: string | null;
  followed_up_at: string | null;
  created_at: string | null;
  arrival_status: string | null;
  next_prompt_at: string | null;
  received_at: string | null;
  photo_url: string | null;
  chosen_option?: string | null;
  // "Passed" flow: she skipped this item but bought something else instead.
  bought_alternative?: boolean | null;
  alt_product_url?: string | null;
  alt_product_name?: string | null;
  alt_product_image_url?: string | null;
  alt_brand_name?: string | null;
  alt_price_note?: string | null;
  alt_reason?: string | null;
  chosen_recommendation_id?: string | null;
}

interface DecisionRow {
  id: string;
  product_name: string | null;
  brand_name: string | null;
  product_image_url: string | null;
  product_image_url_2: string | null;
  product_url: string | null;
  product_url_2?: string | null;
  product_name_2?: string | null;
  brand_name_2?: string | null;
  price_note_2?: string | null;
  product_category: string | null;
  price_note: string | null;
  sizes_note: string | null;
  context_note: string | null;
  confidence_score: number;
  uncertainty_text: string | null;
  status: string;
  // When she decided. Comments after this are follow-ups.
  resolved_at?: string | null;
  user_id: string;
  created_at: string;
  // Looking For (post_type === "looking_for") — otherwise a normal decision.
  post_type?: string;
  lf_title?: string | null;
  lf_budget?: string | null;
  lf_occasion?: string | null;
  lf_priorities?: string[] | null;
  lf_context?: string | null;
  recommendations?: any[];
  matchScore?: number | null;
  responses: ResponseRow[];
  decision_comments?: CommentData[];
  outcomes: OutcomeRow[] | null;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
    badge_tier?: string | null;
    height_range: string | null;
    silhouette_preference: string[] | null;
    style_aesthetics: string[] | null;
    top_size: string | null;
    bottom_size: string | null;
    fit_preference: string | null;
    fit_details: Record<string, string> | null;
    age: number | null;
    city: string | null;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// CONTEXT_OPTIONS now lives with the weigh-in sheet, so both the feed and a
// shared decision ask the question the same way.

const CATEGORY_OPTIONS = ["All", "Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Accessories", "Bags"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatName = (displayName: string | null) => {
  if (!displayName) return "Anonymous";
  const parts = displayName.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
};

const getInitials = (displayName: string | null) => {
  if (!displayName) return "?";
  const parts = displayName.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const recommendationLabel = (rec: string) => {
  if (rec === "buy") return "Would buy";
  if (rec === "do_not_buy") return "Wouldn't buy";
  return "Depends";
};

const recommendationColor = (rec: string) => {
  if (rec === "buy") return "text-emerald-400";
  if (rec === "do_not_buy") return "text-rose-400";
  return "text-amber-400";
};

// Match-strength badge — single source of truth for every weigh-in renderer.
// taupe/flat (low) → gold glow (solid) → rose glow (strong).

// ─── Outcome card helpers ──────────────────────────────────────────────────────

type Sentiment = "happy" | "neutral" | "regret" | null;

interface OutcomeDisplay {
  headline: string;
  sentiment: Sentiment;
  contextLines: string[];
  writeIns: string[];
  sizeBought: string | null;
}

function buildOutcomeDisplay(outcome: OutcomeRow | null, status: string): OutcomeDisplay {
  const didBuy = status === "purchased";
  const primary = outcome?.primary_uncertainty ?? null;

  // ── Didn't buy ──────────────────────────────────────────────────────────────
  if (!didBuy) {
    const contextLines: string[] = [];
    if (outcome?.tipping_factor && outcome.tipping_factor !== "Something else") {
      contextLines.push(outcome.tipping_factor);
    }
    const writeIns = outcome?.tipping_factor_other ? [outcome.tipping_factor_other] : [];
    return { headline: "Didn't buy it", sentiment: null, contextLines, writeIns, sizeBought: null };
  }

  // ── Bought — no outcome data yet ────────────────────────────────────────────
  if (!outcome) {
    return { headline: "Bought it", sentiment: null, contextLines: [], writeIns: [], sizeBought: null };
  }

  // ── Flow 1: Between sizes / Will it fit right ────────────────────────────────
  if (primary === "Between sizes" || primary === "Will it fit right") {
    // Only assert a sentiment when fit was actually captured (the full modal).
    // The quick "Bought it → which size?" path records size alone, no fit judgment.
    let sentiment: Sentiment = outcome.fit_result ? "happy" : null;
    if (outcome.fit_result === "Not at all what I expected" || outcome.size_recommendation === "Don't buy") {
      sentiment = "regret";
    } else if (outcome.fit_result === "OK fit, but not perfect") {
      sentiment = "neutral";
    }
    const contextLines: string[] = [];
    if (outcome.fit_result) contextLines.push(outcome.fit_result);
    if (outcome.size_recommendation) contextLines.push(`Recommends: ${outcome.size_recommendation}`);
    const writeIns = [outcome.fit_result_note, outcome.tipping_factor_other].filter(Boolean) as string[];
    return { headline: "Bought it", sentiment, contextLines, writeIns, sizeBought: outcome.size_bought ?? null };
  }

  // ── Flow 2: Will it flatter me ───────────────────────────────────────────────
  if (primary === "Will it flatter me") {
    const detailMap: Record<string, { sentiment: Sentiment; text: string }> = {
      "Better than expected": { sentiment: "happy", text: "It looked and felt better than expected" },
      "As expected":          { sentiment: "neutral", text: "It looked and felt as expected" },
      "Nothing like I imagined": { sentiment: "regret", text: "It looked and felt nothing like I imagined" },
    };
    const match = outcome.outcome_detail ? detailMap[outcome.outcome_detail] : null;
    const writeIns = [outcome.outcome_detail_other, outcome.tipping_factor_other].filter(Boolean) as string[];
    return {
      headline: "Bought it",
      sentiment: match?.sentiment ?? null,
      contextLines: match ? [match.text] : [],
      writeIns,
      sizeBought: null,
    };
  }

  // ── Flow 3: Hard to tell from photos ─────────────────────────────────────────
  if (primary === "Hard to tell from photos") {
    const detailMap: Record<string, { sentiment: Sentiment; text: string }> = {
      "Yes, matched my expectations": { sentiment: "happy",   text: "It matched my expectations" },
      "Somewhat":                      { sentiment: "neutral", text: "It somewhat matched my expectations" },
      "Not at all":                    { sentiment: "regret",  text: "" }, // regret badge says it all
    };
    const match = outcome.outcome_detail ? detailMap[outcome.outcome_detail] : null;
    const contextLines = match?.text ? [match.text] : [];
    const writeIns = [outcome.outcome_detail_other, outcome.tipping_factor_other].filter(Boolean) as string[];
    return { headline: "Bought it", sentiment: match?.sentiment ?? null, contextLines, writeIns, sizeBought: null };
  }

  // ── Flow 4: Worth the price ──────────────────────────────────────────────────
  if (primary === "Worth the price") {
    let sentiment: Sentiment = null;
    let contextText: string | null = null;
    if (outcome.outcome_detail === "Yes") {
      sentiment = "happy";
      contextText = "Yes, it was worth it";
    } else if (outcome.outcome_detail === "No") {
      sentiment = "regret";
      contextText = "No, it wasn't worth it";
    }
    // "Other" → no sentence, only write-in text
    const writeIns = [outcome.outcome_detail_other, outcome.tipping_factor_other].filter(Boolean) as string[];
    return {
      headline: "Bought it",
      sentiment,
      contextLines: contextText ? [contextText] : [],
      writeIns,
      sizeBought: null,
    };
  }

  // ── Flow 5: Quality concerns ─────────────────────────────────────────────────
  if (primary === "Quality concerns") {
    const detailMap: Record<string, Sentiment> = {
      "Yes, loved the quality":  "happy",
      "Quality was okay":        "neutral",
      "No, I was disappointed":  "regret",
    };
    const sentiment = outcome.outcome_detail ? (detailMap[outcome.outcome_detail] ?? null) : null;
    const contextLines = outcome.outcome_detail ? [outcome.outcome_detail] : [];
    const writeIns = [outcome.outcome_detail_other, outcome.tipping_factor_other].filter(Boolean) as string[];
    return { headline: "Bought it", sentiment, contextLines, writeIns, sizeBought: null };
  }

  // ── Flow 6: Not sure about the color ─────────────────────────────────────────
  if (primary === "Not sure about the color") {
    const detailMap: Record<string, { sentiment: Sentiment; text: string }> = {
      "Yes, loved it":       { sentiment: "happy",   text: "I loved the color IRL" },
      "It was okay":         { sentiment: "neutral",  text: "The color was OK IRL" },
      "No, not as expected": { sentiment: "regret",   text: "The color was not what I expected at all" },
    };
    const match = outcome.outcome_detail ? detailMap[outcome.outcome_detail] : null;
    const writeIns = [outcome.outcome_detail_other, outcome.tipping_factor_other].filter(Boolean) as string[];
    return {
      headline: "Bought it",
      sentiment: match?.sentiment ?? null,
      contextLines: match ? [match.text] : [],
      writeIns,
      sizeBought: null,
    };
  }

  // ── Flow 7: Other ────────────────────────────────────────────────────────────
  const writeIns = [outcome.tipping_factor_other].filter(Boolean) as string[];
  return { headline: "Bought it", sentiment: null, contextLines: [], writeIns, sizeBought: null };
}

const SENTIMENT_STYLE: Record<NonNullable<Sentiment>, { color: string; bg: string; border: string; label: string }> = {
  happy:   { color: "#6B8C6B", bg: "rgba(107,140,107,0.10)", border: "rgba(107,140,107,0.28)", label: "Happy with my purchase" },
  neutral: { color: "#C49E64", bg: "rgba(196,158,100,0.10)", border: "rgba(196,158,100,0.28)", label: "Mixed on it" },
  regret:  { color: "#7A4040", bg: "rgba(122,64,64,0.10)",   border: "rgba(122,64,64,0.28)",   label: "Regret my purchase" },
};

// ─── Mobile hook ─────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Feed = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Follow-up banner: jump to Mine and scroll straight to that card.
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // ── Data state
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [myDecisions, setMyDecisions] = useState<DecisionRow[]>([]);
  const [activeTab, setActiveTab] = useState<"feed" | "mine">("feed");
  // Honor a tab hint passed via navigation (e.g. "Mine" clicked from Brand Library).
  useEffect(() => {
    if ((location.state as any)?.tab === "mine") setActiveTab("mine");
  }, [location.state]);
  useEffect(() => {
    if (!scrollTargetId || activeTab !== "mine") return;
    const t = setTimeout(() => {
      document.getElementById(`dec-${scrollTargetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollTargetId(null);
    }, 120);
    return () => clearTimeout(t);
  }, [scrollTargetId, activeTab]);
  const [loading, setLoading] = useState(true);
  const loadedOnceRef = useRef(false);

  // ── Filters
  const [filterBrand, setFilterBrand] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("all");
  const [sortBy, setSortBy] = useState<"newest" | "discussed" | "needs_input" | "relevant">("newest");
  const [filterOpen, setFilterOpen] = useState(false);

  // ── Weigh-in flow
  const [weighingIn, setWeighingIn] = useState<string | null>(null);
  const [weighInStep, setWeighInStep] = useState<"context" | "vote" | "take" | "done">("context");
  // The sheet keeps her draft while it is merely dismissed, so finishing or
  // cancelling has to say so explicitly. Without this, reopening the same
  // decision would hand her back the take she already sent.
  const [weighInResetKey, setWeighInResetKey] = useState(0);
  const [showFitModal, setShowFitModal] = useState(false);
  const [fitModalVariant, setFitModalVariant] = useState<"weigh_in" | "post_decision">("weigh_in");
  const [context, setContext] = useState<string | null>(null);
  const [vote, setVote] = useState<"buy" | "do_not_buy" | "need_more_info" | null>(null);
  const [take, setTake] = useState("");
  const [takeLink, setTakeLink] = useState("");
  const [takePhoto, setTakePhoto] = useState<File | null>(null);
  const [takePhotoPreview, setTakePhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const takePhotoInputRef = useRef<HTMLInputElement>(null);

  // ── Modals & overlays
  const [trackingId, setTrackingId] = useState<string | null>(null);
  // Pre-seeds the outcome modal when opened from the Bought it / Passed buttons.
  const [outcomeInitial, setOutcomeInitial] = useState<"bought_it" | "didnt_buy" | null>(null);
  // For two-option decisions: which option she chose when logging the outcome.
  const [outcomeChosen, setOutcomeChosen] = useState<"first" | "second" | "both" | null>(null);
  const [loggedOutcomeIds, setLoggedOutcomeIds] = useState<Set<string>>(new Set());
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Which decision's responses drawer is open (right-side sliding panel).
  const [responsesOpenId, setResponsesOpenId] = useState<string | null>(null);
  // Response to auto-expand/scroll to when the drawer opens (reply deep-link).
  const [focusResponseId, setFocusResponseId] = useState<string | null>(null);
  // The decision view. Opening a tile lays her decision over the feed; the feed
  // stays mounted underneath, so closing lands you exactly where you were.
  const [openDecisionId, setOpenDecisionId] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<"responses" | "followups">("responses");
  const openDecision = (id: string, responseId: string | null = null, tabName: "responses" | "followups" = "responses") => {
    track("card_open", { decisionId: id, userId: user?.id ?? null });
    setFocusResponseId(responseId);
    setOpenTab(tabName);
    setOpenDecisionId(id);
  };
  const closeDecision = () => { setOpenDecisionId(null); setFocusResponseId(null); };
  // Handed a decision by another page (a tile on a profile): open it here. If it's
  // older than the newest 50 the feed loads, fetch it on its own first.
  const openFromStateRef = useRef<string | null>(null);
  useEffect(() => {
    const want = (location.state as any)?.openDecisionId as string | undefined;
    if (!want || loading || openFromStateRef.current === want) return;
    openFromStateRef.current = want;
    window.history.replaceState({}, "");
    if ([...decisions, ...myDecisions].some((x) => x.id === want)) { openDecision(want); return; }
    (async () => {
      const { data: row } = await supabase
        .from("decisions")
        .select(`
          id, product_name, brand_name, product_image_url, product_image_url_2, product_url, product_url_2, product_name_2, brand_name_2, price_note_2, product_category,
          price_note, sizes_note, context_note, confidence_score, uncertainty_text, status, resolved_at, user_id, created_at,
          post_type, lf_title, lf_budget, lf_occasion, lf_priorities, lf_context,
          profiles ( display_name, avatar_url, badge_tier, height_range, silhouette_preference, style_aesthetics, top_size, bottom_size, fit_preference, fit_details, age, city ),
          responses ( id, recommendation, reasoning, photo_url, product_url, match_score, personal_experience, helpfulness_votes, user_id, guest_id, created_at, profiles ( display_name, avatar_url, badge_tier ), guests ( first_name, last_initial ) ),
          decision_comments ( id, user_id, body, created_at, updated_at, profiles ( display_name, avatar_url, badge_tier ) )
        `)
        .eq("id", want)
        .is("deleted_at", null)
        .maybeSingle();
      if (!row) return;
      const { data: outs } = await supabase.from("outcomes").select("*").eq("decision_id", want).order("created_at", { ascending: false }).limit(1);
      const full = { ...(row as any), outcomes: outs ?? [], recommendations: (row as any).recommendations ?? [] } as DecisionRow;
      setDecisions((prev) => (prev.some((x) => x.id === want) ? prev : [...prev, full]));
      openDecision(want);
    })();
  }, [location.state, loading]);
  // Looking For: which post's recommendations drawer is open, and the recommend modal.
  const [recModalFor, setRecModalFor] = useState<string | null>(null);
  const [submittingRec, setSubmittingRec] = useState(false);
  // Referral / Shopping Circle: one-time invite prompt.
  const [showReferral, setShowReferral] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const referralArmedRef = useRef(false);

  // ── User meta
  const [myProfile, setMyProfile] = useState<{ display_name: string | null; avatar_url: string | null; invite_code?: string | null; referral_prompt_dismissed_at?: string | null; fit_details?: Record<string, unknown> | null; badge_tier?: string | null; fit_prompt_dismissed_at?: string | null } | null>(null);
  // Only the questions she hasn't answered. Empty means she's done, and no
  // trigger in this file may open the modal.
  const missingFit = missingFitCategories(myProfile?.fit_details);
  // She gets asked once, on our initiative, ever. The stamp lives on her profile
  // so it holds across devices: no localStorage, no second chance from a new
  // browser. Anything still missing after that she can fill from her profile.
  const mayAskAboutFit = !!myProfile && !myProfile.fit_prompt_dismissed_at && missingFit.length > 0;

  // Who I follow. Ids only — no counts are shown anywhere yet.
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // ── Activation nudge: surface one matched decision to brand-new users.
  // Persists until they weigh in once — no manual dismiss.
  const [hasWeighedIn, setHasWeighedIn] = useState<boolean | null>(null);

  // ── Vote state
  const [userVotes, setUserVotes] = useState<Record<string, "helpful" | "not_helpful">>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, { helpful: number; not_helpful: number }>>({});

  // ── Save / hide state
  const [savedDecisionIds, setSavedDecisionIds] = useState<Set<string>>(new Set());
  const [hiddenDecisionIds, setHiddenDecisionIds] = useState<Set<string>>(new Set());
  const [undoHiddenId, setUndoHiddenId] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weighInCompletedRef = useRef(false);
  // Fit-prompt modal: track its pending timer so it can't fire at a stale moment
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitPromptShownRef = useRef(false); // at most one fit prompt per session
  const fitPromptHandledRef = useRef(false);

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchDecisions();

    const channel = supabase
      .channel("feed-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => fetchDecisions())
      .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, () => fetchDecisions())
      .on("postgres_changes", { event: "*", schema: "public", table: "response_replies" }, () => fetchDecisions())
      .on("postgres_changes", { event: "*", schema: "public", table: "recommendations" }, () => fetchDecisions())
      .on("postgres_changes", { event: "*", schema: "public", table: "outcomes" }, () => fetchDecisions())
      .subscribe();

    // Show fit modal after posting a decision (navigated here with state) — exactly once,
    // even if this effect re-runs when `user` changes (auth resolve / token refresh).
    const variant = (location.state as any)?.fitPromptVariant;
    if (variant && !fitPromptHandledRef.current && !fitPromptShownRef.current && user && mayAskAboutFit && shouldShowFitPrompt(user.id)) {
      fitPromptHandledRef.current = true;
      window.history.replaceState({}, "");
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
      fitTimerRef.current = setTimeout(() => {
        fitTimerRef.current = null;
        fitPromptShownRef.current = true;
        setFitModalVariant("post_decision");
        setShowFitModal(true);
      }, 4000);
    }

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Cancel any pending fit-prompt timer if the component unmounts
  useEffect(() => () => { if (fitTimerRef.current) clearTimeout(fitTimerRef.current); }, []);

  useEffect(() => {
    if (!user) { setSavedDecisionIds(new Set()); setHiddenDecisionIds(new Set()); return; }
    const loadSaveHide = async () => {
      const [{ data: saved }, { data: hidden }] = await Promise.all([
        supabase.from("saved_decisions").select("decision_id").eq("user_id", user.id),
        supabase.from("hidden_decisions").select("decision_id").eq("user_id", user.id),
      ]);
      if (saved) setSavedDecisionIds(new Set(saved.map((r: any) => r.decision_id)));
      if (hidden) setHiddenDecisionIds(new Set(hidden.map((r: any) => r.decision_id)));
    };
    loadSaveHide();
  }, [user]);

  useEffect(() => {
    if (!user) { setUserVotes({}); return; }
    const loadUserVotes = async () => {
      const { data } = await supabase
        .from("response_votes")
        .select("response_id, vote_type")
        .eq("voter_id", user.id);
      if (data) {
        const map: Record<string, "helpful" | "not_helpful"> = {};
        data.forEach((v) => { map[v.response_id] = v.vote_type; });
        setUserVotes(map);
      }
    };
    loadUserVotes();
  }, [user]);

  // Has this user ever weighed in? Drives the activation nudge (shown only to
  // accounts that have never weighed in and never posted).
  useEffect(() => {
    if (!user) { setHasWeighedIn(null); return; }
    supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setHasWeighedIn((count ?? 0) > 0));
  }, [user]);

  // ─── Data fetch ──────────────────────────────────────────────────────────────

  const fetchDecisions = async () => {
    if (!loadedOnceRef.current) setLoading(true);

    // Attach community recommendations (+ their helpful votes) to Looking For posts.
    // Fetched separately from the main feed query so a recommendations hiccup can
    // never 400 the whole feed (column-first discipline).
    const attachRecs = async (rows: DecisionRow[]): Promise<DecisionRow[]> => {
      const lfIds = rows.filter((r) => r.post_type === "looking_for").map((r) => r.id);
      if (lfIds.length === 0) return rows.map((r) => ({ ...r, recommendations: r.recommendations ?? [] }));
      try {
        const { data: recsRaw } = await supabase
          .from("recommendations")
          .select("id, looking_for_id, recommendation, reasoning, fit_note, who_for, product_url, product_name, brand_name, price_note, product_image_url, match_score, user_id, created_at")
          .in("looking_for_id", lfIds)
          .order("created_at", { ascending: false });
        const recs = recsRaw ?? [];
        // Attach recommender profiles separately — recommendations has no PostgREST
        // FK to profiles, so an embed would 400 the whole select.
        const recUserIds = [...new Set(recs.map((r: any) => r.user_id))];
        if (recUserIds.length > 0) {
          const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url, badge_tier").in("id", recUserIds);
          const profMap: Record<string, any> = {};
          (profs ?? []).forEach((p: any) => { profMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url }; });
          recs.forEach((r: any) => { r.profiles = profMap[r.user_id] ?? null; });
        }
        const byLf: Record<string, any[]> = {};
        recs.forEach((rec: any) => { (byLf[rec.looking_for_id] ??= []).push(rec); });
        const recIds = recs.map((r: any) => r.id);
        if (recIds.length > 0) {
          const { data: allRV } = await supabase.from("recommendation_votes").select("recommendation_id, vote_type").in("recommendation_id", recIds);
          if (allRV) {
            const counts: Record<string, { helpful: number; not_helpful: number }> = {};
            allRV.forEach((v: any) => { (counts[v.recommendation_id] ??= { helpful: 0, not_helpful: 0 })[v.vote_type === "helpful" ? "helpful" : "not_helpful"]++; });
            setVoteCounts((prev) => ({ ...prev, ...counts }));
          }
          if (user) {
            const { data: myRV } = await supabase.from("recommendation_votes").select("recommendation_id, vote_type").eq("voter_id", user.id).in("recommendation_id", recIds);
            if (myRV) {
              const map: Record<string, "helpful" | "not_helpful"> = {};
              myRV.forEach((v: any) => { map[v.recommendation_id] = v.vote_type; });
              setUserVotes((prev) => ({ ...prev, ...map }));
            }
          }
        }
        return rows.map((r) => ({ ...r, recommendations: byLf[r.id] ?? [] }));
      } catch (e) {
        console.error("recommendations fetch failed:", e);
        return rows.map((r) => ({ ...r, recommendations: r.recommendations ?? [] }));
      }
    };

    // Attach clarifying replies to each response (separate fetch — no FK embed dep).
    const attachReplies = async (rows: DecisionRow[]): Promise<DecisionRow[]> => {
      const respIds = rows.flatMap((d) => (d.responses ?? []).map((r) => r.id));
      if (respIds.length === 0) return rows;
      try {
        const { data: repliesRaw } = await supabase
          .from("response_replies")
          .select("id, response_id, user_id, body, created_at")
          .in("response_id", respIds)
          .order("created_at", { ascending: true });
        const rep = repliesRaw ?? [];
        const uids = [...new Set(rep.map((r: any) => r.user_id))];
        const profMap: Record<string, any> = {};
        if (uids.length) {
          const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url, badge_tier").in("id", uids);
          (profs ?? []).forEach((p: any) => { profMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url, badge_tier: p.badge_tier }; });
        }
        const byResp: Record<string, any[]> = {};
        rep.forEach((r: any) => { (byResp[r.response_id] ??= []).push({ ...r, profiles: profMap[r.user_id] ?? null }); });
        return rows.map((d) => ({ ...d, responses: (d.responses ?? []).map((r) => ({ ...r, replies: byResp[r.id] ?? [] })) }));
      } catch (e) {
        console.error("replies fetch failed:", e);
        return rows;
      }
    };

    // No outcomes join here — we fetch outcomes separately below to avoid
    // PostgREST FK detection issues causing the join to silently return null.
    const query = `
      id, product_name, brand_name, product_image_url, product_image_url_2, product_url, product_url_2, product_name_2, brand_name_2, price_note_2, product_category,
      price_note, sizes_note, context_note, confidence_score, uncertainty_text, status, resolved_at, user_id, created_at,
      post_type, lf_title, lf_budget, lf_occasion, lf_priorities, lf_context,
      profiles ( display_name, avatar_url, badge_tier, height_range, silhouette_preference, style_aesthetics, top_size, bottom_size, fit_preference, fit_details, age, city ),
      responses (
        id, recommendation, reasoning, photo_url, product_url, match_score, personal_experience,
        helpfulness_votes, user_id, guest_id, created_at,
        profiles ( display_name, avatar_url, badge_tier ),
        guests ( first_name, last_initial )
      ),
      decision_comments (
        id, user_id, body, created_at, updated_at,
        profiles ( display_name, avatar_url, badge_tier )
      )
    `;

    const [{ data: feedData }, profileResult] = await Promise.all([
      supabase
        .from("decisions")
        .select(query)
        .eq("is_public", true)
        .is("deleted_at", null)
        .neq("status", "outcome_logged")
        .order("created_at", { ascending: false })
        .limit(50),
      user
        ? supabase.from("profiles").select("*").eq("id", user.id).single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const myProfileData = (profileResult as any).data ?? null;
    if (myProfileData) setMyProfile({ display_name: myProfileData.display_name, avatar_url: myProfileData.avatar_url, invite_code: myProfileData.invite_code ?? null, referral_prompt_dismissed_at: myProfileData.referral_prompt_dismissed_at ?? null, fit_details: myProfileData.fit_details ?? null, badge_tier: myProfileData.badge_tier ?? null, fit_prompt_dismissed_at: myProfileData.fit_prompt_dismissed_at ?? null });
    // Signed in, never finished onboarding: no name, no fit. Three accounts are in
    // this state and not one of them got past the door. Send her back to finish
    // instead of dropping her into a feed that calls her "Someone".
    if (myProfileData && myProfileData.onboarding_completed === false) {
      navigate("/onboarding?resume=true", { replace: true });
    }

    const local = JSON.parse(localStorage.getItem("eleven_decisions") || "[]");
    const localFormatted: DecisionRow[] = local.map((d: any) => ({
      id: d.id,
      product_name: d.product?.name ?? null,
      brand_name: d.product?.brand ?? null,
      product_image_url: d.product?.image ?? null,
      product_image_url_2: null,
      confidence_score: d.confidence ?? 5,
      uncertainty_text: d.uncertainties?.join(", ") ?? null,
      status: "open",
      user_id: "local",
      created_at: new Date().toISOString(),
      responses: [],
      outcomes: null,
      profiles: null,
    }));

    if (feedData) {
      let rows = feedData as unknown as DecisionRow[];

      // ── Fetch outcomes ───────────────────────────────────────────────────────
      const allDecisionIds = rows.map((r) => r.id);
      if (allDecisionIds.length > 0) {
        const { data: outcomesData } = await supabase
          .from("outcomes")
          .select("decision_id, did_purchase, outcome_type, primary_uncertainty, tipping_factor, tipping_factor_other, size_bought, fit_result, fit_result_note, size_recommendation, outcome_detail, outcome_detail_other, kept, recommend, confidence_after, take, followed_up_at, created_at, arrival_status, next_prompt_at, received_at, photo_url, chosen_option, bought_alternative, alt_product_url, alt_product_name, alt_product_image_url, alt_brand_name, alt_price_note, alt_reason, chosen_recommendation_id")
          .in("decision_id", allDecisionIds)
          .order("created_at", { ascending: false });

        if (outcomesData && outcomesData.length > 0) {
          const outcomeMap: Record<string, OutcomeRow> = {};
          outcomesData.forEach((o: any) => { outcomeMap[o.decision_id] = o; });
          rows = rows.map((d) => ({
            ...d,
            outcomes: outcomeMap[d.id] ? [outcomeMap[d.id]] : null,
          }));
        }
      }

      if (myProfileData) {
        rows = rows.map((d) => ({
          ...d,
          matchScore: d.user_id === user?.id || !d.profiles
            ? null
            : computeMatchScore(myProfileData, d.profiles as any).total,
        }));
        rows.sort((a, b) => {
          const dateDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          return dateDiff !== 0 ? dateDiff : (b.matchScore ?? -1) - (a.matchScore ?? -1);
        });
      }

      rows = await attachRecs(rows);
      rows = await attachReplies(rows);
      setDecisions(user ? rows : [...localFormatted, ...rows]);

      const allResponseIds = rows.flatMap((d) => d.responses?.map((r) => r.id) ?? []);
      if (allResponseIds.length > 0) {
        const { data: allVotes } = await supabase
          .from("response_votes")
          .select("response_id, vote_type")
          .in("response_id", allResponseIds);

        if (allVotes) {
          const counts: Record<string, { helpful: number; not_helpful: number }> = {};
          allVotes.forEach((v) => {
            if (!counts[v.response_id]) counts[v.response_id] = { helpful: 0, not_helpful: 0 };
            if (v.vote_type === "helpful") counts[v.response_id].helpful++;
            else counts[v.response_id].not_helpful++;
          });
          setVoteCounts(counts);
        }

        if (user) {
          const { data: myVoteData } = await supabase
            .from("response_votes")
            .select("response_id, vote_type")
            .eq("voter_id", user.id)
            .in("response_id", allResponseIds);
          if (myVoteData) {
            const map: Record<string, "helpful" | "not_helpful"> = {};
            myVoteData.forEach((v) => { map[v.response_id] = v.vote_type; });
            setUserVotes(map);
          }
        }
      }
    }

    if (user) {
      const { data: myData } = await supabase
        .from("decisions")
        .select(query)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (myData) {
        let myRows = myData as unknown as DecisionRow[];

        // Fetch outcomes for my decisions too
        const myDecisionIds = myRows.map((r) => r.id);
        if (myDecisionIds.length > 0) {
          const { data: myOutcomesData } = await supabase
            .from("outcomes")
            .select("decision_id, did_purchase, outcome_type, primary_uncertainty, tipping_factor, tipping_factor_other, size_bought, fit_result, fit_result_note, size_recommendation, outcome_detail, outcome_detail_other, kept, recommend, confidence_after, take, followed_up_at, created_at, arrival_status, next_prompt_at, received_at, photo_url, chosen_option, bought_alternative, alt_product_url, alt_product_name, alt_product_image_url, alt_brand_name, alt_price_note, alt_reason, chosen_recommendation_id")
            .in("decision_id", myDecisionIds)
            .order("created_at", { ascending: false });

          if (myOutcomesData && myOutcomesData.length > 0) {
            const myOutcomeMap: Record<string, OutcomeRow> = {};
            myOutcomesData.forEach((o: any) => { myOutcomeMap[o.decision_id] = o; });
            myRows = myRows.map((d) => ({
              ...d,
              outcomes: myOutcomeMap[d.id] ? [myOutcomeMap[d.id]] : null,
            }));
          }
        }

        myRows = await attachRecs(myRows);
        myRows = await attachReplies(myRows);
        setMyDecisions(myRows);
      }
    } else {
      setMyDecisions(localFormatted);
    }

    setLoading(false);
    loadedOnceRef.current = true;
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  // Which decision the in-progress weigh-in draft belongs to (so tapping away and
  // reopening the same decision resumes the draft instead of wiping it).
  const weighInDraftIdRef = useRef<string | null>(null);

  const startWeighIn = (id: string) => {
    track("weigh_in_start", { decisionId: id, userId: user?.id ?? null });
    // Starting a new action cancels any pending fit-prompt so it can't pop over this flow
    if (fitTimerRef.current) { clearTimeout(fitTimerRef.current); fitTimerRef.current = null; }
    // Resume an existing draft for this same decision rather than clearing it.
    const resuming = weighInDraftIdRef.current === id && (take.trim() || takeLink.trim() || !!vote || !!context);
    setWeighingIn(id);
    if (!resuming) {
      weighInDraftIdRef.current = id;
      setWeighInStep("context");
      setContext(null);
      setVote(null);
      setTake("");
      setTakeLink("");
    }
  };

  // Tapping the scrim just hides the sheet — the draft stays so reopening resumes it.
  const dismissWeighIn = () => setWeighingIn(null);

  // Explicit Cancel discards the draft (confirm first if there's unsaved text).
  const cancelWeighIn = () => {
    // The sheet already asked before calling this, since it holds the draft.
    setWeighInResetKey((k) => k + 1);
    weighInDraftIdRef.current = null;
    setWeighingIn(null);
    setWeighInStep("context");
    setContext(null);
    setVote(null);
    setTake("");
    setTakeLink("");
    setTakePhoto(null);
    setTakePhotoPreview(null);
  };

  // One-tap outcome log from the card prompt: saves the core signal, flips
  // status so the card shows its logged state, and fires the close-the-loop email.
  // The 2-week follow-up: records kept/returned, recommend, ending confidence, and
  // an optional take, and stamps followed_up_at so the card fills in and the nudge stops.
  // Generic optimistic patch to a decision's outcome row.
  const updateOutcome = async (id: string, patch: Record<string, any>) => {
    if (!user) return;
    const merge = (d: DecisionRow): DecisionRow =>
      d.id === id ? { ...d, outcomes: [{ ...(d.outcomes?.[0] ?? {} as any), ...patch }] } : d;
    setDecisions(prev => prev.map(merge));
    setMyDecisions(prev => prev.map(merge));
    try {
      await supabase.from("outcomes").update(patch).eq("decision_id", id);
    } catch (e) {
      console.error("outcome update failed:", e);
    }
  };

  // Upload an outcome photo to storage and return its public URL. Shared by the
  // received-it and returned flows. Returns null if there's no file or it fails.
  const uploadOutcomePhoto = async (id: string, file: File | null): Promise<string | null> => {
    if (!file || !user) return null;
    try {
      let body: Blob = file;
      try { body = await imageToJpeg(file); } catch { /* fall back to raw */ }
      const path = `outcome-photos/${user.id}/${id}-${Date.now()}.jpg`;
      const { data: up } = await supabase.storage.from("product-images").upload(path, body, { upsert: true, contentType: "image/jpeg" });
      if (up) return supabase.storage.from("product-images").getPublicUrl(up.path).data.publicUrl;
    } catch (e) { console.warn("outcome photo upload failed:", e); }
    return null;
  };

  // "Received it" completion: tailored fit/detail answer + kept + recommend + confidence + optional photo.
  const submitReceived = async (
    id: string,
    data: { primary: string; detailAnswer: string | null; kept: boolean | null; recommend: boolean | null; confidence: number | null; photoFile: File | null; take: string | null },
  ) => {
    if (!user) return;
    const photoUrl = await uploadOutcomePhoto(id, data.photoFile);
    const fitLike = data.primary === "Between sizes" || data.primary === "Will it fit right";
    await updateOutcome(id, {
      arrival_status: "received",
      received_at: new Date().toISOString(),
      followed_up_at: new Date().toISOString(),
      kept: data.kept,
      recommend: data.recommend,
      ...(data.confidence != null ? { confidence_after: data.confidence } : {}),
      ...(fitLike ? { fit_result: data.detailAnswer } : { outcome_detail: data.detailAnswer }),
      ...(data.take && data.take.trim() ? { take: data.take.trim() } : {}),
      ...(photoUrl ? { photo_url: photoUrl } : {}),
    });
  };

  // "Returned / canceled" completion: mark not kept, save the reason + an optional
  // photo (even a bad outcome helps the next woman see why).
  const submitReturned = async (id: string, data: { note: string | null; photoFile: File | null }) => {
    if (!user) return;
    const photoUrl = await uploadOutcomePhoto(id, data.photoFile);
    await updateOutcome(id, {
      arrival_status: "returned",
      kept: false,
      take: data.note && data.note.trim() ? data.note.trim() : null,
      ...(photoUrl ? { photo_url: photoUrl } : {}),
      followed_up_at: new Date().toISOString(),
    });
  };

  const submitFollowup = async (
    id: string,
    data: { kept: boolean; recommend: boolean | null; confidenceAfter: number | null; take: string | null },
  ) => {
    if (!user) return;
    const patch: any = {
      kept: data.kept,
      recommend: data.recommend,
      confidence_after: data.confidenceAfter,
      take: data.take && data.take.trim() ? data.take.trim() : null,
      followed_up_at: new Date().toISOString(),
    };
    const merge = (d: DecisionRow): DecisionRow =>
      d.id === id ? { ...d, outcomes: [{ ...(d.outcomes?.[0] ?? {} as any), ...patch }] } : d;
    setDecisions(prev => prev.map(merge));
    setMyDecisions(prev => prev.map(merge));
    try {
      await supabase.from("outcomes").update(patch).eq("decision_id", id);
    } catch (e) {
      console.error("followup submit failed:", e);
    }
  };

  const quickLogOutcome = async (id: string, outcome: "bought_it" | "didnt_buy", sizeBought?: string) => {
    if (!user) return;
    const did = outcome === "bought_it";
    const newStatus = did ? "purchased" : "closed";
    // For a between-sizes purchase we also capture which size she landed on — the
    // highest-value signal in the whole app. primary_uncertainty flags it so the
    // outcome card renders "Purchased size N".
    const outcomeRow: any = { did_purchase: did, outcome_type: outcome };
    if (sizeBought) { outcomeRow.size_bought = sizeBought; outcomeRow.primary_uncertainty = "Between sizes"; }
    const patch = { status: newStatus, outcomes: [outcomeRow] } as any;
    setLoggedOutcomeIds(prev => { const next = new Set(prev); next.add(id); return next; });
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
    setMyDecisions(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
    try {
      await supabase.from("outcomes").upsert(
        { decision_id: id, user_id: user.id, ...outcomeRow },
        { onConflict: "decision_id" },
      );
      await supabase.from("decisions").update({ status: newStatus }).eq("id", id);
      supabase.functions
        .invoke("notify-outcome", { body: { decision_id: id } })
        .catch((e) => console.warn("outcome notify failed:", e));
    } catch (e) {
      console.error("quick log outcome failed:", e);
    }
  };

  // "Still deciding": a living, paused state — no status change, the decision stays
  // open and its buttons stay live. We only keep a lightweight note that she paused
  // here so we can see how often decisions stall.
  const quickStillDeciding = async (id: string) => {
    if (!user) return;
    const outcomeRow = { did_purchase: false, outcome_type: "still_deciding" };
    const merge = (d: DecisionRow): DecisionRow =>
      d.id === id ? { ...d, outcomes: [{ ...(d.outcomes?.[0] ?? {} as any), ...outcomeRow }] } : d;
    setDecisions(prev => prev.map(merge));
    setMyDecisions(prev => prev.map(merge));
    try {
      await supabase.from("outcomes").upsert({ decision_id: id, user_id: user.id, ...outcomeRow }, { onConflict: "decision_id" });
    } catch (e) {
      console.error("still-deciding note failed:", e);
    }
  };

  // ── Looking For outcomes ───────────────────────────────────────────────────
  // She found it. Records what she bought (pulled product or the recommended one),
  // credits the recommendation that got her there, and closes the post.
  const saveLookingForOutcome = async (id: string, p: LookingForFoundPayload) => {
    if (!user) return;
    const outcomeRow: any = {
      did_purchase: true,
      outcome_type: "bought_it",
      chosen_recommendation_id: p.chosenRecommendationId,
      // bought_alternative marks "not the exact piece someone recommended", which
      // is what the card reads to say "different piece, same brand".
      bought_alternative: p.chosenRecommendationId ? !p.boughtExact : true,
      alt_product_url: p.productUrl,
      alt_product_name: p.productName,
      alt_brand_name: p.productBrand,
      alt_price_note: p.productPrice,
      alt_product_image_url: p.productImageUrl,
      alt_reason: p.reason,
      confidence_after: p.confidenceAfter,
    };

    const merge = (d: DecisionRow): DecisionRow =>
      d.id === id ? { ...d, status: "closed", outcomes: [{ ...(d.outcomes?.[0] ?? {} as any), ...outcomeRow }] } : d;
    setDecisions(prev => prev.map(merge));
    setMyDecisions(prev => prev.map(merge));

    try {
      const { error: oErr } = await supabase
        .from("outcomes")
        .upsert({ decision_id: id, user_id: user.id, ...outcomeRow }, { onConflict: "decision_id" });
      if (oErr) throw oErr;
      const { error: sErr } = await supabase.from("decisions").update({ status: "closed" }).eq("id", id);
      if (sErr) throw sErr;

      if (p.chosenRecommendationId) {
        supabase.functions
          .invoke("notify-rec-outcome", { body: { decision_id: id, recommendation_id: p.chosenRecommendationId } })
          .catch((e) => console.warn("rec outcome notify failed:", e));
      }
    } catch (e) {
      console.error("looking-for outcome save failed:", e);
      toast.error("Couldn't save that. Try again in a second.");
      fetchDecisions();
    }
  };

  // A slow link read landing after she already finished: fill in the product
  // details on the row she saved.
  const patchLookingForProduct = async (id: string, pulled: { brand: string | null; name: string | null; image_url: string | null; price: string | null }) => {
    const patch = {
      alt_brand_name: pulled.brand,
      alt_product_name: pulled.name,
      alt_product_image_url: pulled.image_url,
      alt_price_note: pulled.price,
    };
    const merge = (d: DecisionRow): DecisionRow =>
      d.id === id ? { ...d, outcomes: [{ ...(d.outcomes?.[0] ?? {} as any), ...patch }] } : d;
    setDecisions(prev => prev.map(merge));
    setMyDecisions(prev => prev.map(merge));
    try {
      await supabase.from("outcomes").update(patch).eq("decision_id", id);
    } catch (e) {
      console.warn("looking-for product patch failed:", e);
    }
  };

  // "Still looking" is a pause, not a close: no status change, just a note that
  // she checked in, so the prompt can come back later.
  const quickStillLooking = async (id: string) => {
    if (!user) return;
    try {
      await supabase
        .from("outcomes")
        .upsert({ decision_id: id, user_id: user.id, did_purchase: false, outcome_type: "still_deciding" }, { onConflict: "decision_id" });
    } catch (e) {
      console.error("still-looking note failed:", e);
    }
  };

  const closeWeighIn = () => {
    const wasCompleted = weighInCompletedRef.current;
    weighInCompletedRef.current = false;
    setWeighInResetKey((k) => k + 1);
    weighInDraftIdRef.current = null;
    setWeighingIn(null);
    setWeighInStep("context");
    setContext(null);
    setVote(null);
    setTake("");
    setTakeLink("");
    if (wasCompleted && user && !fitPromptShownRef.current && mayAskAboutFit && shouldShowFitPrompt(user.id)) {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
      fitTimerRef.current = setTimeout(() => {
        fitTimerRef.current = null;
        fitPromptShownRef.current = true;
        setFitModalVariant("weigh_in");
        setShowFitModal(true);
      }, 3500);
    }
  };

  // The draft now lives in the shared sheet, so it arrives as a payload rather
  // than being read back out of this component's state.
  const submitWeighIn = async (p: WeighInPayload) => {
    if (!user || !weighingIn || !p.vote || !p.take.trim()) return;
    setSubmitting(true);

    const decision = decisions.find((d) => d.id === weighingIn);
    let matchScore: number | null = null;
    let matchBreakdown = null;

    if (decision) {
      const [{ data: responderProfile }, { data: posterProfile }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("profiles").select("*").eq("id", decision.user_id).single(),
      ]);

      if (responderProfile && posterProfile) {
        const result = computeMatchScore(posterProfile, responderProfile);
        matchScore = result.total;
        matchBreakdown = result;
      }
    }

    // Upload response photo if attached
    let responsePhotoUrl: string | null = null;
    if (p.photo) {
      let photoBody: Blob = p.photo;
      try { photoBody = await imageToJpeg(p.photo); } catch (e) { console.warn("response photo convert failed, uploading raw:", e); }
      const path = `response-photos/${user.id}/${Date.now()}.jpg`;
      const { data: upData } = await supabase.storage.from("product-images").upload(path, photoBody, { upsert: true, contentType: "image/jpeg" });
      if (upData) {
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(upData.path);
        responsePhotoUrl = urlData.publicUrl;
      }
    }

    await supabase.from("responses").insert({
      decision_id: weighingIn,
      user_id: user.id,
      recommendation: p.vote,
      reasoning: p.take,
      personal_experience: p.context,
      match_score: matchScore,
      match_breakdown: matchBreakdown,
      ...(responsePhotoUrl ? { photo_url: responsePhotoUrl } : {}),
      ...(p.link ? { product_url: p.link } : {}),
    });

    // Email the post owner that someone weighed in (fire-and-forget; the
    // function skips self-weigh-ins and never blocks the UI on failure).
    supabase.functions
      .invoke("notify-weigh-in", { body: { decision_id: weighingIn, responder_id: user.id } })
      .catch((e) => console.warn("weigh-in notify failed:", e));

    await fetchDecisions();
    setHasWeighedIn(true); // dismiss the activation nudge — they've now acted
    setSubmitting(false);
    weighInCompletedRef.current = true;
    setWeighInStep("done");
  };

  const handleHelpfulVote = async (responseId: string, voteType: "helpful" | "not_helpful") => {
    if (!user) return;

    const currentVote = userVotes[responseId];
    const isToggleOff = currentVote === voteType;

    const newUserVotes = { ...userVotes };
    const newVoteCounts = {
      ...voteCounts,
      [responseId]: { ...(voteCounts[responseId] ?? { helpful: 0, not_helpful: 0 }) },
    };

    if (isToggleOff) {
      delete newUserVotes[responseId];
      newVoteCounts[responseId][voteType] = Math.max(0, (newVoteCounts[responseId][voteType] ?? 1) - 1);
    } else {
      if (currentVote) {
        newVoteCounts[responseId][currentVote] = Math.max(0, (newVoteCounts[responseId][currentVote] ?? 1) - 1);
      }
      newUserVotes[responseId] = voteType;
      newVoteCounts[responseId][voteType] = (newVoteCounts[responseId][voteType] ?? 0) + 1;
    }

    setUserVotes(newUserVotes);
    setVoteCounts(newVoteCounts);

    if (isToggleOff) {
      await supabase
        .from("response_votes")
        .delete()
        .eq("response_id", responseId)
        .eq("voter_id", user.id);
    } else {
      await supabase.from("response_votes").upsert(
        { response_id: responseId, voter_id: user.id, vote_type: voteType },
        { onConflict: "response_id,voter_id" }
      );
    }

    const { count } = await supabase
      .from("response_votes")
      .select("*", { count: "exact", head: true })
      .eq("response_id", responseId)
      .eq("vote_type", "helpful");
    await supabase
      .from("responses")
      .update({ helpfulness_votes: count ?? 0 })
      .eq("id", responseId);
  };

  // Helpful vote on a recommendation — shares the vote-count maps (rec ids are
  // distinct from response ids) but writes to recommendation_votes.
  const handleRecHelpfulVote = async (recId: string) => {
    if (!user) return;
    const isToggleOff = userVotes[recId] === "helpful";
    const newUserVotes = { ...userVotes };
    const newVoteCounts = { ...voteCounts, [recId]: { ...(voteCounts[recId] ?? { helpful: 0, not_helpful: 0 }) } };
    if (isToggleOff) {
      delete newUserVotes[recId];
      newVoteCounts[recId].helpful = Math.max(0, (newVoteCounts[recId].helpful ?? 1) - 1);
    } else {
      newUserVotes[recId] = "helpful";
      newVoteCounts[recId].helpful = (newVoteCounts[recId].helpful ?? 0) + 1;
    }
    setUserVotes(newUserVotes);
    setVoteCounts(newVoteCounts);
    try {
      if (isToggleOff) {
        await supabase.from("recommendation_votes").delete().eq("recommendation_id", recId).eq("voter_id", user.id);
      } else {
        await supabase.from("recommendation_votes").upsert({ recommendation_id: recId, voter_id: user.id, vote_type: "helpful" }, { onConflict: "recommendation_id,voter_id" });
      }
    } catch (e) { console.error("rec vote failed:", e); }
  };

  // Post a clarifying reply on a response (one level deep). Notifies the thread.
  const submitReply = async (responseId: string, body: string) => {
    if (!user) { navigate("/signin?mode=signup"); return; }
    try {
      await supabase.from("response_replies").insert({ response_id: responseId, user_id: user.id, body });
      supabase.functions
        .invoke("notify-reply", { body: { response_id: responseId, replier_id: user.id } })
        .catch((e) => console.warn("reply notify failed:", e));
      await fetchDecisions();
    } catch (e) {
      console.error("reply insert failed:", e);
      throw e;
    }
  };

  // Edit / delete a reply — RLS allows only the reply's own author.
  const editReply = async (replyId: string, body: string) => {
    if (!user) return;
    try {
      await supabase.from("response_replies").update({ body }).eq("id", replyId).eq("user_id", user.id);
      await fetchDecisions();
    } catch (e) { console.error("edit reply failed:", e); throw e; }
  };
  const deleteReply = async (replyId: string) => {
    if (!user) return;
    try {
      await supabase.from("response_replies").delete().eq("id", replyId).eq("user_id", user.id);
      await fetchDecisions();
    } catch (e) { console.error("delete reply failed:", e); }
  };

  // ── Comments on the decision itself ─────────────────────────────────────────
  // Not a weigh-in: no recommendation, no match score. This is how anyone reaches
  // the poster on a decided post, where "Weigh in" no longer makes sense.
  const submitComment = async (decisionId: string, body: string) => {
    if (!user) { navigate("/signin?mode=signup"); return; }
    try {
      const { data, error } = await supabase
        .from("decision_comments")
        .insert({ decision_id: decisionId, user_id: user.id, body })
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) {
        supabase.functions
          .invoke("notify-comment", { body: { comment_id: data.id } })
          .catch((e) => console.warn("comment notify failed:", e));
      }
      await fetchDecisions();
    } catch (e) {
      console.error("comment insert failed:", e);
      throw e;
    }
  };
  // Karina posted on Kimia's decision and wanted to reword it. Editing writes
  // updated_at, which is what puts the small "edited" next to the timestamp.
  const editComment = async (commentId: string, body: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("decision_comments")
        .update({ body, updated_at: new Date().toISOString() })
        .eq("id", commentId)
        .eq("user_id", user.id);
      if (error) throw error;
      await fetchDecisions();
    } catch (e) {
      console.error("edit comment failed:", e);
      throw e;
    }
  };
  const deleteComment = async (commentId: string) => {
    if (!user) return;
    try {
      await supabase.from("decision_comments").delete().eq("id", commentId).eq("user_id", user.id);
      await fetchDecisions();
    } catch (e) { console.error("delete comment failed:", e); }
  };

  // ── Referral / Shopping Circle ──────────────────────────────────────────────
  const dismissReferral = async () => {
    setShowReferral(false);
    if (!user) return;
    const now = new Date().toISOString();
    setMyProfile((p) => (p ? { ...p, referral_prompt_dismissed_at: now } : p));
    try { await supabase.from("profiles").update({ referral_prompt_dismissed_at: now }).eq("id", user.id); } catch { /* ignore */ }
  };
  const openReferralManually = async () => {
    if (user && !inviteCode) setInviteCode(await ensureInviteCode(user.id, myProfile?.display_name ?? null, myProfile?.invite_code ?? null));
    setShowReferral(true);
  };
  // If this user arrived via an invite link, store the shopping-circle relationship.
  useEffect(() => { if (user) ensureReferral(user.id).catch(() => {}); }, [user]);

  // ── Fit prompt for anyone who joined before fit moved into onboarding ───────
  // New accounts arrive with fit already set. The women who joined before that
  // get one ask, the next time they're active, and only for the questions they
  // actually skipped. After that the modal never opens by itself again.
  useEffect(() => {
    if (!user || !myProfile || fitPromptShownRef.current) return;
    if (!mayAskAboutFit) return;
    const t = setTimeout(() => {
      fitPromptShownRef.current = true;
      setFitModalVariant("weigh_in");
      setShowFitModal(true);
    }, 3000);   // let the feed land first, so it reads as an invitation
    return () => clearTimeout(t);
  }, [user, myProfile]);

  // ── Follows ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setFollowingIds(new Set()); return; }
    let cancelled = false;
    supabase.from("follows").select("following_id").eq("follower_id", user.id)
      .then(({ data }) => {
        if (!cancelled) setFollowingIds(new Set((data ?? []).map((r: any) => r.following_id)));
      });
    return () => { cancelled = true; };
  }, [user]);

  const setFollowing = (targetId: string, on: boolean) =>
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(targetId); else next.delete(targetId);
      return next;
    });
  // Show the invite prompt once — after ~12s or a natural scroll through the feed.
  useEffect(() => {
    if (!user || !myProfile || myProfile.referral_prompt_dismissed_at || referralArmedRef.current) return;
    referralArmedRef.current = true;
    ensureInviteCode(user.id, myProfile.display_name, myProfile.invite_code ?? null).then(setInviteCode);
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const scroller = scrollRef.current;
    const fire = () => { if (done) return; done = true; clearTimeout(timer); scroller?.removeEventListener("scroll", onScroll); setShowReferral(true); };
    const onScroll = () => { if ((scroller?.scrollTop ?? 0) > 600) fire(); };
    timer = setTimeout(fire, 12000);
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearTimeout(timer); scroller?.removeEventListener("scroll", onScroll); };
  }, [user, myProfile]);

  // Submit a product recommendation on a Looking For post.
  const submitRecommendation = async (lookingForId: string, draft: RecommendationDraft) => {
    if (!user) { navigate("/signin?mode=signup"); return; }
    setSubmittingRec(true);
    const target = [...decisions, ...myDecisions].find((d) => d.id === lookingForId);
    let matchScore: number | null = null;
    if (target) {
      const [{ data: recProfile }, { data: posterProfile }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("profiles").select("*").eq("id", target.user_id).single(),
      ]);
      if (recProfile && posterProfile) matchScore = computeMatchScore(posterProfile, recProfile).total;
    }
    try {
      await supabase.from("recommendations").insert({
        looking_for_id: lookingForId,
        user_id: user.id,
        recommendation: draft.recommendation,
        reasoning: draft.reasoning,
        fit_note: draft.fit_note,
        who_for: draft.who_for,
        product_url: draft.product_url,
        product_name: draft.product_name,
        brand_name: draft.brand_name,
        price_note: draft.price_note,
        product_image_url: draft.product_image_url,
        match_score: matchScore,
      });
      supabase.functions
        .invoke("notify-recommendation", { body: { looking_for_id: lookingForId, recommender_id: user.id } })
        .catch((e) => console.warn("recommendation notify failed:", e));
      await fetchDecisions();
      setRecModalFor(null);
      // The picks show inline in the decision view now; no drawer on top of it.
    } catch (e) {
      console.error("recommendation insert failed:", e);
    }
    setSubmittingRec(false);
  };

  const handleDelete = async (decisionId: string) => {
    if (!user) return;
    const { error } = await supabase.rpc("delete_own_decision", { decision_id: decisionId });
    if (error) { alert("Could not delete: " + error.message); return; }
    // Immediately remove from both lists so it vanishes from feed + mine tab
    setDecisions(prev => prev.filter(d => d.id !== decisionId));
    setMyDecisions(prev => prev.filter(d => d.id !== decisionId));
    fetchDecisions();
  };

  // Owner edits their own post — details / confidence / price / sizes.
  const saveDecisionEdit = async (
    id: string,
    patch: { context_note: string | null; confidence_score: number; price_note: string | null; sizes_note: string | null },
  ) => {
    if (!user) return;
    const merge = (d: DecisionRow): DecisionRow => (d.id === id ? { ...d, ...patch } : d);
    setDecisions(prev => prev.map(merge));
    setMyDecisions(prev => prev.map(merge));
    try {
      await supabase.from("decisions").update(patch).eq("id", id);
    } catch (e) {
      console.error("decision edit failed:", e);
    }
  };

  const handleOutcome = async (decisionId: string, outcome: string) => {
    if (!user) return;
    const didPurchase = outcome === "Bought it";
    await supabase.from("outcomes").upsert(
      { decision_id: decisionId, user_id: user.id, did_purchase: didPurchase },
      { onConflict: "decision_id" }
    );
    if (didPurchase) {
      await supabase.from("decisions").update({ status: "purchased" }).eq("id", decisionId);
    }
    setTrackingId(null);
    await fetchDecisions();
  };

  const toggleSave = async (decisionId: string) => {
    if (!user) { navigate("/signin?mode=signup"); return; }
    const isSaved = savedDecisionIds.has(decisionId);
    const next = new Set(savedDecisionIds);
    if (isSaved) {
      next.delete(decisionId);
      setSavedDecisionIds(next);
      await supabase.from("saved_decisions").delete().eq("user_id", user.id).eq("decision_id", decisionId);
    } else {
      next.add(decisionId);
      setSavedDecisionIds(next);
      await supabase.from("saved_decisions").upsert({ user_id: user.id, decision_id: decisionId }, { onConflict: "user_id,decision_id" });
    }
  };

  const hideDecision = async (decisionId: string) => {
    if (!user) return;
    const next = new Set(hiddenDecisionIds);
    next.add(decisionId);
    setHiddenDecisionIds(next);
    setUndoHiddenId(decisionId);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoHiddenId(null), 4500);
    await supabase.from("hidden_decisions").upsert({ user_id: user.id, decision_id: decisionId }, { onConflict: "user_id,decision_id" });
  };

  const undoHide = async (decisionId: string) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const next = new Set(hiddenDecisionIds);
    next.delete(decisionId);
    setHiddenDecisionIds(next);
    setUndoHiddenId(null);
    await supabase.from("hidden_decisions").delete().eq("user_id", user!.id).eq("decision_id", decisionId);
  };

  // ─── Derived list ────────────────────────────────────────────────────────────

  const getFilteredDecisions = (list: DecisionRow[]) => {
    let filtered = list;

    if (filterBrand.trim()) {
      filtered = filtered.filter((d) =>
        (d.brand_name ?? "").toLowerCase().includes(filterBrand.toLowerCase()) ||
        (d.product_name ?? "").toLowerCase().includes(filterBrand.toLowerCase())
      );
    }

    if (filterCategory !== "All") {
      filtered = filtered.filter((d) => {
        const cat = (d.product_category ?? "").toLowerCase();
        const name = (d.product_name ?? "").toLowerCase();
        const target = filterCategory.toLowerCase();
        if (cat.includes(target)) return true;
        const synonyms: Record<string, string[]> = {
          tops: ["top", "shirt", "blouse", "tank", "tee", "sweater", "sweatshirt", "hoodie", "crop", "knit", "cami"],
          bottoms: ["bottom", "jean", "denim", "pant", "trouser", "short", "skirt", "legging"],
          dresses: ["dress", "gown", "maxi", "midi", "mini", "romper", "jumpsuit"],
          outerwear: ["jacket", "coat", "blazer", "cardigan", "vest", "parka", "trench"],
          shoes: ["shoe", "boot", "sneaker", "heel", "sandal", "loafer", "flat", "pump", "mule"],
          bags: ["bag", "purse", "handbag", "tote", "clutch", "backpack", "crossbody"],
          accessories: ["accessory", "belt", "scarf", "hat", "jewelry", "earring", "necklace", "bracelet", "ring"],
        };
        return (synonyms[target] ?? [target]).some(s => cat.includes(s) || name.includes(s));
      });
    }

    if (filterStatus === "open") {
      filtered = filtered.filter((d) => !d.status || d.status === "open");
    } else if (filterStatus === "closed") {
      filtered = filtered.filter((d) => d.status === "purchased" || d.status === "closed");
    }

    // Sort
    if (sortBy === "discussed") {
      filtered = [...filtered].sort((a, b) => (b.responses?.length ?? 0) - (a.responses?.length ?? 0));
    } else if (sortBy === "needs_input") {
      filtered = [...filtered].sort((a, b) => {
        const aScore = (a.confidence_score ?? 5) - (a.responses?.length ?? 0) * 0.5;
        const bScore = (b.confidence_score ?? 5) - (b.responses?.length ?? 0) * 0.5;
        return aScore - bScore; // lowest confidence + fewest responses first
      });
    } else if (sortBy === "relevant") {
      // "relevant" — highest match score first, newest as a tiebreaker
      filtered = [...filtered].sort((a, b) => {
        const scoreDiff = (b.matchScore ?? -1) - (a.matchScore ?? -1);
        return scoreDiff !== 0 ? scoreDiff : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      // "newest" — newest decisions up top, with match relevance only as a tiebreaker
      filtered = [...filtered].sort((a, b) => {
        const dateDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return dateDiff !== 0 ? dateDiff : (b.matchScore ?? -1) - (a.matchScore ?? -1);
      });
    }

    // Open posts first, always: the ones still waiting on a weigh-in or a rec.
    // Each group keeps the chosen sort inside it.
    const isOpen = (d: { status?: string | null }) => !isResolved({ status: d.status ?? "" });
    filtered = [...filtered.filter(isOpen), ...filtered.filter((d) => !isOpen(d))];

    return filtered;
  };

  const displayList = getFilteredDecisions(activeTab === "feed" ? decisions : myDecisions)
    .filter(d => !hiddenDecisionIds.has(d.id));

  // ── Activation nudge target: the single highest-match open decision the user
  // didn't post. Shown only to brand-new accounts (no posts, no weigh-ins).
  const activationTarget = (() => {
    const open = decisions.filter(d => d.user_id !== user?.id && (!d.status || d.status === "open"));
    open.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
    return open[0] ?? null;
  })();
  const showActivation = !!user && activeTab === "feed"
    && myDecisions.length === 0 && hasWeighedIn === false && !!activationTarget;

  // Purchases still owed their received-it log — drives the top-of-feed banner.
  const followupPending = myDecisions.filter((d) => {
    const o = d.outcomes?.[0];
    if (!o) return false;
    // A swap is a purchase too: she bought something, it just wasn't this item.
    // Same for a Looking For post she closed by finding something.
    const isSwap = d.status === "closed" && o.bought_alternative === true;
    const isFoundLf = d.post_type === "looking_for" && d.status === "closed" && o.outcome_type === "bought_it";
    if (d.status !== "purchased" && !isSwap && !isFoundLf) return false;
    const arrival = o.arrival_status;
    if (arrival === "returned") return false;
    if (!arrival) return true;                         // "did you receive it?" not answered yet
    if (arrival === "waiting") return !o.next_prompt_at || Date.now() >= new Date(o.next_prompt_at).getTime();
    return false;                                       // received → fully logged (incl. Her take); nothing pending
  });
  const showFollowupBanner = !!user && activeTab === "feed" && followupPending.length > 0;

  // ─── Render helpers ───────────────────────────────────────────────────────────

  const avatarContent = (avatarUrl: string | null, displayName: string | null) =>
    avatarUrl
      ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
      : <span>{getInitials(displayName)}</span>;

  // Activation nudge card — pinned above the feed for never-active accounts.
  const renderActivationCard = () => {
    const t = activationTarget!;
    const m = t.matchScore != null ? Math.round(t.matchScore) : null;
    return (
      <div style={{ borderTop: `1px solid ${E11.ink}`, borderBottom: `1px solid ${E11.rule}`, padding: isMobile ? "18px 0 20px" : "22px 0 24px", marginBottom: isMobile ? 18 : 24 }}>
        <p style={e11Meta(10.5, E11.burgundy)}>For you</p>
        <p style={{ ...e11Display(isMobile ? 34 : 42), marginTop: 10 }}>Break the ice.</p>
        <p style={{ ...e11Body(isMobile ? 13.5 : 14.5, E11.inkSoft), marginTop: 10, maxWidth: "46ch" }}>
          Here's a decision from someone in your circle. Weigh in, and we'll start learning your taste.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
          <div style={{ width: 54, height: 68, background: E11.well, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ProductImage url={t.product_image_url} fallback={<Camera className="w-5 h-5" style={{ color: E11.faint }} />} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {t.brand_name && <span style={{ ...e11Strong(12), display: "block", textTransform: "uppercase", letterSpacing: "0.04em" }}>{t.brand_name}</span>}
            <span style={{ ...e11Body(12.5, E11.inkSoft), display: "block", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.product_name ?? "A decision"}</span>
          </div>
          {m != null && <MatchSeal score={m} size={34} withLabel labelSize={9} />}
        </div>
        <button onClick={() => startWeighIn(t.id)} style={{ ...e11Meta(11.5, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: E11.burgundy, border: "none", borderRadius: 2, padding: "15px 0", marginTop: 18, cursor: "pointer" }}>
          Weigh in <ArrowRight style={{ width: 15, height: 15 }} strokeWidth={2} />
        </button>
      </div>
    );
  };

  // The fixed header's height drives the feed's top padding.
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(isMobile ? 52 : 70);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 overflow-hidden flex justify-center" style={{ background: E11.paper }}>

      {/* ── Header: type, not pills ───────────────────────────────────────────── */}
      <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50" style={{ background: E11.paper, borderBottom: `1px solid ${E11.rule}` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, padding: isMobile ? "12px 16px" : "20px 40px" }}>
          <button
            onClick={() => navigate("/", { state: { home: true } })}
            className="select-none"
            style={{ justifySelf: "start", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: E11_SANS, textTransform: "uppercase", letterSpacing: isMobile ? "0.12em" : "0.32em", fontSize: isMobile ? 10.5 : 15, color: E11.ink, whiteSpace: "nowrap" }}
          >
            <span style={{ fontWeight: 700 }}>ELEVEN</span>
            <span style={{ fontWeight: 300 }}>ELEVEN</span>
          </button>

          <nav style={{ display: "flex", gap: isMobile ? 20 : 56 }}>
            {(["feed", "mine"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{ ...e11Meta(isMobile ? 10.5 : 12, activeTab === t ? E11.ink : E11.muted), fontWeight: 700, background: "none", border: "none", padding: "2px 0 8px", cursor: "pointer", borderBottom: `2px solid ${activeTab === t ? E11.burgundy : "transparent"}`, whiteSpace: "nowrap" }}
              >
                {t === "feed" ? "Feed" : `Mine${myDecisions.length > 0 ? ` (${myDecisions.length})` : ""}`}
              </button>
            ))}
          </nav>

          <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: isMobile ? 12 : 22 }}>
            {user && (
              <NotificationBell
                user={user}
                isMobile={isMobile}
                onOpenDecision={(id, responseId) => openDecision(id, responseId ?? null)}
              />
            )}
            {user ? (
              <button
                onClick={() => navigate("/profile")}
                aria-label="Your profile"
                className="rounded-full flex items-center justify-center text-[9px] font-semibold text-white overflow-hidden shrink-0"
                style={{ width: isMobile ? 30 : 36, height: isMobile ? 30 : 36, background: "#3A3530", ...ringStyle(myProfile?.badge_tier, 2) }}
              >
                {avatarContent(myProfile?.avatar_url ?? null, myProfile?.display_name ?? null)}
              </button>
            ) : (
              <button onClick={() => navigate("/signin")} style={{ ...e11Meta(isMobile ? 10 : 11, E11.ink), fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer", whiteSpace: "nowrap" }}>
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Feed scroll container ─────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="w-full max-w-[1320px] no-scrollbar feed-scroll"
        style={{
          overflowY: "scroll",
          // Clear the fixed header exactly, plus one deliberate gap. The first
          // card's own top margin is zeroed in CSS so the two don't stack.
          paddingTop: headerH + (isMobile ? 14 : 20),
          paddingBottom: 40,
          paddingLeft: isMobile ? 16 : 40,
          paddingRight: isMobile ? 16 : 40,
        }}
        onClick={() => filterOpen && setFilterOpen(false)}
      >
        {!loading && activeTab === "feed" && user && (
          <NotificationBanner userId={user.id} isMobile={isMobile} />
        )}
        {!loading && activeTab === "feed" && (
          <FeedBanner
            isMobile={isMobile}
            onDecision={() => navigate(user ? "/post" : "/signin")}
            onLookingFor={() => navigate(user ? "/looking-for" : "/signin")}
            onInvite={user ? openReferralManually : undefined}
          />
        )}
        {!loading && (
          <div style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            gap: isMobile ? 10 : 16,
            margin: activeTab === "feed" ? (isMobile ? "18px 0 16px" : "26px 0 24px") : (isMobile ? "10px 0 16px" : "14px 0 24px"),
          }}>
            <div className="no-scrollbar" style={{ display: "flex", gap: isMobile ? 22 : 40, overflowX: "auto", minWidth: 0, width: isMobile ? "100%" : undefined }}>
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  style={{ ...e11Meta(11, filterCategory === cat ? E11.burgundy : E11.ink), fontWeight: filterCategory === cat ? 700 : 600, letterSpacing: "0.2em", background: "none", border: "none", padding: "0 0 8px", cursor: "pointer", whiteSpace: "nowrap", borderBottom: `2px solid ${filterCategory === cat ? E11.burgundy : "transparent"}` }}
                >
                  {cat}
                </button>
              ))}
            </div>
            <select
              aria-label="Sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              // Safari draws its own white rounded box over a select unless the
              // native appearance is turned off.
              style={{ ...e11Meta(11, E11.ink), fontWeight: 700, letterSpacing: "0.2em", background: "transparent", border: "none", borderRadius: 0, WebkitAppearance: "none", appearance: "none", cursor: "pointer", outline: "none", flexShrink: 0, paddingBottom: 8, alignSelf: isMobile ? "flex-end" : "auto", textAlign: isMobile ? "right" : "left" }}
            >
              <option value="newest">Newest</option>
              <option value="relevant">Most relevant</option>
              <option value="discussed">Most discussed</option>
              <option value="needs_input">Needs input</option>
            </select>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
            <div className="space-y-3 text-center">
              <div className="w-12 h-12 rounded-full mx-auto animate-pulse" style={{ background: "rgba(245,239,234,0.20)" }} />
              <p className="text-[15.5px] tracking-[0.2em] uppercase" style={{ color: "#1C1712" }}>Loading decisions</p>
            </div>
          </div>
        ) : displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 text-center" style={{ minHeight: "60vh" }}>
            <p className="font-sans text-[25.5px] leading-tight mb-3" style={{ color: "#1C1712" }}>
              {filterBrand || filterCategory !== "All" || filterStatus !== "all"
                ? "No results"
                : activeTab === "mine" ? "Nothing here yet" : "Nothing posted yet"}
            </p>
            <p className="text-[15.5px] mb-8" style={{ color: "rgba(28,23,18,0.45)" }}>
              {filterBrand || filterCategory !== "All" || filterStatus !== "all"
                ? "Try clearing the filters."
                : activeTab === "mine"
                  ? "Post something you're considering and get input from your mirrors."
                  : "Be the first to post something you're considering."}
            </p>
            {!filterBrand && filterCategory === "All" && filterStatus === "all" && (
              <button
                onClick={() => navigate(user ? "/post" : "/signin")}
                className="px-8 py-3 text-[15.5px] tracking-[0.18em] uppercase font-medium transition-all"
                style={{ borderRadius: 6, background: "#1C1712", color: "#FDFAF6", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.22)" }}
              >
                {user ? "Post a decision" : "Sign in to post"}
              </button>
            )}
          </div>
        ) : (
          <>
            {showFollowupBanner && (
              <button onClick={() => { setScrollTargetId(followupPending[0].id); setActiveTab("mine"); openDecision(followupPending[0].id); }} style={{ position: "relative", zIndex: 10, display: "flex", width: "100%", textAlign: "left", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#F6F1EA", border: "1px solid rgba(196,158,100,0.6)", borderRadius: 14, padding: "14px 16px", marginBottom: 16, cursor: "pointer", boxShadow: "0 2px 14px rgba(120,60,20,0.10)" }}>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A6620", margin: 0 }}>Follow up</p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#1C1712", margin: "4px 0 0" }}>
                    {followupPending.length === 1 ? "1 purchase is ready to close the loop" : `${followupPending.length} purchases are ready to close the loop`}
                  </p>
                  <p style={{ fontSize: 10, color: "rgba(28,23,18,0.55)", margin: "2px 0 0" }}>
                    {(() => {
                      const d = followupPending[0];
                      const o = d.outcomes?.[0];
                      const swap = (d.status === "closed" || d.status === "purchased") && (o?.bought_alternative === true || d.post_type === "looking_for");
                      const name = swap
                        ? [o?.alt_brand_name, o?.alt_product_name].filter(Boolean).join(" ").trim()
                        : [d.brand_name, d.product_name].filter(Boolean).join(" ").trim();
                      return name;
                    })()}{followupPending.length > 1 ? " and more" : ""}
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#8A6620", whiteSpace: "nowrap" }}>Review &rarr;</span>
              </button>
            )}
            {showActivation && renderActivationCard()}
            {/* The feed: decision tiles on an editorial grid. The concerns and the
                conversation live in the decision view, one tap in. */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(262px, 1fr))", gap: isMobile ? 14 : 18 }}>
              {displayList.map((decision) => (
                <div key={decision.id} id={`dec-${decision.id}`} style={{ scrollMarginTop: 80, display: "grid" }}>
                  <DecisionTile d={decision} viewerId={user?.id ?? null} isMobile={isMobile} onOpen={(id) => openDecision(id)} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Weigh-in sheet ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        <WeighInSheet
          open={!!weighingIn}
          isMobile={isMobile}
          decisionId={weighingIn}
          resetKey={weighInResetKey}
          decision={[...decisions, ...myDecisions].find((d) => d.id === weighingIn) ?? null}
          mode="member"
          submitting={submitting}
          submitted={weighInStep === "done"}
          onCancel={cancelWeighIn}
          onDismiss={dismissWeighIn}
          onSubmit={submitWeighIn}
          doneSlot={
            <div style={{ padding: "6px 0 2px" }}>
              <h3 style={e11Display(isMobile ? 40 : 52)}>You've weighed in.</h3>
              <p style={{ ...e11Body(15, E11.inkSoft), marginTop: 12 }}>Your take has been added to the conversation.</p>
              <button
                onClick={closeWeighIn}
                style={{ marginTop: 22, width: "100%", ...e11Meta(12, E11.ink), fontWeight: 700, letterSpacing: "0.16em", padding: "16px 0", borderRadius: 2, border: `1px solid ${E11.ink}`, background: "transparent", cursor: "pointer" }}
              >
                Done
              </button>
            </div>
          }
        />
      </AnimatePresence>

      <OutcomeModal
        open={trackingId !== null}
        initialOutcome={outcomeInitial}
        initialChosenOption={outcomeChosen}
        onClose={() => { setTrackingId(null); setOutcomeInitial(null); setOutcomeChosen(null); }}
        decision={decisions.find(d => d.id === trackingId) ?? myDecisions.find(d => d.id === trackingId) ?? { id: trackingId ?? '', uncertainty_text: null }}
        onComplete={(outcome) => {
          if (outcome !== "still_deciding" && trackingId) {
            const id = trackingId;
            const newStatus = outcome === "bought_it" ? "purchased" : "closed";
            setLoggedOutcomeIds(prev => { const next = new Set(prev); next.add(id); return next; });

            // 1. Immediately flip status in local state — card switches to outcome
            //    view right away without waiting for any network round-trip.
            setDecisions(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d));
            setMyDecisions(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d));

            // 2. Fetch the outcome row directly and patch it in — no join needed.
            //    Don't call fetchDecisions() here: it sets loading=true which hides
            //    all cards and can race against the realtime subscription, causing
            //    the local status update to get wiped by stale DB data.
            //    Retry up to 3× with 800 ms gaps in case the DB write hasn't
            //    propagated yet when the first read fires.
            const fetchOutcomeWithRetry = async (retries = 4, delayMs = 600) => {
              for (let attempt = 0; attempt < retries; attempt++) {
                if (attempt > 0) await new Promise(r => setTimeout(r, delayMs));
                // Use limit(1) + order instead of .single() — .single() throws
                // if there are multiple rows for the same decision_id.
                const { data: rows } = await supabase
                  .from("outcomes")
                  .select("decision_id, did_purchase, outcome_type, primary_uncertainty, tipping_factor, tipping_factor_other, size_bought, fit_result, fit_result_note, size_recommendation, outcome_detail, outcome_detail_other, kept, recommend, confidence_after, take, followed_up_at, created_at, arrival_status, next_prompt_at, received_at, photo_url, chosen_option, bought_alternative, alt_product_url, alt_product_name, alt_product_image_url, alt_brand_name, alt_price_note, alt_reason, chosen_recommendation_id")
                  .eq("decision_id", id)
                  .order("created_at", { ascending: false })
                  .limit(1);
                const data = rows?.[0] ?? null;
                if (data) {
                  const patch = (d: DecisionRow) =>
                    d.id === id ? { ...d, status: newStatus, outcomes: [data as OutcomeRow] } : d;
                  setDecisions(prev => prev.map(patch));
                  setMyDecisions(prev => prev.map(patch));
                  return; // success — stop retrying
                }
              }
            };
            fetchOutcomeWithRetry();
          }
          // Realtime subscription on the decisions table fires when status changes
          // and triggers fetchDecisions() automatically — no manual call needed.
        }}
      />

      {/* ── Lightbox ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.92)" }}
            onClick={() => setLightboxUrl(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              src={lightboxUrl}
              alt="Product"
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-5 right-5 text-[15.5px] tracking-[0.2em] uppercase"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Close ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Undo hide toast ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {undoHiddenId && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22 }}
            style={{
              position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
              background: E11.ink, borderRadius: 2,
              display: "flex", alignItems: "center", gap: 18,
              padding: "13px 20px", zIndex: 80,
              boxShadow: "0 8px 32px rgba(20,18,16,0.28)",
            }}
          >
            <span style={e11Body(14, "rgba(247,244,239,0.85)")}>Post hidden</span>
            <button
              onClick={() => undoHide(undoHiddenId)}
              style={{ ...e11Meta(11, "#FFFFFF"), fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── The decision view, over the feed ──────────────────────────────────── */}
      <AnimatePresence>
        {(() => {
          const pool = [...decisions, ...myDecisions].filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i);
          const open = openDecisionId ? pool.find((x) => x.id === openDecisionId) : null;
          if (!open) return null;
          const isLF = open.post_type === "looking_for";
          // Same category first, same brand ahead of the rest, newest after that.
          const similar = isLF ? [] : pool
            .filter((x) => x.id !== open.id && x.post_type !== "looking_for" && !!x.product_image_url && !!open.product_category && x.product_category === open.product_category)
            .sort((a, b) =>
              Number((b.brand_name ?? "").toLowerCase() === (open.brand_name ?? "").toLowerCase()) - Number((a.brand_name ?? "").toLowerCase() === (open.brand_name ?? "").toLowerCase())
              || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 3);
          return (
            <DecisionView
              key={open.id}
              d={open}
              viewer={user ? { id: user.id } : null}
              isMobile={isMobile}
              onClose={closeDecision}
              onOpenDecision={(id) => openDecision(id)}
              similar={similar}
              initialTab={openTab}
              focusResponseId={focusResponseId}
              isSaved={savedDecisionIds.has(open.id)}
              onSave={() => toggleSave(open.id)}
              onHide={() => hideDecision(open.id)}
              isFollowing={followingIds.has(open.user_id)}
              onToggleFollow={setFollowing}
              onViewProfile={() => navigate(user?.id === open.user_id ? "/profile" : `/profile/${open.user_id}`)}
              onSignIn={() => navigate("/signin?mode=signup")}
              onLightbox={(url) => setLightboxUrl(url)}
              onWeighIn={() => startWeighIn(open.id)}
              outcomeLogged={loggedOutcomeIds.has(open.id)}
              canDelete={user?.id === open.user_id}
              onLogOutcome={(initial, chosen) => { setOutcomeInitial(initial); setOutcomeChosen(chosen ?? null); setTrackingId(open.id); }}
              onStillDeciding={() => quickStillDeciding(open.id)}
              onDelete={() => handleDelete(open.id)}
              onSaveEdit={(patch) => saveDecisionEdit(open.id, patch)}
              updateOutcome={(patch) => updateOutcome(open.id, patch)}
              submitReceived={(data) => submitReceived(open.id, data)}
              submitReturned={(data) => submitReturned(open.id, data)}
              voteCounts={voteCounts}
              userVotes={userVotes}
              onHelpful={(rid) => handleHelpfulVote(rid, "helpful")}
              onSubmitReply={submitReply}
              onEditReply={editReply}
              onDeleteReply={deleteReply}
              onSubmitComment={(body) => submitComment(open.id, body)}
              onEditComment={editComment}
              onDeleteComment={deleteComment}
              customBody={isLF ? (
                <LookingForView
                  decision={open as any}
                  user={user ? { id: user.id } : null}
                  isMobile={isMobile}
                  voteCounts={voteCounts}
                  userVotes={userVotes}
                  onRecHelpful={(rid) => handleRecHelpfulVote(rid)}
                  onAddRecommendation={() => (user ? setRecModalFor(open.id) : navigate("/signin?mode=signup"))}
                  onSignIn={() => navigate("/signin?mode=signup")}
                  onFound={saveLookingForOutcome}
                  onProductPulled={patchLookingForProduct}
                  onStillLooking={quickStillLooking}
                  updateOutcome={updateOutcome}
                  submitReceived={submitReceived}
                  submitReturned={submitReturned}
                />
              ) : undefined}
            />
          );
        })()}
      </AnimatePresence>

      {/* ── Looking For: recommend modal ───────────────────────────────────────── */}
      <RecommendationModal
        open={!!recModalFor}
        lookingForTitle={([...decisions, ...myDecisions].find((d) => d.id === recModalFor)?.lf_title) ?? null}
        submitting={submittingRec}
        onClose={() => setRecModalFor(null)}
        onSubmit={(draft) => recModalFor && submitRecommendation(recModalFor, draft)}
      />

      {/* Referral / Shopping Circle invite prompt */}
      <ReferralPopup open={showReferral} code={inviteCode} onDismiss={dismissReferral} />

      {/* Secondary floating + Post — the banner is the primary entry point */}
      {user && (
        <button
          onClick={() => navigate("/post")}
          aria-label="Post a decision"
          style={{ position: "fixed", right: isMobile ? 16 : 28, bottom: isMobile ? 20 : 28, zIndex: 40, width: 52, height: 52, borderRadius: 2, border: "none", background: E11.burgundy, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 10px 28px rgba(20,18,16,0.26)" }}
        >
          <Plus style={{ width: 22, height: 22 }} />
        </button>
      )}

      <DialInFitModal open={showFitModal} onClose={() => setShowFitModal(false)} variant={fitModalVariant} only={missingFit} auto />

      {user && <NotificationPrompt userId={user.id} isMobile={isMobile} />}
    </div>
  );
};

export default Feed;
