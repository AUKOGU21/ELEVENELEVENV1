import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import heroEditorial from "@/assets/hero-editorial.png";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ThumbsUp, Check, ExternalLink, SlidersHorizontal, Search, X, User, Info, ChevronDown, ChevronUp, Camera, ArrowRight, Bookmark, MoreHorizontal, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { computeMatchScore } from "@/lib/matching";
import { SILHOUETTE_OPTIONS } from "@/components/onboarding/OnboardingData";
import { DialInFitModal, shouldShowFitPrompt } from "@/components/DialInFitModal";
import { imageToJpeg } from "@/lib/image";
import OutcomeModal, { parsePrimaryUncertainty, outcomeDetailQuestion, outcomeDetailOptions, FIT_RESULT_OPTIONS } from "@/components/OutcomeModal";

// ─── Product-link helpers ───────────────────────────────────────────────────
// Normalize a user-pasted URL (add https:// if the scheme is missing) and
// validate it's a real http(s) link. Returns null for anything unusable, so
// callers can treat "no valid link" and "empty" the same way.
function normalizeProductUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

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
  user_id: string;
  created_at: string;
  profiles: { display_name: string | null; avatar_url?: string | null } | null;
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
  user_id: string;
  created_at: string;
  matchScore?: number | null;
  responses: ResponseRow[];
  outcomes: OutcomeRow[] | null;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
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

const CONTEXT_OPTIONS = [
  "I own this exact item",
  "I've bought from this brand before",
  "I haven't bought, but I'm familiar with the brand",
  "No experience with this brand",
];

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
function MatchBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const m = Math.round(score);
  let col, bg, bd, glow;
  if (m >= 70) { col = "#9B2F63"; bg = "rgba(190,70,130,0.14)"; bd = "rgba(190,70,130,0.55)"; glow = "0 0 16px rgba(190,70,130,0.55)"; }
  else if (m >= 45) { col = "#8A6620"; bg = "rgba(196,158,100,0.16)"; bd = "rgba(196,158,100,0.6)"; glow = "0 0 12px rgba(196,158,100,0.45)"; }
  else { col = "#7C7066"; bg = "rgba(124,112,102,0.10)"; bd = "rgba(124,112,102,0.35)"; glow = "none"; }
  return (
    <span style={{
      marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 12, fontWeight: 800, letterSpacing: "0.02em",
      padding: "2px 10px", borderRadius: 100,
      color: col, background: bg, border: `1px solid ${bd}`, boxShadow: glow,
    }}>✦ {m}% match</span>
  );
}

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
  useEffect(() => {
    if (!scrollTargetId || activeTab !== "mine") return;
    const t = setTimeout(() => {
      document.getElementById(`dec-${scrollTargetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollTargetId(null);
    }, 120);
    return () => clearTimeout(t);
  }, [scrollTargetId, activeTab]);
  const [loading, setLoading] = useState(true);

  // ── Filters
  const [filterBrand, setFilterBrand] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState<"all" | "open">("all");
  const [sortBy, setSortBy] = useState<"newest" | "discussed" | "needs_input" | "relevant">("newest");
  const [filterOpen, setFilterOpen] = useState(false);

  // ── Weigh-in flow
  const [weighingIn, setWeighingIn] = useState<string | null>(null);
  const [weighInStep, setWeighInStep] = useState<"context" | "vote" | "take" | "done">("context");
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

  // ── User meta
  const [myProfile, setMyProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "outcomes" }, () => fetchDecisions())
      .subscribe();

    // Show fit modal after posting a decision (navigated here with state) — exactly once,
    // even if this effect re-runs when `user` changes (auth resolve / token refresh).
    const variant = (location.state as any)?.fitPromptVariant;
    if (variant && !fitPromptHandledRef.current && !fitPromptShownRef.current && user && shouldShowFitPrompt(user.id)) {
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
    setLoading(true);

    // No outcomes join here — we fetch outcomes separately below to avoid
    // PostgREST FK detection issues causing the join to silently return null.
    const query = `
      id, product_name, brand_name, product_image_url, product_image_url_2, product_url, product_url_2, product_name_2, brand_name_2, price_note_2, product_category,
      price_note, sizes_note, context_note, confidence_score, uncertainty_text, status, user_id, created_at,
      profiles ( display_name, avatar_url, height_range, silhouette_preference, style_aesthetics, top_size, bottom_size, fit_preference, fit_details, age, city ),
      responses (
        id, recommendation, reasoning, photo_url, product_url, match_score,
        helpfulness_votes, user_id, created_at,
        profiles ( display_name, avatar_url )
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
    if (myProfileData) setMyProfile({ display_name: myProfileData.display_name, avatar_url: myProfileData.avatar_url });

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
          .select("decision_id, did_purchase, outcome_type, primary_uncertainty, tipping_factor, tipping_factor_other, size_bought, fit_result, fit_result_note, size_recommendation, outcome_detail, outcome_detail_other, kept, recommend, confidence_after, take, followed_up_at, created_at, arrival_status, next_prompt_at, received_at, photo_url, chosen_option")
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
            .select("decision_id, did_purchase, outcome_type, primary_uncertainty, tipping_factor, tipping_factor_other, size_bought, fit_result, fit_result_note, size_recommendation, outcome_detail, outcome_detail_other, kept, recommend, confidence_after, take, followed_up_at, created_at, arrival_status, next_prompt_at, received_at, photo_url, chosen_option")
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

        setMyDecisions(myRows);
      }
    } else {
      setMyDecisions(localFormatted);
    }

    setLoading(false);
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const startWeighIn = (id: string) => {
    // Starting a new action cancels any pending fit-prompt so it can't pop over this flow
    if (fitTimerRef.current) { clearTimeout(fitTimerRef.current); fitTimerRef.current = null; }
    setWeighingIn(id);
    setWeighInStep("context");
    setContext(null);
    setVote(null);
    setTake("");
    setTakeLink("");
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
      confidence_after: data.confidence,
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

  const closeWeighIn = () => {
    const wasCompleted = weighInCompletedRef.current;
    weighInCompletedRef.current = false;
    setWeighingIn(null);
    setWeighInStep("context");
    setContext(null);
    setVote(null);
    setTake("");
    setTakeLink("");
    if (wasCompleted && user && !fitPromptShownRef.current && shouldShowFitPrompt(user.id)) {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
      fitTimerRef.current = setTimeout(() => {
        fitTimerRef.current = null;
        fitPromptShownRef.current = true;
        setFitModalVariant("weigh_in");
        setShowFitModal(true);
      }, 3500);
    }
  };

  const submitWeighIn = async () => {
    if (!user || !weighingIn || !vote || !take.trim()) return;
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
    if (takePhoto) {
      let photoBody: Blob = takePhoto;
      try { photoBody = await imageToJpeg(takePhoto); } catch (e) { console.warn("response photo convert failed, uploading raw:", e); }
      const path = `response-photos/${user.id}/${Date.now()}.jpg`;
      const { data: upData } = await supabase.storage.from("product-images").upload(path, photoBody, { upsert: true, contentType: "image/jpeg" });
      if (upData) {
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(upData.path);
        responsePhotoUrl = urlData.publicUrl;
      }
    }

    const responseProductUrl = normalizeProductUrl(takeLink);

    await supabase.from("responses").insert({
      decision_id: weighingIn,
      user_id: user.id,
      recommendation: vote,
      reasoning: take.trim(),
      personal_experience: context,
      match_score: matchScore,
      match_breakdown: matchBreakdown,
      ...(responsePhotoUrl ? { photo_url: responsePhotoUrl } : {}),
      ...(responseProductUrl ? { product_url: responseProductUrl } : {}),
    });

    // Email the post owner that someone weighed in (fire-and-forget; the
    // function skips self-weigh-ins and never blocks the UI on failure).
    supabase.functions
      .invoke("notify-weigh-in", { body: { decision_id: weighingIn, responder_id: user.id } })
      .catch((e) => console.warn("weigh-in notify failed:", e));

    await fetchDecisions();
    setHasWeighedIn(true); // dismiss the activation nudge — they've now acted
    setSubmitting(false);
    setTakePhoto(null);
    setTakePhotoPreview(null);
    setTakeLink("");
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
    if (!user) { navigate("/signin"); return; }
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
    if (d.status !== "purchased") return false;
    const o = d.outcomes?.[0];
    if (!o) return false;
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
      <div style={{ background: "#F6F1EA", border: "1px solid rgba(196,158,100,0.6)", borderRadius: 18, padding: 18, marginBottom: 18 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#8A6620", textTransform: "uppercase" }}>✦ For you</span>
        <p className="font-sans" style={{ fontSize: 26, lineHeight: 1.1, color: "#1C1712", margin: "10px 0 8px" }}>Break the ice.</p>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(28,23,18,0.6)", margin: "0 0 14px" }}>Here's a decision from someone in your circle. Weigh in, and let us start learning your taste.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 11, background: "rgba(28,23,18,0.04)", border: "1px solid rgba(28,23,18,0.08)", borderRadius: 12, padding: 9, marginBottom: 14 }}>
          <div style={{ width: 48, height: 58, borderRadius: 8, background: "#D9CFC2", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {t.product_image_url
              ? <img src={t.product_image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <Camera className="w-5 h-5" style={{ color: "rgba(28,23,18,0.35)" }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {t.brand_name && <span style={{ display: "block", fontSize: 11, letterSpacing: "0.04em", color: "rgba(28,23,18,0.5)", textTransform: "uppercase" }}>{t.brand_name}</span>}
            <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1C1712", margin: "1px 0 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.product_name ?? "A decision"}</span>
            {m != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 100, color: "#9B2F63", background: "rgba(190,70,130,0.12)", border: "1px solid rgba(190,70,130,0.5)" }}>✦ {m}% match</span>}
          </div>
        </div>
        <button onClick={() => startWeighIn(t.id)} className="w-full" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "#1C1712", color: "#F4EEE6", borderRadius: 12, padding: 13, fontSize: 15, fontWeight: 600 }}>
          Weigh in <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 overflow-hidden flex justify-center">

      {/* ── Full-bleed editorial background — mirrors + light beams show on sides ── */}
      <img
        src={heroEditorial}
        aria-hidden
        alt=""
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        style={{ objectFit: "cover", objectPosition: "60% center", filter: "brightness(1.08) saturate(0.85)" }}
      />
      {/* Centre overlay so cards remain readable; sides stay fully exposed */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to right, rgba(240,236,230,0.18) 0%, rgba(240,236,230,0.62) 22%, rgba(240,236,230,0.72) 38%, rgba(240,236,230,0.72) 62%, rgba(240,236,230,0.62) 78%, rgba(240,236,230,0.18) 100%)",
        }}
      />


      {/* ── Floating header ───────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between py-3"
        style={{ background: "rgba(235,230,222,0.96)", backdropFilter: "blur(12px)", padding: isMobile ? "10px 12px" : "16px 40px" }}
      >
        {/* Left: Logo */}
        <div className="flex items-center" style={{ flexShrink: 0 }}>
          <button
            onClick={() => navigate("/")}
            className="font-sans uppercase select-none"
            style={{ letterSpacing: isMobile ? "0.18em" : "0.32em", fontSize: isMobile ? 13 : 18, color: "#1C1712" }}
          >
            <span style={{ fontWeight: 700 }}>ELEVEN</span>
            <span style={{ fontWeight: 300 }}>ELEVEN</span>
          </button>
        </div>

        {/* Center: Feed | Mine toggle */}
        <div
          className="flex items-center rounded-full px-1 py-1 gap-1"
          style={{ background: "rgba(28,23,18,0.07)" }}
        >
          <button
            onClick={() => setActiveTab("feed")}
            className="rounded-full font-medium transition-all"
            style={{
              fontSize: isMobile ? 13 : 14,
              padding: isMobile ? "4px 14px" : "6px 16px",
              ...(activeTab === "feed"
                ? { background: "rgba(28,23,18,0.10)", color: "#1C1712" }
                : { color: "rgba(28,23,18,0.45)" })
            }}
          >
            Feed
          </button>
          <button
            onClick={() => setActiveTab("mine")}
            className="rounded-full font-medium transition-all"
            style={{
              fontSize: isMobile ? 13 : 14,
              padding: isMobile ? "4px 14px" : "6px 16px",
              ...(activeTab === "mine"
                ? { background: "rgba(28,23,18,0.10)", color: "#1C1712" }
                : { color: "rgba(28,23,18,0.45)" })
            }}
          >
            Mine {myDecisions.length > 0 && `(${myDecisions.length})`}
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center" style={{ gap: isMobile ? 6 : 8, flexShrink: 0 }}>
          {/* Filter icon */}
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="rounded-full flex items-center justify-center transition-all"
            style={{
              width: isMobile ? 30 : 32, height: isMobile ? 30 : 32,
              background: filterOpen || filterBrand || filterCategory !== "All" || filterStatus !== "all" || sortBy !== "newest"
                ? "#1C1712"
                : "rgba(28,23,18,0.08)",
              color: filterBrand || filterCategory !== "All" || filterStatus !== "all" || sortBy !== "newest"
                ? "#FDFAF6"
                : "rgba(28,23,18,0.50)",
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Post button — icon only on mobile */}
          <button
            onClick={() => navigate(user ? "/post" : "/signin")}
            className="flex items-center gap-1.5 rounded-full font-semibold transition-all"
            style={{
              fontSize: isMobile ? 13 : 14,
              padding: isMobile ? "5px 12px" : "6px 12px",
              border: "1.5px solid #C49E64",
              color: "#3A3530",
              background: "rgba(196,158,100,0.08)",
              boxShadow: "0 0 10px rgba(196,158,100,0.35), 0 0 20px rgba(196,158,100,0.15)",
            }}
          >
            <Plus style={{ width: isMobile ? 11 : 12, height: isMobile ? 11 : 12 }} />
            {!isMobile && "Post"}
          </button>

          {/* Profile avatar */}
          {user ? (
            <button
              onClick={() => navigate("/profile")}
              className="rounded-full flex items-center justify-center text-[10px] font-semibold text-white overflow-hidden shrink-0"
              style={{ width: isMobile ? 30 : 32, height: isMobile ? 30 : 32, background: "#3A3530" }}
            >
              {avatarContent(myProfile?.avatar_url ?? null, myProfile?.display_name ?? null)}
            </button>
          ) : (
            <button
              onClick={() => navigate("/signin")}
              className="rounded-full flex items-center justify-center"
              style={{ width: isMobile ? 30 : 32, height: isMobile ? 30 : 32, background: "rgba(255,255,255,0.08)", color: "rgba(28,23,18,0.45)" }}
            >
              <User className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* ── Filter dropdown ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="fixed top-16 left-0 right-0 z-40 px-4 flex justify-center"
          >
            <div className="w-full max-w-[1160px]">
              <div
                className="rounded-2xl p-4 shadow-2xl"
                style={{ background: "rgba(240,236,230,0.97)", border: "1px solid rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
              >
                {/* Brand / item search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "rgba(28,23,18,0.35)" }} />
                  <input
                    type="text"
                    value={filterBrand}
                    onChange={(e) => setFilterBrand(e.target.value)}
                    placeholder="Search brand or item name"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-base focus:outline-none"
                    style={{ background: "rgba(28,23,18,0.06)", color: "#1C1712", border: "1px solid rgba(28,23,18,0.10)" }}
                  />
                </div>

                {/* Category */}
                <p className="text-[10px] uppercase tracking-[0.14em] mb-2" style={{ color: "rgba(28,23,18,0.40)" }}>Category</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {CATEGORY_OPTIONS.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                      style={
                        filterCategory === cat
                          ? { background: "#1C1712", color: "#FDFAF6", border: "1px solid #1C1712" }
                          : { background: "rgba(28,23,18,0.06)", color: "rgba(28,23,18,0.55)", border: "1px solid rgba(28,23,18,0.10)" }
                      }
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Status */}
                <p className="text-[10px] uppercase tracking-[0.14em] mb-2" style={{ color: "rgba(28,23,18,0.40)" }}>Status</p>
                <div className="flex gap-2 mb-4">
                  {(["all", "open"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                      style={
                        filterStatus === s
                          ? { background: "#1C1712", color: "#FDFAF6", border: "1px solid #1C1712" }
                          : { background: "rgba(28,23,18,0.06)", color: "rgba(28,23,18,0.55)", border: "1px solid rgba(28,23,18,0.10)" }
                      }
                    >
                      {s === "all" ? "All" : "Open only"}
                    </button>
                  ))}
                </div>

                {/* Sort */}
                <p className="text-[10px] uppercase tracking-[0.14em] mb-2" style={{ color: "rgba(28,23,18,0.40)" }}>Sort by</p>
                <div className="flex gap-2 mb-3">
                  {([
                    { value: "newest", label: "Newest" },
                    { value: "relevant", label: "Most relevant" },
                    { value: "discussed", label: "Most discussed" },
                    { value: "needs_input", label: "Needs input" },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSortBy(value)}
                      className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                      style={
                        sortBy === value
                          ? { background: "#1C1712", color: "#FDFAF6", border: "1px solid #1C1712" }
                          : { background: "rgba(28,23,18,0.06)", color: "rgba(28,23,18,0.55)", border: "1px solid rgba(28,23,18,0.10)" }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {(filterBrand || filterCategory !== "All" || filterStatus !== "all" || sortBy !== "newest") && (
                  <button
                    onClick={() => { setFilterBrand(""); setFilterCategory("All"); setFilterStatus("all"); setSortBy("newest"); }}
                    className="text-sm flex items-center gap-1 mt-1"
                    style={{ color: "rgba(28,23,18,0.40)" }}
                  >
                    <X className="w-3 h-3" /> Clear all
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Feed scroll container ─────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="w-full max-w-[1160px]"
        style={{
          overflowY: "scroll",
          paddingTop: 72,
          paddingBottom: 40,
          paddingLeft: 16,
          paddingRight: 16,
        }}
        onClick={() => filterOpen && setFilterOpen(false)}
      >
        {loading ? (
          <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
            <div className="space-y-3 text-center">
              <div className="w-12 h-12 rounded-full mx-auto animate-pulse" style={{ background: "rgba(245,239,234,0.20)" }} />
              <p className="text-lg tracking-[0.2em] uppercase" style={{ color: "#1C1712" }}>Loading decisions</p>
            </div>
          </div>
        ) : displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 text-center" style={{ minHeight: "60vh" }}>
            <p className="font-sans text-3xl leading-tight mb-3" style={{ color: "#1C1712" }}>
              {filterBrand || filterCategory !== "All" || filterStatus !== "all"
                ? "No results"
                : activeTab === "mine" ? "Nothing here yet" : "Nothing posted yet"}
            </p>
            <p className="text-lg mb-8" style={{ color: "rgba(28,23,18,0.45)" }}>
              {filterBrand || filterCategory !== "All" || filterStatus !== "all"
                ? "Try clearing the filters."
                : activeTab === "mine"
                  ? "Post something you're considering and get input from your mirrors."
                  : "Be the first to post something you're considering."}
            </p>
            {!filterBrand && filterCategory === "All" && filterStatus === "all" && (
              <button
                onClick={() => navigate(user ? "/post" : "/signin")}
                className="px-8 py-3 text-lg tracking-[0.18em] uppercase font-medium transition-all"
                style={{ borderRadius: 6, background: "#1C1712", color: "#FDFAF6", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.22)" }}
              >
                {user ? "Post a decision" : "Sign in to post"}
              </button>
            )}
          </div>
        ) : (
          <>
            {showFollowupBanner && (
              <button onClick={() => { setScrollTargetId(followupPending[0].id); setActiveTab("mine"); }} style={{ position: "relative", zIndex: 10, display: "flex", width: "100%", textAlign: "left", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#F6F1EA", border: "1px solid rgba(196,158,100,0.6)", borderRadius: 14, padding: "14px 16px", marginBottom: 16, cursor: "pointer", boxShadow: "0 2px 14px rgba(120,60,20,0.10)" }}>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A6620", margin: 0 }}>Follow up</p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#1C1712", margin: "4px 0 0" }}>
                    {followupPending.length === 1 ? "1 purchase is ready to close the loop" : `${followupPending.length} purchases are ready to close the loop`}
                  </p>
                  <p style={{ fontSize: 12, color: "rgba(28,23,18,0.55)", margin: "2px 0 0" }}>
                    {[followupPending[0].brand_name, followupPending[0].product_name].filter(Boolean).join(" ").trim()}{followupPending.length > 1 ? " and more" : ""}
                  </p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#8A6620", whiteSpace: "nowrap" }}>Review &rarr;</span>
              </button>
            )}
            {showActivation && renderActivationCard()}
            {displayList.map((decision) => (
            <div key={decision.id} id={`dec-${decision.id}`} style={{ scrollMarginTop: 80 }}>
            <DecisionCard
              decision={decision}
              user={user}
              voteCounts={voteCounts}
              userVotes={userVotes}
              setLightboxUrl={setLightboxUrl}
              setTrackingId={setTrackingId}
              setOutcomeInitial={setOutcomeInitial}
              setOutcomeChosen={setOutcomeChosen}
              quickLogOutcome={quickLogOutcome}
              quickStillDeciding={quickStillDeciding}
              submitFollowup={submitFollowup}
              updateOutcome={updateOutcome}
              submitReceived={submitReceived}
              submitReturned={submitReturned}
              startWeighIn={startWeighIn}
              handleDelete={handleDelete}
              saveDecisionEdit={saveDecisionEdit}
              handleHelpfulVote={handleHelpfulVote}
              activeTab={activeTab}
              onSignIn={() => navigate("/signin")}
              isSaved={savedDecisionIds.has(decision.id)}
              onSave={() => toggleSave(decision.id)}
              onHide={() => hideDecision(decision.id)}
              navigate={navigate}
              loggedOutcomeIds={loggedOutcomeIds}
              isMobile={isMobile}
            />
            </div>
            ))}
          </>
        )}
      </div>

      {/* ── Weigh-in bottom sheet ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {weighingIn && (
          <>
            {/* Scrim */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.6)" }}
              onClick={closeWeighIn}
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: 360 }}
              animate={{ y: 0 }}
              exit={{ y: 360 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed bottom-0 left-0 right-0 rounded-t-3xl px-6 pt-6 pb-10"
              style={{ background: "#F5EFEA", zIndex: 60 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="w-12 h-1 rounded-full mx-auto mb-6" style={{ background: "rgba(0,0,0,0.15)" }} />

              {/* Cancel */}
              <button
                onClick={closeWeighIn}
                className="absolute top-6 right-6 text-lg tracking-widest uppercase"
                style={{ color: "#8C7A70" }}
              >
                Cancel
              </button>

              {/* Step: context */}
              {weighInStep === "context" && (
                <div>
                  <p className="font-sans text-2xl mb-1" style={{ color: "#1A1A1A" }}>Your context</p>
                  <p className="text-lg mb-5" style={{ color: "#8C7A70" }}>What's your relationship with this item or brand?</p>
                  <div className="space-y-2">
                    {CONTEXT_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setContext(opt); setWeighInStep("vote"); }}
                        className="w-full text-left px-4 py-3.5 rounded-xl text-lg transition-all"
                        style={{
                          background: "rgba(0,0,0,0.04)",
                          border: "1px solid rgba(0,0,0,0.08)",
                          color: "#1A1A1A",
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step: vote */}
              {weighInStep === "vote" && (
                <div>
                  <p className="font-sans text-2xl mb-1" style={{ color: "#1A1A1A" }}>Your verdict</p>
                  <p className="text-lg mb-5" style={{ color: "#8C7A70" }}>Would you buy this?</p>
                  <div className="flex gap-2">
                    {(["buy", "do_not_buy", "need_more_info"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => { setVote(v); setWeighInStep("take"); }}
                        className="flex-1 py-3.5 rounded-full text-lg font-medium transition-all"
                        style={{
                          background: vote === v ? "#3A3530" : "rgba(0,0,0,0.04)",
                          border: `1px solid ${vote === v ? "#3A3530" : "rgba(0,0,0,0.08)"}`,
                          color: vote === v ? "#F5EFEA" : "#5A4A42",
                        }}
                      >
                        {v === "buy" ? "Yes" : v === "do_not_buy" ? "No" : "Depends"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step: take */}
              {weighInStep === "take" && (
                <div>
                  <p className="font-sans text-2xl mb-1" style={{ color: "#1A1A1A" }}>Your take</p>
                  <p className="text-lg mb-4" style={{ color: "#8C7A70" }}>
                    Think out loud — what would you tell someone like you?
                  </p>
                  <textarea
                    value={take}
                    onChange={(e) => setTake(e.target.value)}
                    placeholder="Share your honest take..."
                    rows={4}
                    className="w-full rounded-xl px-4 py-3 text-lg resize-none focus:outline-none mb-3"
                    style={{
                      background: "rgba(0,0,0,0.04)",
                      border: "1px solid rgba(0,0,0,0.08)",
                      color: "#1A1A1A",
                    }}
                  />

                  {/* Optional product link */}
                  <div style={{ position: "relative", marginBottom: 12 }}>
                    <ExternalLink style={{ width: 15, height: 15, color: "#8C7A70", position: "absolute", left: 14, top: 15, pointerEvents: "none" }} />
                    <input
                      value={takeLink}
                      onChange={(e) => setTakeLink(e.target.value)}
                      placeholder="Link a product (optional)"
                      type="url"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full rounded-full text-base focus:outline-none"
                      style={{
                        background: "rgba(0,0,0,0.04)",
                        border: "1px solid rgba(0,0,0,0.08)",
                        color: "#1A1A1A",
                        padding: "11px 16px 11px 40px",
                      }}
                    />
                    {takeLink.trim().length > 0 && !normalizeProductUrl(takeLink) && (
                      <p style={{ fontSize: 13, color: "#c0392b", margin: "6px 4px 0" }}>
                        That doesn't look like a valid link.
                      </p>
                    )}
                  </div>

                  {/* Photo attachment */}
                  <div style={{ marginBottom: 16 }}>
                    <input ref={takePhotoInputRef} type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setTakePhoto(file);
                        const reader = new FileReader();
                        reader.onload = () => setTakePhotoPreview(reader.result as string);
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }} />

                    {takePhotoPreview ? (
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <img src={takePhotoPreview} alt="attachment" style={{ height: 90, width: 72, objectFit: "cover", borderRadius: 10, display: "block" }} />
                        <button onClick={() => { setTakePhoto(null); setTakePhotoPreview(null); }}
                          style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#1A1A1A", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <X style={{ width: 10, height: 10, color: "white" }} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => takePhotoInputRef.current?.click()}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 100, border: "1px solid rgba(0,0,0,0.12)", background: "transparent", cursor: "pointer", color: "#5A4A42", fontSize: 18 }}>
                        <Camera style={{ width: 14, height: 14 }} />
                        Add a photo
                      </button>
                    )}
                  </div>

                  <button
                    onClick={submitWeighIn}
                    disabled={take.trim().length === 0 || submitting}
                    className="w-full py-3.5 text-lg tracking-[0.2em] uppercase font-medium transition-all disabled:opacity-30"
                    style={{ borderRadius: 6, background: "#1C1712", color: "#FDFAF6", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.22)", cursor: "pointer" }}
                  >
                    {submitting ? "Submitting..." : "Submit"}
                  </button>
                </div>
              )}

              {/* Step: done */}
              {weighInStep === "done" && (
                <div className="text-center py-6 space-y-3">
                  <p className="font-sans text-2xl" style={{ color: "#1A1A1A" }}>You've weighed in</p>
                  <p className="text-lg" style={{ color: "#5A4A42" }}>Your take has been added to the conversation.</p>
                  <button
                    onClick={closeWeighIn}
                    className="mt-4 px-8 py-3 rounded-full text-lg tracking-widest uppercase"
                    style={{ background: "rgba(0,0,0,0.06)", color: "#5A4A42" }}
                  >
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
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
                  .select("decision_id, did_purchase, outcome_type, primary_uncertainty, tipping_factor, tipping_factor_other, size_bought, fit_result, fit_result_note, size_recommendation, outcome_detail, outcome_detail_other, kept, recommend, confidence_after, take, followed_up_at, created_at, arrival_status, next_prompt_at, received_at, photo_url, chosen_option")
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
              className="absolute top-5 right-5 text-lg tracking-[0.2em] uppercase"
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
              background: "#1C1712", borderRadius: 100,
              display: "flex", alignItems: "center", gap: 14,
              padding: "12px 20px", zIndex: 80,
              boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
            }}
          >
            <span style={{ fontSize: 19, color: "rgba(253,250,246,0.80)" }}>Post hidden</span>
            <button
              onClick={() => undoHide(undoHiddenId)}
              style={{ fontSize: 19, fontWeight: 700, color: "#C49E64", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <DialInFitModal open={showFitModal} onClose={() => setShowFitModal(false)} variant={fitModalVariant} />
    </div>
  );
};

// ─── DecisionCard ─────────────────────────────────────────────────────────────

interface CardProps {
  decision: DecisionRow;
  user: any;
  voteCounts: Record<string, { helpful: number; not_helpful: number }>;
  userVotes: Record<string, "helpful" | "not_helpful">;
  setLightboxUrl: (url: string | null) => void;
  setTrackingId: (id: string | null) => void;
  setOutcomeInitial: (o: "bought_it" | "didnt_buy" | null) => void;
  setOutcomeChosen: (o: "first" | "second" | "both" | null) => void;
  quickLogOutcome: (id: string, outcome: "bought_it" | "didnt_buy", sizeBought?: string) => void;
  quickStillDeciding: (id: string) => void;
  submitFollowup: (id: string, data: { kept: boolean; recommend: boolean | null; confidenceAfter: number | null; take: string | null }) => void;
  updateOutcome: (id: string, patch: Record<string, any>) => void;
  submitReceived: (id: string, data: { primary: string; detailAnswer: string | null; kept: boolean | null; recommend: boolean | null; confidence: number | null; photoFile: File | null; take: string | null }) => void;
  submitReturned: (id: string, data: { note: string | null; photoFile: File | null }) => void;
  startWeighIn: (id: string) => void;
  handleDelete: (id: string) => void;
  saveDecisionEdit: (id: string, patch: { context_note: string | null; confidence_score: number; price_note: string | null; sizes_note: string | null }) => void;
  handleHelpfulVote: (responseId: string, voteType: "helpful" | "not_helpful") => void;
  activeTab: "feed" | "mine";
  onSignIn: () => void;
  isSaved: boolean;
  onSave: () => void;
  onHide: () => void;
  navigate: (path: string) => void;
  loggedOutcomeIds: Set<string>;
  isMobile: boolean;
}

const DecisionCard = ({
  decision,
  user,
  voteCounts,
  userVotes,
  setLightboxUrl,
  setTrackingId,
  setOutcomeInitial,
  setOutcomeChosen,
  quickLogOutcome,
  quickStillDeciding,
  submitFollowup,
  updateOutcome,
  submitReceived,
  submitReturned,
  startWeighIn,
  handleDelete,
  saveDecisionEdit,
  handleHelpfulVote,
  activeTab,
  onSignIn,
  isSaved,
  onSave,
  onHide,
  navigate,
  loggedOutcomeIds,
  isMobile,
}: CardProps) => {
  const [showAllResponses, setShowAllResponses] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDetails, setEditDetails] = useState<Record<string, string>>({});
  const [editConf, setEditConf] = useState(5);
  const [editPrice, setEditPrice] = useState("");
  const [editSizes, setEditSizes] = useState("");

  const editConsiderations = (decision.uncertainty_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const openEdit = () => {
    const ctx: Record<string, string> = {};
    if (decision.context_note) {
      decision.context_note.split(" · ").forEach((note) => {
        const i = note.indexOf(": ");
        if (i > -1) ctx[note.slice(0, i).trim().toLowerCase()] = note.slice(i + 2).trim();
      });
    }
    const details: Record<string, string> = {};
    editConsiderations.forEach((u) => {
      const ul = u.toLowerCase();
      const key = Object.keys(ctx).find((k) => ul.includes(k) || k.includes(ul));
      details[u] = key ? ctx[key] : "";
    });
    setEditDetails(details);
    setEditConf(decision.confidence_score ?? 5);
    setEditPrice((decision.price_note ?? "").replace(/^\$/, ""));
    setEditSizes(decision.sizes_note ?? "");
    setEditing(true);
  };
  const submitEdit = () => {
    const context_note = editConsiderations
      .filter((u) => (editDetails[u] ?? "").trim())
      .map((u) => `${u}: ${editDetails[u].trim()}`)
      .join(" · ") || null;
    saveDecisionEdit(decision.id, {
      context_note,
      confidence_score: editConf,
      price_note: editPrice.trim() ? `$${editPrice.trim().replace(/^\$/, "")}` : null,
      sizes_note: editSizes.trim() || null,
    });
    setEditing(false);
  };
  const [snoozedOutcome, setSnoozedOutcome] = useState(false);
  // The "still deciding" acknowledgment auto-reverts so the decision buttons pop back up.
  useEffect(() => {
    if (!snoozedOutcome) return;
    const t = setTimeout(() => setSnoozedOutcome(false), 2600);
    return () => clearTimeout(t);
  }, [snoozedOutcome]);
  const [pickingSize, setPickingSize] = useState(false);
  // Outcome-lifecycle wizard state (gate → received questions, or returned)
  const [fuStage, setFuStage] = useState<"gate" | "returned" | "detail" | "keep" | "recommend" | "confidence" | "photo">("gate");
  const [fuDetail, setFuDetail] = useState<string | null>(null);
  const [fuKept, setFuKept] = useState<boolean | null>(null);
  const [fuRec, setFuRec] = useState<boolean | null>(null);
  const [fuConf, setFuConf] = useState<number | null>(null);
  const [fuReturnNote, setFuReturnNote] = useState("");
  const [fuTake, setFuTake] = useState("");
  const [fuPhoto, setFuPhoto] = useState<File | null>(null);
  const [fuDismiss, setFuDismiss] = useState(false);
  const [fuThanks, setFuThanks] = useState(false);
  const fuPhotoRef = useRef<HTMLInputElement>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const imgTouchX = useRef<number | null>(null);

  // Shared swipe state so the card text (brand/name/price) can track whichever
  // option is currently in view. Closed decisions lead with the IRL outcome photo,
  // then the website image(s); open decisions just show the website image(s).
  const outcomePhoto = decision.outcomes?.[0]?.photo_url ?? null;
  const chosenOpt = decision.outcomes?.[0]?.chosen_option ?? null;
  const hasTwoOptions = !!(decision.product_image_url_2 || decision.product_url_2);
  const optAName = decision.brand_name || decision.product_name || "Option A";
  const optBName = decision.brand_name_2 || decision.product_name_2 || "Option B";
  // Website image order: lead with the chosen option once decided; IRL photo leads on closed cards.
  const webImgs = chosenOpt === "second"
    ? [decision.product_image_url_2, decision.product_image_url]
    : [decision.product_image_url, decision.product_image_url_2];
  const swipeImgs = (outcomePhoto ? [outcomePhoto, ...webImgs] : webImgs).filter(Boolean) as string[];
  const curSwipeIdx = swipeImgs.length ? Math.min(imgIdx, swipeImgs.length - 1) : 0;
  const showingSecondProduct = !!decision.product_image_url_2 && swipeImgs[curSwipeIdx] === decision.product_image_url_2;
  const dispBrand = showingSecondProduct ? (decision.brand_name_2 || decision.brand_name) : decision.brand_name;
  const dispName = showingSecondProduct ? (decision.product_name_2 || decision.product_name) : decision.product_name;
  const dispPrice = showingSecondProduct ? (decision.price_note_2 || decision.price_note) : decision.price_note;
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwn = user?.id === decision.user_id;
  const confidence = decision.confidence_score ?? 0;
  const PREVIEW_COUNT = 2;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const sortedResponses = [...(decision.responses ?? [])]
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));

  // Weigh-ins from other women (excludes the poster) — drives the outcome prompt.
  const weighInCount = sortedResponses.filter((r) => r.user_id !== decision.user_id).length;

  const posterName = formatName(decision.profiles?.display_name ?? null);
  // City only — age is kept on profiles but intentionally hidden in the feed.
  const posterMeta = decision.profiles?.city?.split(",")[0] ?? "";

  return (
    <div
      style={{
        background: "#F5EFEA",
        borderRadius: 20,
        boxShadow: "0 6px 24px rgba(0,0,0,0.08)",
        overflow: "visible",
        marginBottom: 20,
        position: "relative",
      }}
    >
      {/* ── User header row — ABOVE the image ─────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: isMobile ? "10px 12px 8px" : "14px 16px 12px",
        borderRadius: "20px 20px 0 0",
      }}>
        {/* Avatar */}
        <div style={{ width: isMobile ? 44 : 72, height: isMobile ? 44 : 72, borderRadius: "50%", background: "#3A3530", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 15 : 22, color: "white", fontWeight: 700, flexShrink: 0, overflow: "hidden" }}>
          {decision.profiles?.avatar_url
            ? <img src={decision.profiles.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span>{getInitials(decision.profiles?.display_name ?? null)}</span>
          }
        </div>

        {/* Name + meta + profile toggle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name */}
          <p style={{ fontSize: isMobile ? 14 : 17, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.2, margin: 0, marginBottom: 2 }}>
            {posterName}
          </p>
          {/* Age, city · match badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 2 }}>
            <span style={{ fontSize: isMobile ? 13 : 16, color: "#8C7A70" }}>
              {posterMeta}
            </span>
            {decision.matchScore != null && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                fontSize: isMobile ? 12 : 15, fontWeight: 700, color: "#FDFAF6",
                background: "linear-gradient(135deg, #C4A47A 0%, #B8956A 50%, #A07848 100%)",
                border: "1px solid rgba(220,185,130,0.55)",
                borderRadius: 100, padding: isMobile ? "1px 6px" : "2px 7px",
                letterSpacing: "0.03em",
                boxShadow: "0 0 6px rgba(184,149,106,0.40), inset 0 1px 0 rgba(255,255,255,0.20)",
              }}>
                ✦ {Math.round(decision.matchScore)}%
              </span>
            )}
          </div>
          {/* Profile toggle */}
          <button
            onClick={() => setProfileOpen(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 3, color: "#8C7A70", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span style={{ fontSize: isMobile ? 12 : 16 }}>{isOwn ? "Your profile" : "See her profile"}</span>
            {profileOpen ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
          </button>
        </div>

        {/* Date + Save (bookmark) */}
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: isMobile ? 12 : 15, color: "#8C7A70" }}>{timeAgo(decision.created_at)}</span>
          <button
            onClick={onSave}
            title={isSaved ? "Unsave" : "Save"}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "1px solid rgba(0,0,0,0.10)",
              background: isSaved ? "rgba(196,158,100,0.12)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
          <Bookmark
            style={{
              width: 14, height: 14,
              color: isSaved ? "#C49E64" : "#8C7A70",
              fill: isSaved ? "#C49E64" : "none",
            }}
          />
          </button>
        </div>

        {/* 3-dot menu */}
        <div style={{ position: "relative", flexShrink: 0 }} ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "1px solid rgba(0,0,0,0.10)",
              background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <MoreHorizontal style={{ width: 14, height: 14, color: "#8C7A70" }} />
          </button>
          {menuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0,
              background: "#F5EFEA", borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.10)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
              minWidth: 160, zIndex: 10, overflow: "hidden",
            }}>
              {!isOwn && (
                <button
                  onClick={() => { setMenuOpen(false); onHide(); }}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "12px 16px", background: "none", border: "none",
                    fontSize: 19, color: "#1A1A1A", cursor: "pointer",
                  }}
                >
                  Hide this post
                </button>
              )}
              {isOwn && decision.status === "open" && (
                <button
                  onClick={() => { setMenuOpen(false); openEdit(); }}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "12px 16px", background: "none", border: "none",
                    fontSize: 19, color: "#1A1A1A", cursor: "pointer",
                  }}
                >
                  Edit post
                </button>
              )}
              {isOwn && activeTab === "mine" && (
                <button
                  onClick={() => { setMenuOpen(false); if (confirm("Remove this decision?")) handleDelete(decision.id); }}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "12px 16px", background: "none", border: "none",
                    fontSize: 19, color: "#c0392b", cursor: "pointer",
                  }}
                >
                  Delete post
                </button>
              )}
              {isOwn && decision.status === "open" && !loggedOutcomeIds.has(decision.id) && (
                <button
                  onClick={() => { setMenuOpen(false); setTrackingId(decision.id); }}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "12px 16px", background: "none", border: "none",
                    fontSize: 19, color: "#1A1A1A", cursor: "pointer",
                    borderTop: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  Log outcome
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Edit post modal (owner) ───────────────────────────────────────────── */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={() => setEditing(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", background: "#FDFAF6", borderRadius: 16, padding: 22, boxShadow: "0 12px 40px rgba(0,0,0,0.28)" }}>
            <p style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#1A1A1A", margin: "0 0 4px" }}>Edit your post</p>
            <p style={{ fontSize: 14, color: "#8C7A70", margin: "0 0 18px" }}>Add more context, adjust your confidence, or fix a detail.</p>
            {editConsiderations.map((u) => (
              <div key={u} style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", margin: "0 0 6px" }}>{u}</p>
                <textarea value={editDetails[u] ?? ""} onChange={(e) => setEditDetails((p) => ({ ...p, [u]: e.target.value }))} rows={2} placeholder="Add context — how you'll wear it, your specific worry..." style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", padding: "10px 12px", fontSize: 14, color: "#1A1A1A", resize: "none", fontFamily: "inherit" }} />
              </div>
            ))}
            {(decision.uncertainty_text ?? "").toLowerCase().includes("between sizes") && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", margin: "0 0 6px" }}>Sizes you're deciding between</p>
                <input value={editSizes} onChange={(e) => setEditSizes(e.target.value)} placeholder="e.g. M, L" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", padding: "10px 12px", fontSize: 14, color: "#1A1A1A" }} />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", margin: "0 0 6px" }}>Price</p>
              <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} inputMode="decimal" placeholder="e.g. 128" style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", padding: "10px 12px", fontSize: 14, color: "#1A1A1A" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", margin: "0 0 8px" }}>Confidence: {editConf}/10</p>
              <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: 10 }).map((_, i) => { const n = i + 1; return (
                  <button key={n} onClick={() => setEditConf(n)} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: n <= editConf ? "#1C1712" : "#fff", color: n <= editConf ? "#FDFAF6" : "#1A1A1A", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{n}</button>
                ); })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setEditing(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "transparent", color: "#5A4A42", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={submitEdit} style={{ flex: 2, padding: "12px 0", borderRadius: 8, border: "none", background: "#1C1712", color: "#FDFAF6", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Save changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile dropdown ─────────────────────────────────────────────────── */}
      {profileOpen && decision.profiles && (() => {
        const silLabel = decision.profiles.silhouette_preference?.[0] ?? null;
        const silMatch = silLabel ? SILHOUETTE_OPTIONS.find(o => o.label === silLabel) : null;
        const statRows = [
          decision.profiles.height_range && ["Height", decision.profiles.height_range],
          decision.profiles.top_size && ["Top size", decision.profiles.top_size],
          decision.profiles.bottom_size && ["Bottom size", decision.profiles.bottom_size],
          decision.profiles.fit_preference && ["Fit preference", decision.profiles.fit_preference],
        ].filter(Boolean) as [string, string][];

        return (
          <div style={{ background: "rgba(0,0,0,0.04)", margin: "0 16px 0", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.06)" }}>
            {silMatch && (
              <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ width: 90, flexShrink: 0, overflow: "hidden" }}>
                  <img src={silMatch.image} alt={silMatch.label} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "12px 14px" }}>
                  <span style={{ fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8C7A70", marginBottom: 4 }}>Silhouette</span>
                  <span style={{ fontSize: 19, fontWeight: 600, color: "#1A1A1A", lineHeight: 1.3, marginBottom: 3 }}>{silMatch.label}</span>
                  <span style={{ fontSize: 19, color: "#5A4A42", lineHeight: 1.4 }}>{silMatch.desc}</span>
                </div>
              </div>
            )}
            <div style={{ padding: "0 14px" }}>
              {statRows.map(([label, value], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < statRows.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}>
                  <span style={{ fontSize: 13, color: "#8C7A70", textTransform: "uppercase", letterSpacing: "0.15em" }}>{label}</span>
                  <span style={{ fontSize: 19, color: "#5A4A42", fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
              <button
                onClick={() => navigate(isOwn ? "/profile" : `/profile/${decision.user_id}`)}
                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: 0, color: "#5A4A42" }}
              >
                <span style={{ fontSize: 19, fontWeight: 600 }}>View full profile</span>
                <ArrowRight style={{ width: 11, height: 11 }} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Body: image left + data right (stacked on mobile) ───────────────── */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "stretch", borderRadius: "0 0 20px 20px", overflow: "hidden" }}>

        {/* ── Product image ── */}
        {decision.product_image_url && (() => {
          const oPhoto = outcomePhoto;
          const imgs = swipeImgs;
          const idx = curSwipeIdx;
          const multi = imgs.length > 1;
          const showingOutcome = !!oPhoto && imgs[idx] === oPhoto;
          // Each option's image links to its own product page; the IRL photo has none.
          const currentUrl = imgs[idx] === decision.product_image_url ? (decision.product_url ?? null)
            : imgs[idx] === decision.product_image_url_2 ? (decision.product_url_2 ?? null)
            : null;
          const go = (dir: number) => setImgIdx((imgs.length + idx + dir) % imgs.length);
          const arrow: React.CSSProperties = { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(28,23,18,0.55)", color: "#fff", fontSize: 20, lineHeight: "30px", textAlign: "center", cursor: "pointer", zIndex: 3, padding: 0 };
          return (
            <div
              style={{ position: "relative", width: isMobile ? "100%" : "42%", flexShrink: 0, background: "#EDE8E2", overflow: "hidden" }}
              onTouchStart={(e) => { imgTouchX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => { if (imgTouchX.current == null || !multi) return; const dx = e.changedTouches[0].clientX - imgTouchX.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); imgTouchX.current = null; }}
            >
              <img
                src={imgs[idx]}
                alt={decision.product_name ?? "Product"}
                style={{ width: "100%", height: "auto", display: "block", cursor: "zoom-in" }}
                onClick={() => setLightboxUrl(imgs[idx])}
              />
              {showingOutcome && (
                <span style={{ position: "absolute", top: 10, left: 10, background: "rgba(28,23,18,0.82)", color: "#F4EEE6", fontSize: 11, fontWeight: 600, borderRadius: 100, padding: "3px 10px", letterSpacing: "0.04em", zIndex: 3 }}>✦ On her</span>
              )}
              {oPhoto && !showingOutcome && (
                <motion.button
                  onClick={(e) => { e.stopPropagation(); setImgIdx(imgs.indexOf(oPhoto)); }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: [0, -3, 0] }}
                  transition={{ y: { repeat: Infinity, duration: 1.8, ease: "easeInOut" }, opacity: { duration: 0.3 } }}
                  style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(28,23,18,0.86)", color: "#F4EEE6", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", borderRadius: 100, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6, zIndex: 4, boxShadow: "0 3px 12px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}
                >
                  ✦ See it IRL <span style={{ fontSize: 14 }}>→</span>
                </motion.button>
              )}
              {multi && (
                <>
                  <span style={{ position: "absolute", top: 10, right: 10, background: "rgba(28,23,18,0.6)", color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 100, padding: "2px 9px", zIndex: 3 }}>{idx + 1} / {imgs.length}</span>
                  {!isMobile ? (
                    <>
                      <button aria-label="Previous image" onClick={(e) => { e.stopPropagation(); go(-1); }} style={{ ...arrow, left: 8 }}>‹</button>
                      <button aria-label="Next image" onClick={(e) => { e.stopPropagation(); go(1); }} style={{ ...arrow, right: 8 }}>›</button>
                    </>
                  ) : (!oPhoto || showingOutcome) ? (
                    <span style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(28,23,18,0.62)", color: "#fff", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", borderRadius: 100, padding: "3px 12px", zIndex: 3, display: "flex", alignItems: "center", gap: 5 }}>swipe <span style={{ fontSize: 13 }}>→</span></span>
                  ) : null}
                </>
              )}
              {currentUrl && (
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(245,239,234,0.92)", backdropFilter: "blur(8px)", borderRadius: 100, padding: "4px 10px", display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#5A4A42", textDecoration: "none", zIndex: 2 }}
                >
                  <ExternalLink style={{ width: 11, height: 11 }} /> View
                </a>
              )}
            </div>
          );
        })()}

        {/* ── Right: all card data ── */}
        <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "14px 14px 16px" : "20px 22px 24px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 0, background: "rgba(255,255,255,0.72)", backdropFilter: "blur(4px)" }}>

          {/* Brand + product name — tracks the swiped option */}
          {(dispBrand || dispName) && (
            <div style={{ marginBottom: 4 }}>
              {dispBrand && (
                <p style={{ fontSize: isMobile ? 16 : 19, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.25, marginBottom: 4 }}>
                  {dispBrand}
                </p>
              )}
              {dispName && (
                <p style={{ fontSize: isMobile ? 11 : 13, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8C7A70" }}>
                  {dispName}
                </p>
              )}
              {dispPrice && (
                <p style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#1A1A1A", marginTop: 5 }}>
                  {dispPrice.startsWith("$") ? dispPrice : `$${dispPrice}`}
                </p>
              )}
              {!decision.product_image_url && decision.product_url && (
                <a href={decision.product_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 15, color: "#5A4A42", textDecoration: "none", marginTop: 4 }}>
                  <ExternalLink style={{ width: 11, height: 11 }} /> View
                </a>
              )}
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(0,0,0,0.07)", marginTop: 14, marginBottom: 16 }} />

          {/* ── OUTCOME CARD (purchased / closed) ── */}
          {(decision.status === "purchased" || decision.status === "closed") ? (() => {
            const outcome = decision.outcomes?.[0] ?? null;
            const bought = decision.status === "purchased";
            const sizeBought = outcome?.size_bought ?? null;
            const confidenceAfter = outcome?.confidence_after ?? null;
            // Prefer the dedicated take; fall back to legacy write-ins so old outcomes still read well.
            // Show her reasoning no matter what: free-text take first, then any
            // write-in, then the preset reason she picked (so "didn't buy" cards
            // always surface why — not only when she chose "Something else").
            const take = outcome?.take || outcome?.fit_result_note || outcome?.outcome_detail_other || outcome?.tipping_factor_other || outcome?.tipping_factor || null;
            const followedUp = !!outcome?.followed_up_at;
            const kept = outcome?.kept;
            const recommend = outcome?.recommend;
            const uncertainties = (decision.uncertainty_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
            const sizeChips = (decision.sizes_note ?? "").split(",").map((s) => s.trim()).filter(Boolean);
            const LBL: React.CSSProperties = { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8C7A70", margin: 0 };

            return (
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

                {/* Final decision panel */}
                <div style={{ background: "rgba(0,0,0,0.035)", borderRadius: 12, padding: "16px 14px", display: "flex", alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: bought ? "#6E7A44" : "#8C7A70", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {bought ? <Check style={{ width: 20, height: 20, color: "#fff" }} /> : <X style={{ width: 18, height: 18, color: "#fff" }} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={LBL}>Final decision</p>
                      <p style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.01em", color: "#1A1A1A", margin: "2px 0 0", lineHeight: 1.05, whiteSpace: "nowrap" }}>{bought ? (chosenOpt === "both" ? "Bought both" : "Bought it") : (hasTwoOptions ? "Didn't buy either" : "Didn't buy it")}</p>
                    </div>
                  </div>
                  {bought && sizeBought && (
                    <>
                      <div style={{ width: 1, alignSelf: "stretch", background: "rgba(0,0,0,0.1)", margin: "0 14px" }} />
                      <div style={{ flexShrink: 0 }}>
                        <p style={LBL}>Purchased size</p>
                        <p style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.01em", color: "#1A1A1A", margin: "2px 0 0", lineHeight: 1.05, textTransform: "uppercase" }}>{sizeBought}</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Confidence journey */}
                <div style={{ marginBottom: 16 }}>
                  <p style={{ ...LBL, marginBottom: 9 }}>Confidence journey</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 15, color: "#3A3530" }}>Started <strong style={{ fontSize: 17 }}>{confidence}</strong><span style={{ color: "#8C7A70" }}>/10</span></span>
                    <span style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.22)" }} />
                    {confidenceAfter != null ? (
                      <span style={{ fontSize: 15, color: "#3A3530" }}>Ended <strong style={{ fontSize: 17, color: "#6E7A44" }}>{confidenceAfter}</strong><span style={{ color: "#8C7A70" }}>/10</span></span>
                    ) : (
                      <span style={{ fontSize: 13, color: "#B0A498", fontStyle: "italic" }}>pending</span>
                    )}
                  </div>
                </div>

                {/* Was deciding about */}
                {(uncertainties.length > 0 || sizeChips.length > 0) && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ ...LBL, marginBottom: 9 }}>Was deciding about</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {uncertainties.map((u, i) => (
                        <span key={`u${i}`} style={{ fontSize: 13, color: "#3A3530", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 100, padding: "5px 12px", whiteSpace: "nowrap" }}>{u}</span>
                      ))}
                      {sizeChips.map((s) => (
                        <span key={`s${s}`} style={{ fontSize: 13, color: "#3A3530", background: "rgba(184,149,106,0.14)", border: "1px solid rgba(184,149,106,0.22)", borderRadius: 100, padding: "5px 12px", whiteSpace: "nowrap" }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Her take — only once she's written one */}
                {take && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ ...LBL, marginBottom: 8 }}>Her take</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 26, fontWeight: 700, color: "#C2B9A6", lineHeight: 0.9 }}>&ldquo;</span>
                      <p style={{ fontSize: 15, fontStyle: "italic", lineHeight: 1.5, margin: 0, color: "#3A3530" }}>{take}<span style={{ fontSize: 26, fontWeight: 700, color: "#C2B9A6", lineHeight: 0, verticalAlign: "-0.35em" }}>&rdquo;</span></p>
                    </div>
                  </div>
                )}

                {/* Recommends / kept — only after the 2-week follow-up */}
                {followedUp && (kept != null || recommend != null) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 16 }}>
                    {recommend === true && <span style={{ fontSize: 12, background: "#6E7A44", color: "#fff", borderRadius: 100, padding: "4px 11px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><Check style={{ width: 12, height: 12 }} /> Recommends to her matches</span>}
                    {recommend === false && <span style={{ fontSize: 12, background: "rgba(122,64,64,0.10)", color: "#7A4040", borderRadius: 100, padding: "4px 11px", fontWeight: 600 }}>Wouldn't recommend</span>}
                    {kept === true && <span style={{ fontSize: 12, color: "#6E7A44", fontWeight: 600 }}>Kept it</span>}
                    {kept === false && <span style={{ fontSize: 12, color: "#7A4040", fontWeight: 600 }}>Returned it</span>}
                  </div>
                )}

                {/* Outcome lifecycle — owner only: gate → received questions (or returned) */}
                {isOwn && decision.status === "purchased" && (() => {
                  const o = decision.outcomes?.[0] ?? null;
                  if (!o) return null;
                  const arrival = o.arrival_status;
                  if (arrival === "received" || arrival === "returned" || fuDismiss) return null;
                  if (arrival === "waiting" && o.next_prompt_at && Date.now() < new Date(o.next_prompt_at).getTime()) return null;

                  const itemName = [decision.brand_name, decision.product_name].filter(Boolean).join(" ").trim() || "your pick";
                  const primary = parsePrimaryUncertainty(decision.uncertainty_text);
                  const fitLike = primary === "Between sizes" || primary === "Will it fit right";
                  const detailQ = fitLike ? "How did it fit?" : outcomeDetailQuestion(primary, "bought_it");
                  const detailOpts = fitLike ? FIT_RESULT_OPTIONS : outcomeDetailOptions(primary);

                  const heading = (t: string) => <p style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: "0 0 10px", lineHeight: 1.4 }}>{t}</p>;
                  const dark: React.CSSProperties = { flex: 1, padding: "11px 6px", borderRadius: 8, border: "none", background: "#1C1712", color: "#FDFAF6", fontSize: 13.5, fontWeight: 600, cursor: "pointer", textAlign: "center" };
                  const outline: React.CSSProperties = { flex: 1, padding: "11px 8px", borderRadius: 8, border: "1px solid #1C1712", background: "transparent", color: "#1C1712", fontSize: 13.5, fontWeight: 600, cursor: "pointer", textAlign: "center" };
                  const ta: React.CSSProperties = { width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", padding: "10px 12px", fontSize: 14, color: "#1A1A1A", resize: "none", fontFamily: "inherit" };
                  const wrap = (inner: React.ReactNode) => <div style={{ background: "#F6F1EA", border: "1px solid rgba(196,158,100,0.6)", borderRadius: 12, padding: 14, marginBottom: 16 }}>{inner}</div>;

                  if (fuStage === "gate") return wrap(
                    <div>
                      {heading(`Ready to tell us how the ${itemName} went?`)}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={outline} onClick={() => { updateOutcome(decision.id, { arrival_status: "waiting", next_prompt_at: new Date(Date.now() + 3 * 86400000).toISOString() }); setFuDismiss(true); }}>Still waiting</button>
                        <button style={outline} onClick={() => setFuStage("returned")}>Returned / canceled</button>
                        <button style={dark} onClick={() => setFuStage("detail")}>Received it</button>
                      </div>
                    </div>
                  );
                  if (fuStage === "returned") return wrap(
                    <div>
                      {heading("What went wrong? (optional)")}
                      <textarea value={fuReturnNote} onChange={(e) => setFuReturnNote(e.target.value)} rows={2} placeholder="e.g. ran huge, fabric felt cheap, changed my mind" style={ta} />
                      <input ref={fuPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFuPhoto(e.target.files?.[0] ?? null)} />
                      <button onClick={() => fuPhotoRef.current?.click()} style={{ ...outline, width: "100%", flex: "unset", marginTop: 10 }}>{fuPhoto ? "✓ Photo added — change" : "+ Add a photo (optional)"}</button>
                      <p style={{ fontSize: 12, color: "#8C7A70", margin: "8px 0 0" }}>Even if it didn't work out, a photo shows the next woman why.</p>
                      <button style={{ ...dark, width: "100%", marginTop: 10, padding: "12px 0" }} onClick={() => { submitReturned(decision.id, { note: fuReturnNote, photoFile: fuPhoto }); setFuThanks(true); }}>Done</button>
                    </div>
                  );
                  if (fuStage === "detail") return wrap(
                    <div>
                      {heading(detailQ)}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {detailOpts.map((opt) => <button key={opt} style={{ ...outline, minWidth: 90 }} onClick={() => { setFuDetail(opt); setFuStage("keep"); }}>{opt}</button>)}
                      </div>
                    </div>
                  );
                  if (fuStage === "keep") return wrap(
                    <div>
                      {heading("Will you keep it, or return it?")}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={dark} onClick={() => { setFuKept(true); setFuStage("recommend"); }}>Keeping it</button>
                        <button style={outline} onClick={() => { setFuKept(false); setFuStage("recommend"); }}>Returning it</button>
                      </div>
                    </div>
                  );
                  if (fuStage === "recommend") return wrap(
                    <div>
                      {heading("Would you recommend it to women like you?")}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={dark} onClick={() => { setFuRec(true); setFuStage("confidence"); }}>Yes</button>
                        <button style={outline} onClick={() => { setFuRec(false); setFuStage("confidence"); }}>No</button>
                      </div>
                    </div>
                  );
                  if (fuStage === "confidence") return wrap(
                    <div>
                      {heading("Post-purchase confidence?")}
                      <div style={{ display: "flex", gap: 4 }}>
                        {Array.from({ length: 10 }).map((_, i) => { const n = i + 1; return <button key={n} onClick={() => { setFuConf(n); setFuStage("photo"); }} style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", color: "#1A1A1A", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{n}</button>; })}
                      </div>
                      <p style={{ fontSize: 12, color: "#8C7A70", margin: "8px 0 0" }}>1 = wish I hadn't, 10 = so glad I did</p>
                    </div>
                  );
                  return wrap(
                    <div>
                      {heading("Anything you'd tell a woman like you?")}
                      <p style={{ fontSize: 12.5, color: "#8C7A70", margin: "0 0 10px" }}>Optional — how it really fits, wears, or holds up (e.g. runs big, super wrinkly by end of day, the denim gives after a few wears).</p>
                      <textarea value={fuTake} onChange={(e) => setFuTake(e.target.value)} rows={3} placeholder="Share what the photos can't show..." style={ta} />
                      <input ref={fuPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFuPhoto(e.target.files?.[0] ?? null)} />
                      <button onClick={() => fuPhotoRef.current?.click()} style={{ ...outline, width: "100%", flex: "unset", marginTop: 10 }}>{fuPhoto ? "✓ Photo added — change" : "+ Add a photo (optional)"}</button>
                      <button onClick={() => { submitReceived(decision.id, { primary, detailAnswer: fuDetail, kept: fuKept, recommend: fuRec, confidence: fuConf, photoFile: fuPhoto, take: fuTake }); setFuThanks(true); }} style={{ ...dark, width: "100%", marginTop: 8, padding: "12px 0" }}>Done</button>
                    </div>
                  );
                })()}

                {/* Reinforcement message, right after they log what happened */}
                {isOwn && fuThanks && (
                  <div style={{ background: "#1C1712", color: "#F4EEE6", borderRadius: 12, padding: 16, textAlign: "center", fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>
                    Your experience is now part of ELEVENELEVEN.<br />It will help women like you shop with more confidence.
                  </div>
                )}

                {/* The 2-week "how is it holding up" reminder is delivered as a
                    separate log-outcome notification, not a second on-card flow —
                    the received-it flow above already captures Her take. */}

                {/* Responses — collapsed by default on closed cards so the outcome lands first */}
                {sortedResponses.length > 0 && (() => {
                  const visibleResponses = sortedResponses.slice(0, 0);
                  const hiddenResponses = sortedResponses;
                  const renderResponse = (resp: ResponseRow) => {
                    const counts = voteCounts[resp.id] ?? { helpful: 0, not_helpful: 0 };
                    const isOwnResp = resp.user_id === user?.id;
                    const myVote = userVotes[resp.id];
                    const isBuy = resp.recommendation === "buy";
                    const isNoBuy = resp.recommendation === "do_not_buy";
                    return (
                      <div key={resp.id} style={{ background: "rgba(0,0,0,0.04)", borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(0,0,0,0.06)" }}>
                        {/* Header row: avatar + name + match + rec badge */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {/* Mini avatar */}
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#3A3530", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "white", fontWeight: 700 }}>
                              {resp.profiles?.avatar_url
                                ? <img src={resp.profiles.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : getInitials(resp.profiles?.display_name ?? null)}
                            </div>
                            <div>
                              <span style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{formatName(resp.profiles?.display_name ?? null)}</span>
                              <MatchBadge score={resp.match_score} />
                            </div>
                          </div>
                          <div style={{ borderRadius: 100, padding: "3px 10px", fontSize: 13, fontWeight: 600, background: isBuy ? "rgba(22,163,74,0.10)" : isNoBuy ? "rgba(192,57,43,0.10)" : "rgba(217,119,6,0.10)", color: isBuy ? "#16a34a" : isNoBuy ? "#c0392b" : "#d97706" }}>
                            {recommendationLabel(resp.recommendation)}
                          </div>
                        </div>

                        {/* Reasoning */}
                        <p style={{ fontSize: 15, lineHeight: 1.6, color: "#5A4A42", marginBottom: 10 }}>{resp.reasoning}</p>

                        {resp.product_url && (
                          <a href={resp.product_url} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 7, maxWidth: "100%", padding: "7px 13px", marginBottom: 10, borderRadius: 100, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(0,0,0,0.02)", color: "#3A3530", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                            <ExternalLink style={{ width: 14, height: 14, flexShrink: 0, color: "#8C7A70" }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prettyHost(resp.product_url)}</span>
                          </a>
                        )}

                        {resp.photo_url && (
                          <img src={resp.photo_url} alt="response photo" onClick={() => window.open(resp.photo_url!, "_blank")}
                            style={{ height: 120, width: 96, objectFit: "cover", objectPosition: "top", borderRadius: 10, display: "block", marginBottom: 10, cursor: "zoom-in" }} />
                        )}

                        {/* Footer: helpful button + date */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                          <button
                            onClick={() => !isOwnResp && user && handleHelpfulVote(resp.id, "helpful")}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "4px 12px", borderRadius: 100,
                              border: `1.5px solid ${myVote === "helpful" ? "rgba(58,53,48,0.35)" : "rgba(0,0,0,0.15)"}`,
                              background: myVote === "helpful" ? "rgba(58,53,48,0.08)" : "white",
                              color: myVote === "helpful" ? "#1A1A1A" : "#5A4A42",
                              cursor: isOwnResp || !user ? "default" : "pointer",
                              fontSize: 13, fontWeight: 600,
                              transition: "all 0.15s",
                              opacity: isOwnResp ? 0.5 : 1,
                            }}
                          >
                            {myVote === "helpful" ? <Check style={{ width: 11, height: 11 }} /> : <ThumbsUp style={{ width: 11, height: 11 }} />}
                            <span>Helpful{counts.helpful > 0 ? ` (${counts.helpful})` : ""}</span>
                          </button>
                          <span style={{ fontSize: 13, color: "#8C7A70" }}>{timeAgo(resp.created_at)}</span>
                        </div>
                      </div>
                    );
                  };

                  return (
                  <>
                    <div style={{ height: 1, background: "rgba(0,0,0,0.07)", marginTop: 16, marginBottom: 16 }} />
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 13, letterSpacing: "0.25em", textTransform: "uppercase", color: "#8C7A70", marginBottom: 14, display: "flex", alignItems: "center", gap: 5 }}>
                        What women like you said <Info style={{ width: 13, height: 13, flexShrink: 0 }} />
                      </p>

                      {/* Always-visible first 2 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {visibleResponses.map(renderResponse)}
                      </div>

                      {/* Hidden responses behind toggle */}
                      {hiddenResponses.length > 0 && (
                        <>
                          {showAllResponses && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                              {hiddenResponses.map(renderResponse)}
                            </div>
                          )}
                          <button
                            onClick={() => setShowAllResponses(v => !v)}
                            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 12 }}
                          >
                            <MessageCircle style={{ width: 15, height: 15, color: "#8C7A70" }} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#5A4A42", textDecoration: "underline", textDecorationColor: "rgba(0,0,0,0.2)", textUnderlineOffset: 3 }}>
                              {showAllResponses ? "Collapse" : `See what ${hiddenResponses.length} ${hiddenResponses.length === 1 ? "woman" : "women"} said`}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                  );
                })()}

                {/* CTA row — delete button for own cards only */}
                <div style={{ marginTop: "auto", paddingTop: 16, display: "flex", alignItems: "center" }}>
                  {isOwn && activeTab === "mine" && (
                    <button
                      onClick={() => { if (confirm("Remove this decision?")) handleDelete(decision.id); }}
                      style={{ padding: "8px 16px", borderRadius: 100, background: "transparent", border: "1px solid rgba(0,0,0,0.10)", color: "#8C7A70", fontSize: 15, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })() : (
            <>
              {/* DECISION + CONFIDENCE side by side */}
              <div style={{ display: "flex", gap: 12, padding: "10px 0" }}>
                {/* Decision block — one card per uncertainty */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, letterSpacing: isMobile ? "0.02em" : "0.3em", whiteSpace: "nowrap", textTransform: "uppercase", color: "#8C7A70", marginBottom: 10 }}>
                    Decisions / Considerations
                  </p>
                  {(() => {
                    const uncertainties = decision.uncertainty_text
                      ? decision.uncertainty_text.split(", ").map((u: string) => u.trim()).filter(Boolean)
                      : [];

                    // Build context map: label (lowercase) → detail
                    const contextMap: Record<string, string> = {};
                    if (decision.context_note) {
                      decision.context_note.split(" · ").forEach((note: string) => {
                        const idx = note.indexOf(": ");
                        if (idx > -1) {
                          contextMap[note.slice(0, idx).trim().toLowerCase()] = note.slice(idx + 2).trim();
                        }
                      });
                    }

                    return uncertainties.map((u: string, i: number) => {
                      const ul = u.toLowerCase();
                      const isBetweenSizes = ul.includes("between sizes");
                      const matchKey = Object.keys(contextMap).find(k => ul.includes(k) || k.includes(ul));
                      const detail = matchKey ? contextMap[matchKey] : null;
                      const hasDetail = (isBetweenSizes && decision.sizes_note) || detail;

                      return (
                        <div key={i} style={{ background: "rgba(0,0,0,0.04)", borderRadius: 12, padding: "12px 14px", marginBottom: i < uncertainties.length - 1 ? 8 : 0 }}>
                          <p style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A", marginBottom: hasDetail ? 6 : 0 }}>{u}</p>
                          {isBetweenSizes && decision.sizes_note && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 15, color: "#8C7A70" }}>Deciding between</span>
                              {decision.sizes_note.split(",").map((s: string) => (
                                <span key={s} style={{ fontSize: 15, fontWeight: 600, color: "#3A3530", background: "rgba(184,149,106,0.12)", border: "1px solid rgba(184,149,106,0.22)", borderRadius: 100, padding: "2px 10px" }}>
                                  {s.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                          {detail && (
                            <p style={{ fontSize: 15, lineHeight: 1.5, color: "#5A4A42" }}>"{detail}"</p>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Confidence block */}
                <div style={{ width: 110, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8C7A70", marginBottom: 4, textAlign: "center" }}>
                    Confidence
                  </p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 6 }}>
                    <span style={{ fontSize: 33, fontWeight: 700, color: "#3A3530", lineHeight: 1 }}>{confidence}</span>
                    <span style={{ fontSize: 15, fontWeight: 500, color: "#8C7A70", lineHeight: 1 }}>/10</span>
                  </div>
                  <div style={{ display: "flex", gap: 2, marginBottom: 5 }}>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} style={{ width: 5, height: 18, borderRadius: 3, background: i < confidence ? "#3A3530" : "rgba(0,0,0,0.10)" }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, color: confidence <= 3 ? "#c0392b" : confidence <= 6 ? "#d97706" : "#16a34a" }}>
                    {confidence <= 3 ? "Low" : confidence <= 6 ? "Medium" : "High"}
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(0,0,0,0.07)", marginBottom: 16 }} />

              {/* Responses section */}
              {sortedResponses.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 13, letterSpacing: isMobile ? "0.02em" : "0.25em", whiteSpace: "nowrap", textTransform: "uppercase", color: "#8C7A70", marginBottom: 14, display: "flex", alignItems: "center", gap: 5 }}>
                    What women like you are saying <Info style={{ width: 13, height: 13, flexShrink: 0 }} />
                  </p>
                  {(() => {
                    const renderResponse = (resp: ResponseRow) => {
                      const counts = voteCounts[resp.id] ?? { helpful: 0, not_helpful: 0 };
                      const isOwnResp = resp.user_id === user?.id;
                      const myVote = userVotes[resp.id];
                      const isBuy = resp.recommendation === "buy";
                      const isNoBuy = resp.recommendation === "do_not_buy";
                      return (
                        <div key={resp.id} style={{ background: "rgba(0,0,0,0.04)", borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(0,0,0,0.06)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#3A3530", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "white", fontWeight: 700 }}>
                                {resp.profiles?.avatar_url
                                  ? <img src={resp.profiles.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  : getInitials(resp.profiles?.display_name ?? null)}
                              </div>
                              <div>
                                <span style={{ fontSize: 16, fontWeight: 600, color: "#1A1A1A" }}>{formatName(resp.profiles?.display_name ?? null)}</span>
                                <MatchBadge score={resp.match_score} />
                              </div>
                            </div>
                            <div style={{ borderRadius: 100, padding: "3px 10px", fontSize: 15, fontWeight: 600, background: isBuy ? "rgba(22,163,74,0.10)" : isNoBuy ? "rgba(192,57,43,0.10)" : "rgba(217,119,6,0.10)", color: isBuy ? "#16a34a" : isNoBuy ? "#c0392b" : "#d97706" }}>
                              {recommendationLabel(resp.recommendation)}
                            </div>
                          </div>
                          <p style={{ fontSize: 15, lineHeight: 1.6, color: "#5A4A42", marginBottom: 10 }}>{resp.reasoning}</p>
                          {resp.product_url && (
                            <a href={resp.product_url} target="_blank" rel="noopener noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: 7, maxWidth: "100%", padding: "7px 13px", marginBottom: 10, borderRadius: 100, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(0,0,0,0.02)", color: "#3A3530", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                              <ExternalLink style={{ width: 14, height: 14, flexShrink: 0, color: "#8C7A70" }} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prettyHost(resp.product_url)}</span>
                            </a>
                          )}
                          {resp.photo_url && (
                            <img src={resp.photo_url} alt="response photo" onClick={() => window.open(resp.photo_url!, "_blank")}
                              style={{ height: 120, width: 96, objectFit: "cover", objectPosition: "top", borderRadius: 10, display: "block", marginBottom: 10, cursor: "zoom-in" }} />
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <button
                              onClick={() => !isOwnResp && user && handleHelpfulVote(resp.id, "helpful")}
                              style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "5px 13px", borderRadius: 100,
                                border: `1.5px solid ${myVote === "helpful" ? "rgba(58,53,48,0.35)" : "rgba(0,0,0,0.15)"}`,
                                background: myVote === "helpful" ? "rgba(58,53,48,0.08)" : "white",
                                color: myVote === "helpful" ? "#1A1A1A" : "#5A4A42",
                                cursor: isOwnResp || !user ? "default" : "pointer",
                                fontSize: 15, fontWeight: 600,
                                transition: "all 0.15s",
                                opacity: isOwnResp ? 0.5 : 1,
                              }}
                            >
                              {myVote === "helpful" ? <Check style={{ width: 12, height: 12 }} /> : <ThumbsUp style={{ width: 12, height: 12 }} />}
                              <span>Helpful{counts.helpful > 0 ? ` (${counts.helpful})` : ""}</span>
                            </button>
                            {myVote === "helpful" && counts.helpful > 1 && (
                              <span style={{ fontSize: 15, color: "#8C7A70" }}>
                                You and {counts.helpful - 1} {counts.helpful - 1 === 1 ? "other" : "others"} found this helpful
                              </span>
                            )}
                            <span style={{ marginLeft: "auto", fontSize: 14, color: "#8C7A70" }}>{timeAgo(resp.created_at)}</span>
                          </div>
                        </div>
                      );
                    };
                    // Auto-show first 2 full comments; collapse the rest behind a toggle once there are 3+
                    const visible = showAllResponses ? sortedResponses : sortedResponses.slice(0, PREVIEW_COUNT);
                    const hiddenCount = sortedResponses.length - PREVIEW_COUNT;
                    return (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: sortedResponses.length > PREVIEW_COUNT ? 12 : 0 }}>
                          {visible.map(renderResponse)}
                        </div>
                        {sortedResponses.length > PREVIEW_COUNT && (
                          <button
                            onClick={() => setShowAllResponses(v => !v)}
                            style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          >
                            <MessageCircle style={{ width: 17, height: 17, color: "#3A3530" }} />
                            <span style={{ fontSize: 17, fontWeight: 600, color: "#1A1A1A", textDecoration: "underline", textDecorationColor: "rgba(0,0,0,0.2)", textUnderlineOffset: 3 }}>
                              {showAllResponses ? "Collapse" : `+ ${hiddenCount} more response${hiddenCount !== 1 ? "s" : ""}`}
                            </span>
                            <ArrowRight style={{ width: 15, height: 15, color: "#3A3530", transform: showAllResponses ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : null}

              {/* CTA row */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "auto", paddingTop: 12 }}>
                {!user ? (
                  <>
                    <button onClick={onSignIn} style={{ padding: "11px 20px", borderRadius: 6, background: "#1C1712", color: "#FDFAF6", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.22)", fontSize: 15, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Weigh in →
                    </button>
                    <span style={{ fontSize: 14, color: "#8C7A70", lineHeight: 1.4 }}>Share your take to help others like you.</span>
                  </>
                ) : isOwn ? (
                  <div style={{ width: "100%" }}>
                    {decision.status === "open" && !loggedOutcomeIds.has(decision.id) && (
                      snoozedOutcome ? (
                        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 15, fontWeight: 600, color: "#6E7A44", margin: "4px 0", lineHeight: 1.4 }}>
                          Sounds good — we'll circle back. ✦
                        </motion.p>
                      ) : (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", margin: "0 0 10px", lineHeight: 1.4 }}>
                            {hasTwoOptions
                              ? "Which did you go with?"
                              : weighInCount > 0
                              ? `${weighInCount} ${weighInCount === 1 ? "woman" : "women"} weighed in. Don't leave ${weighInCount === 1 ? "her" : "them"} hanging, spill.`
                              : "How'd it go?"}
                          </p>
                          {hasTwoOptions ? (
                            <>
                              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                <button onClick={() => { setOutcomeInitial("bought_it"); setOutcomeChosen("first"); setTrackingId(decision.id); }} style={{ flex: 1, minWidth: 0, padding: "11px 8px", borderRadius: 8, border: "none", background: "#1C1712", color: "#FDFAF6", fontSize: 13.5, fontWeight: 600, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{optAName}</button>
                                <button onClick={() => { setOutcomeInitial("bought_it"); setOutcomeChosen("second"); setTrackingId(decision.id); }} style={{ flex: 1, minWidth: 0, padding: "11px 8px", borderRadius: 8, border: "none", background: "#1C1712", color: "#FDFAF6", fontSize: 13.5, fontWeight: 600, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{optBName}</button>
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => { setOutcomeInitial("bought_it"); setOutcomeChosen("both"); setTrackingId(decision.id); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #1C1712", background: "transparent", color: "#1C1712", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Both</button>
                                <button onClick={() => { setOutcomeInitial("didnt_buy"); setOutcomeChosen(null); setTrackingId(decision.id); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #1C1712", background: "transparent", color: "#1C1712", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Neither</button>
                                <button onClick={() => { quickStillDeciding(decision.id); setSnoozedOutcome(true); }} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "transparent", color: "#8C7A70", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Still deciding</button>
                              </div>
                            </>
                          ) : (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => { setOutcomeInitial("bought_it"); setTrackingId(decision.id); }} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "none", background: "#1C1712", color: "#FDFAF6", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Bought it</button>
                              <button onClick={() => { setOutcomeInitial("didnt_buy"); setTrackingId(decision.id); }} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid #1C1712", background: "transparent", color: "#1C1712", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Passed</button>
                              <button onClick={() => { quickStillDeciding(decision.id); setSnoozedOutcome(true); }} style={{ flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "transparent", color: "#8C7A70", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Still deciding</button>
                            </div>
                          )}
                        </motion.div>
                      )
                    )}

                    {activeTab === "mine" && (
                      <button
                        onClick={() => { if (confirm("Remove this decision?")) handleDelete(decision.id); }}
                        style={{ display: "block", marginLeft: "auto", marginTop: 12, padding: "8px 16px", borderRadius: 100, background: "transparent", border: "1px solid rgba(0,0,0,0.10)", color: "#8C7A70", fontSize: 15, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <button onClick={() => startWeighIn(decision.id)} style={{ padding: "11px 20px", borderRadius: 6, background: "#1C1712", color: "#FDFAF6", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.22)", fontSize: 15, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Weigh in →
                    </button>
                    <span style={{ fontSize: 14, color: "#8C7A70", lineHeight: 1.4 }}>Share your take to help others like you.</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Feed;
