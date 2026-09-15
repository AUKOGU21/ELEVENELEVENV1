import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeUrl, pullProduct, type PulledProduct } from "@/lib/productPull";
import { C, SANS, RADIUS, display, meta, strong, body } from "@/lib/design";
import { useIsMobile } from "@/hooks/use-mobile";

interface OutcomeModalProps {
  open: boolean;
  onClose: () => void;
  decision: {
    id: string;
    uncertainty_text: string | null;
  };
  onComplete: (outcome: OutcomeType) => void;
  // When opened from the "Bought it" / "Passed" buttons, pre-seed the outcome so
  // the flow jumps straight into the decision tree instead of re-asking it.
  initialOutcome?: OutcomeType | null;
  // For a two-option "deciding between" decision: which she chose ('first' |
  // 'second' | 'both'), recorded on the outcome so the card reflects the winner.
  initialChosenOption?: string | null;
}

type OutcomeType = "bought_it" | "didnt_buy" | "still_deciding";

type StepId =
  | "outcome"
  | "tipping_factor"
  | "bought_alternative"
  | "size_bought"
  | "fit_result"
  | "size_recommendation"
  | "outcome_detail"
  | "complete";

interface StepState {
  outcome: OutcomeType | null;
  tipping_factor: string | null;
  tipping_factor_other: string;
  size_bought: string;
  fit_result: string | null;
  fit_result_note: string;
  size_recommendation: string | null;
  outcome_detail: string | null;
  outcome_detail_other: string;
  // "Passed" flow: she skipped this item but bought something else instead.
  bought_alternative: boolean | null;
  alt_product_url: string;
  alt_product_name: string;
  // Why she went this way instead. Free text, optional, and the most useful
  // thing on the card for the next woman reading it.
  alt_reason: string;
}

const UNCERTAINTY_PRIORITY = [
  "Between sizes",
  "Will it fit right",
  "Will it flatter me",
  "How it will look on me",
  "Hard to tell from photos",
  "Worth the price",
  "Quality concerns",
  "Not sure about the color",
  "Other",
];

function normalizePrimary(raw: string): string {
  if (raw === "How it will look on me") return "Will it flatter me";
  return raw;
}

export function parsePrimaryUncertainty(uncertaintyText: string | null): string {
  if (!uncertaintyText) return "Other";
  const parts = uncertaintyText.split(",").map((s) => s.trim());
  for (const priority of UNCERTAINTY_PRIORITY) {
    if (parts.some((p) => p === priority)) {
      return normalizePrimary(priority);
    }
  }
  return "Other";
}

function buildSteps(outcome: OutcomeType | null, primary: string): StepId[] {
  if (!outcome) return ["outcome"];

  const base: StepId[] = ["outcome", "tipping_factor"];

  if (outcome === "bought_it") {
    // Purchase time captures only what gave her the confidence to buy (+ which size
    // she ordered, if between sizes). Fit / quality / recommend / confidence / photo
    // are captured later, once she's Received it (the on-card lifecycle flow).
    if (primary === "Between sizes" || primary === "Will it fit right") {
      return [...base, "size_bought", "complete"];
    }
    return [...base, "complete"];
  }

  if (outcome === "still_deciding") return ["outcome", "complete"];

  // Passing on the item isn't the end of the story — she often buys something
  // else instead, and that swap is the most useful signal we can capture.
  if (outcome === "didnt_buy") return [...base, "bought_alternative", "complete"];

  return [...base, "complete"];
}

function tippingFactorOptions(outcome: OutcomeType, primary: string): string[] {
  if (outcome === "bought_it") {
    if (primary === "Between sizes" || primary === "Will it fit right") {
      return [
        "I chose the size I order most often",
        "I got helpful feedback from people like me",
        "I took a chance",
        "Something else",
      ];
    }
    if (primary === "Will it flatter me") {
      return [
        "I liked how it looked on a body like mine",
        "I took the risk because I loved it",
        "Something else",
      ];
    }
    if (primary === "Hard to tell from photos") {
      return [
        "I got enough context to feel confident",
        "I took the risk",
        "Something else",
      ];
    }
    if (primary === "Worth the price") {
      return [
        "It felt worth the risk",
        "I loved it enough to justify it",
        "I got clarity from others that it was a good buy",
        "Something else",
      ];
    }
    if (primary === "Quality concerns") {
      return [
        "I trusted the brand",
        "I was okay with the risk",
        "I got enough context from others to move forward",
        "Something else",
      ];
    }
    if (primary === "Not sure about the color") {
      return [
        "The color looked right on other people like me",
        "I decided the color was close enough",
        "Something else",
      ];
    }
    return ["I felt confident enough", "I got useful feedback", "Something else"];
  }

  if (outcome === "didnt_buy") {
    if (primary === "Between sizes" || primary === "Will it fit right") {
      return [
        "I still wasn't sure which size would work",
        "I needed more personalized feedback",
        "Feedback from people like me changed my mind",
        "Something else",
      ];
    }
    if (primary === "Will it flatter me") {
      return [
        "I couldn't picture it on my body",
        "I needed more visual proof",
        "Feedback from people like me changed my mind",
        "Something else",
      ];
    }
    if (primary === "Hard to tell from photos") {
      return [
        "The photos were not enough",
        "I still could not picture it on me",
        "Feedback from people like me changed my mind",
        "Something else",
      ];
    }
    if (primary === "Worth the price") {
      return [
        "It didn't feel worth it",
        "I wanted more certainty before spending",
        "I found better value elsewhere",
        "Feedback from people like me changed my mind",
        "Something else",
      ];
    }
    if (primary === "Quality concerns") {
      return [
        "I did not trust the quality",
        "I wanted more proof it would hold up",
        "Feedback from people like me changed my mind",
        "Something else",
      ];
    }
    if (primary === "Not sure about the color") {
      return [
        "I just need to see it in real life",
        "I wasn't convinced the color would work on me",
        "Feedback from people like me changed my mind",
        "Something else",
      ];
    }
    return ["I wasn't confident enough", "Feedback from people like me changed my mind", "Something else"];
  }

  if (outcome === "still_deciding") {
    if (primary === "Between sizes" || primary === "Will it fit right") {
      return [
        "Seeing it on someone like me",
        "More opinions from people like me",
        "More confidence in the fit",
        "Something else",
      ];
    }
    if (primary === "Will it flatter me") {
      return [
        "Seeing it on someone like me",
        "More styling context",
        "More opinions from people like me",
        "A clearer sense of the silhouette",
        "Something else",
      ];
    }
    if (primary === "Hard to tell from photos") {
      return [
        "Real-life examples",
        "More opinions from people like me",
        "Seeing it on someone like me",
        "Something else",
      ];
    }
    if (primary === "Worth the price") {
      return [
        "Another opinion from someone like me",
        "A clearer sense of quality / value",
        "Something else",
      ];
    }
    if (primary === "Quality concerns") {
      return [
        "More proof on quality",
        "More opinions from people like me",
        "Something else",
      ];
    }
    if (primary === "Not sure about the color") {
      return [
        "Seeing the color in real life",
        "More opinions from people like me",
        "A clearer styling reference",
        "Something else",
      ];
    }
    return ["More opinions from people like me", "Something else"];
  }

  return ["Something else"];
}

export function outcomeDetailQuestion(primary: string, outcome: OutcomeType): string {
  if (primary === "Will it flatter me") {
    return "How did it actually look/feel on?";
  }
  if (primary === "Hard to tell from photos") {
    return "Did it look how you thought it would?";
  }
  if (primary === "Worth the price") {
    return "Did it feel worth it after receiving it?";
  }
  if (primary === "Quality concerns") {
    return "Did the quality match your expectations?";
  }
  if (primary === "Not sure about the color") {
    return "Did the color work in real life?";
  }
  return "How did it turn out?";
}

export function outcomeDetailOptions(primary: string): string[] {
  if (primary === "Will it flatter me") {
    return [
      "Better than expected",
      "As expected",
      "Nothing like I imagined",
    ];
  }
  if (primary === "Hard to tell from photos") {
    return [
      "Yes, matched my expectations",
      "Somewhat",
      "Not at all",
    ];
  }
  if (primary === "Worth the price") {
    return ["Yes", "No", "Other"];
  }
  if (primary === "Quality concerns") {
    return ["Yes, loved the quality", "Quality was okay", "No, I was disappointed"];
  }
  if (primary === "Not sure about the color") {
    return ["Yes, loved it", "It was okay", "No, not as expected"];
  }
  return ["Better than expected", "As expected", "Nothing like I imagined"];
}

function outcomeDetailHasOther(primary: string): boolean {
  return primary === "Worth the price";
}

// Returns true for any option that should show a textarea below it
function outcomeDetailHasTextarea(primary: string, opt: string): boolean {
  if (isNegativeAnswer(opt)) return true;
  if (opt === "Other" && outcomeDetailHasOther(primary)) return true;
  // "Somewhat" for "Hard to tell from photos" also gets a textarea
  if (primary === "Hard to tell from photos" && opt === "Somewhat") return true;
  return false;
}

function isNegativeAnswer(option: string): boolean {
  const lower = option.toLowerCase();
  return (
    lower === "no" ||
    lower === "not really" ||
    lower === "not at all" ||
    lower === "nothing like i imagined" ||
    lower === "no, i was disappointed" ||
    lower === "no, not as expected"
  );
}

export const FIT_RESULT_OPTIONS = [
  "Fit perfectly",
  "OK fit, but not perfect",
  "Not at all what I expected",
];

const SIZE_RECOMMENDATION_OPTIONS = [
  "Buy your true size",
  "Size up",
  "Size down",
  "Don't buy",
];

function completeMessage(outcome: OutcomeType, boughtAlternative?: boolean | null): string {
  if (outcome === "bought_it") return "Got it. This helps us understand what you need.";
  if (outcome === "didnt_buy") {
    if (boughtAlternative) return "Good to know what you went with instead. That's the useful part.";
    return "Makes sense. We're using this to get you more relevant input.";
  }
  return "Sounds good. We'll circle back.";
}


// ── Editorial styles ─────────────────────────────────────────────────────────
// Options are full-width rows between thin rules, not boxes. The question is
// the heading, in Anton. Burgundy is the only accent.

// Square, filled burgundy. Matches DecisionView's squareBtn.
const continueBtn = (saving: boolean): React.CSSProperties => ({
  ...meta(12, "#FFFFFF"),
  fontWeight: 700,
  letterSpacing: "0.16em",
  width: "100%",
  background: C.burgundy,
  border: `1px solid ${C.burgundy}`,
  borderRadius: RADIUS,
  padding: "15px 18px",
  marginTop: 20,
  cursor: saving ? "default" : "pointer",
  opacity: saving ? 0.6 : 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
});

// Matches DecisionView's fieldStyle.
const TEXTAREA_STYLE: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  borderRadius: RADIUS,
  border: `1px solid ${C.rule}`,
  background: "#FFFFFF",
  padding: "11px 13px",
  fontFamily: SANS,
  fontSize: 14,
  lineHeight: 1.5,
  color: C.ink,
  outline: "none",
  resize: "none",
  marginTop: 10,
};

const questionStyle = (isMobile: boolean): React.CSSProperties => ({
  ...display(isMobile ? 26 : 30),
  lineHeight: 1,
  marginBottom: isMobile ? 20 : 24,
});

const BACK_LINK: React.CSSProperties = {
  ...meta(11, C.muted),
  fontWeight: 700,
  background: "none",
  border: "none",
  padding: 0,
  marginBottom: 20,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};

// Closes the bottom of an option list; each row carries its own top rule.
const OPTION_LIST: React.CSSProperties = { borderBottom: `1px solid ${C.rule}` };

// Space under an inline field that opens inside the option list.
const INLINE_FIELD_WRAP: React.CSSProperties = { paddingBottom: 16 };

function ThinArrow() {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden style={{ flexShrink: 0, display: "block" }}>
      <path d="M0 5h16.5M12.5 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

// One option: a full-width row between rules. Burgundy on hover, press, or
// when it's the current answer.
function OptionRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  const [hot, setHot] = useState(false);
  const on = selected || hot;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onPointerDown={() => setHot(true)}
      onPointerCancel={() => setHot(false)}
      onBlur={() => setHot(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "none",
        borderTop: `1px solid ${C.rule}`,
        borderRadius: 0,
        padding: "17px 0",
        cursor: "pointer",
        fontFamily: SANS,
        fontSize: 15,
        fontWeight: 400,
        lineHeight: 1.4,
        color: on ? C.burgundy : C.ink,
        transition: "color 0.15s",
      }}
    >
      <span>{label}</span>
      <span style={{ display: "flex", transform: on ? "translateX(3px)" : "none", transition: "transform 0.15s" }}>
        <ThinArrow />
      </span>
    </button>
  );
}

const OutcomeModal = ({ open, onClose, decision, onComplete, initialOutcome, initialChosenOption }: OutcomeModalProps) => {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [state, setState] = useState<StepState>({
    outcome: null,
    tipping_factor: null,
    tipping_factor_other: "",
    size_bought: "",
    fit_result: null,
    fit_result_note: "",
    size_recommendation: null,
    outcome_detail: null,
    outcome_detail_other: "",
    bought_alternative: null,
    alt_product_url: "",
    alt_product_name: "",
    alt_reason: "",
  });

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The alternative she bought, read off the pasted link by extract-product —
  // same pull PostDecision uses, so it lands in the swipe like any other product.
  const [altFetching, setAltFetching] = useState(false);
  const [altPulled, setAltPulled] = useState<PulledProduct | null>(null);
  const [altFailed, setAltFailed] = useState(false);
  const altFetchedUrl = useRef<string | null>(null);

  // True once the outcome row exists, so a slow link read can patch it after
  // she's already moved on instead of making her wait on the modal.
  const savedRef = useRef(false);

  const pullPulledProduct = async (rawUrl: string): Promise<PulledProduct | null> => {
    const url = normalizeUrl(rawUrl);
    if (!url) return null;
    // Don't re-read the same link on every blur.
    if (altFetchedUrl.current === url) return altPulled;
    altFetchedUrl.current = url;
    setAltFetching(true);
    setAltFailed(false);
    try {
      const pulled = await pullProduct(url);
      // Nothing usable came back — treat it as a failure so she gets the note.
      if (!pulled) {
        setAltFailed(true);
        setAltPulled(null);
        return null;
      }
      setAltPulled(pulled);
      // Prefill the name only if she hasn't typed her own.
      setState((s) => ({ ...s, alt_product_name: s.alt_product_name || pulled.name || "" }));
      // Reading a link takes ~10s, so she may have hit Continue already. Patch
      // the saved row; the feed's realtime subscription picks the image up.
      if (savedRef.current) {
        await supabase
          .from("outcomes")
          .update({
            alt_product_image_url: pulled.image_url,
            alt_brand_name: pulled.brand,
            alt_price_note: pulled.price,
          })
          .eq("decision_id", decision.id);
      }
      return pulled;
    } catch {
      setAltFailed(true);
      setAltPulled(null);
      return null;
    } finally {
      setAltFetching(false);
    }
  };

  const primary = parsePrimaryUncertainty(decision.uncertainty_text);
  const steps = buildSteps(state.outcome, primary);
  const currentStep: StepId = steps[currentStepIdx] ?? "outcome";

  useEffect(() => {
    if (open) {
      const seeded = initialOutcome && initialOutcome !== "still_deciding" ? initialOutcome : null;
      setState({
        outcome: seeded,
        tipping_factor: null,
        tipping_factor_other: "",
        size_bought: "",
        fit_result: null,
        fit_result_note: "",
        size_recommendation: null,
        outcome_detail: null,
        outcome_detail_other: "",
        bought_alternative: null,
        alt_product_url: "",
        alt_product_name: "",
        alt_reason: "",
      });
      // If pre-seeded, skip the "did you buy?" step and land on the first question.
      setCurrentStepIdx(seeded ? 1 : 0);
      setSaving(false);
      setAltFetching(false);
      setAltPulled(null);
      setAltFailed(false);
      altFetchedUrl.current = null;
      savedRef.current = false;
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    }
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, [open]);

  const advance = () => setCurrentStepIdx((i) => i + 1);
  const goBack = () => setCurrentStepIdx((i) => Math.max(0, i - 1));

  const saveAndComplete = async (finalState: StepState, pulledOverride?: PulledProduct | null) => {
    if (!user || !finalState.outcome) return;
    setSaving(true);

    const tf = finalState.tipping_factor === "Something else" ? null : finalState.tipping_factor;
    const tfOther = finalState.tipping_factor === "Something else" ? finalState.tipping_factor_other.trim() || null : null;
    // Save outcome_detail_other whenever the user typed something — not just for "Other".
    // Negative answers also show a textarea and that text must be preserved.
    const odOther = finalState.outcome_detail_other.trim() || null;
    const odValue = finalState.outcome_detail === "Other" ? null : finalState.outcome_detail;
    const fitNote = finalState.fit_result_note.trim() || null;

    // She passed on this item but bought something else — keep the swap on the
    // outcome so the closed card can show what she actually went with.
    const boughtAlt = finalState.outcome === "didnt_buy" ? finalState.bought_alternative : null;
    const pulled = pulledOverride !== undefined ? pulledOverride : altPulled;
    const altUrl = boughtAlt ? normalizeUrl(finalState.alt_product_url) : null;
    const altName = boughtAlt ? finalState.alt_product_name.trim() || pulled?.name || null : null;
    const altImage = boughtAlt ? pulled?.image_url ?? null : null;
    const altBrand = boughtAlt ? pulled?.brand ?? null : null;
    const altPrice = boughtAlt ? pulled?.price ?? null : null;
    const altReason = boughtAlt ? finalState.alt_reason.trim() || null : null;

    // Persist the outcome. .select() lets us distinguish a real write from a
    // silent no-op: an RLS-filtered write returns NO error but ALSO no rows, so
    // checking only `error` would let a blocked save look successful.
    const { data: outcomeRows, error: outcomeErr } = await supabase
      .from("outcomes")
      .upsert(
        {
          decision_id: decision.id,
          user_id: user.id,
          did_purchase: finalState.outcome === "bought_it",
          chosen_option: initialChosenOption ?? null,
          outcome_type: finalState.outcome,
          primary_uncertainty: primary,
          tipping_factor: tf,
          tipping_factor_other: tfOther,
          size_bought: finalState.size_bought || null,
          fit_result: finalState.fit_result,
          fit_result_note: fitNote,
          size_recommendation: finalState.size_recommendation,
          outcome_detail: odValue,
          outcome_detail_other: odOther,
          bought_alternative: boughtAlt,
          alt_product_url: altUrl,
          alt_product_name: altName,
          alt_product_image_url: altImage,
          alt_brand_name: altBrand,
          alt_price_note: altPrice,
          alt_reason: altReason,
        },
        { onConflict: "decision_id" }
      )
      .select();

    let statusErr: { message: string } | null = null;
    let statusRows: unknown[] | null = null;
    if (finalState.outcome === "bought_it" || finalState.outcome === "didnt_buy") {
      const newStatus = finalState.outcome === "bought_it" ? "purchased" : "closed";
      const res = await supabase
        .from("decisions")
        .update({ status: newStatus })
        .eq("id", decision.id)
        .select();
      statusErr = res.error;
      statusRows = res.data;
    }

    // A save "failed" if it errored, or if it wrote zero rows (RLS/ownership
    // blocked it). Surface it instead of faking success — otherwise the card
    // optimistically flips to closed and then reverts on the next fetch.
    const outcomeBlocked = !outcomeErr && (!outcomeRows || outcomeRows.length === 0);
    const statusBlocked =
      (finalState.outcome === "bought_it" || finalState.outcome === "didnt_buy") &&
      !statusErr && (!statusRows || statusRows.length === 0);

    if (outcomeErr || statusErr || outcomeBlocked || statusBlocked) {
      console.error("Outcome save failed:", { outcomeErr, statusErr, outcomeBlocked, statusBlocked });
      setSaving(false);
      const detail = outcomeErr?.message || statusErr?.message
        || "the change didn't save (you may not have permission on this post)";
      toast.error(`Couldn't close this decision: ${detail}`);
      return; // do NOT advance to the success step or call onComplete
    }

    savedRef.current = true;

    // Close the loop: email everyone who weighed in (fire-and-forget; the
    // function skips if there were no weigh-ins and never blocks the UI).
    supabase.functions
      .invoke("notify-outcome", { body: { decision_id: decision.id } })
      .catch((e) => console.warn("outcome notify failed:", e));

    setSaving(false);
    setCurrentStepIdx(steps.length - 1);
    onComplete(finalState.outcome!);

    completeTimerRef.current = setTimeout(() => {
      onClose();
    }, 4000);
  };

  const handleOutcomeSelect = (outcome: OutcomeType) => {
    const next = { ...state, outcome };
    setState(next);
    // Still deciding is a paused state — skip the follow-up questions, just note it.
    if (outcome === "still_deciding") {
      saveAndComplete(next);
      return;
    }
    const nextSteps = buildSteps(outcome, primary);
    if (nextSteps.length > 1) {
      setCurrentStepIdx(1);
    } else {
      saveAndComplete(next);
    }
  };

  const handleTippingSelect = (option: string) => {
    const next = { ...state, tipping_factor: option };
    setState(next);
    if (option !== "Something else") {
      const nextSteps = buildSteps(state.outcome, primary);
      const nextIdx = currentStepIdx + 1;
      if (nextSteps[nextIdx] === "complete") {
        saveAndComplete(next);
      } else {
        setCurrentStepIdx(nextIdx);
      }
    }
  };

  const handleFitResultSelect = (option: string) => {
    const next = { ...state, fit_result: option };
    setState(next);
    if (option !== "Not at all what I expected") {
      advance();
    }
  };

  const handleOutcomeDetailSelect = (option: string) => {
    const next = { ...state, outcome_detail: option, outcome_detail_other: "" };
    setState(next);
    // If this option shows a textarea, stay on step so user can type
    if (outcomeDetailHasTextarea(primary, option)) {
      return;
    }
    const nextSteps = buildSteps(state.outcome, primary);
    const nextIdx = currentStepIdx + 1;
    if (nextSteps[nextIdx] === "complete") {
      saveAndComplete(next);
    } else {
      setCurrentStepIdx(nextIdx);
    }
  };

  const handleSizeRecommendationSelect = (option: string) => {
    const next = { ...state, size_recommendation: option };
    setState(next);
    const nextSteps = buildSteps(state.outcome, primary);
    const nextIdx = currentStepIdx + 1;
    if (nextSteps[nextIdx] === "complete") {
      saveAndComplete(next);
    } else {
      setCurrentStepIdx(nextIdx);
    }
  };

  const dotSteps = steps.filter((s) => s !== "complete");
  const dotIndex = currentStep === "complete" ? dotSteps.length : currentStepIdx;

  if (!open) return null;

  return (
    <AnimatePresence>
      <div style={{ position: "fixed", inset: 0, zIndex: 70 }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "absolute", inset: 0, background: C.scrim }}
          onClick={onClose}
        />

        {/* The sheet: full width on phones; on wide screens ~680px, centred,
            still anchored to the bottom. */}
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 280 }}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            width: "100%",
            maxWidth: 680,
            margin: "0 auto",
            boxSizing: "border-box",
            background: C.paper,
            color: C.ink,
            fontFamily: SANS,
            borderRadius: `${RADIUS}px ${RADIUS}px 0 0`,
            padding: isMobile ? "22px 20px 0" : "30px 40px 0",
            paddingBottom: `calc(${isMobile ? 36 : 44}px + env(safe-area-inset-bottom, 0px))`,
            maxHeight: "90vh",
            overflowY: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {currentStep !== "complete" && dotSteps.length > 1 && (
            <div style={{ display: "flex", gap: 4, marginBottom: isMobile ? 22 : 28 }} aria-hidden>
              {dotSteps.map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 2,
                    background: i <= dotIndex ? C.burgundy : C.rule,
                    transition: "background 0.2s",
                  }}
                />
              ))}
            </div>
          )}

          {currentStep !== "outcome" && currentStep !== "complete" && (
            <button onClick={goBack} style={BACK_LINK}>
              ← Back
            </button>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {currentStep === "outcome" && (
                <div>
                  <p style={questionStyle(isMobile)}>What did you end up doing?</p>
                  <div style={OPTION_LIST}>
                    {(
                      [
                        ["bought_it", "Bought it"],
                        ["didnt_buy", "Didn't buy"],
                        ["still_deciding", "Still deciding"],
                      ] as [OutcomeType, string][]
                    ).map(([value, label]) => (
                      <OptionRow
                        key={value}
                        label={label}
                        selected={state.outcome === value}
                        onClick={() => handleOutcomeSelect(value)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {currentStep === "tipping_factor" && state.outcome && (
                <div>
                  <p style={questionStyle(isMobile)}>
                    {state.outcome === "bought_it"
                      ? "What made you go for it?"
                      : state.outcome === "didnt_buy"
                      ? "What stopped you?"
                      : "What would help you decide?"}
                  </p>
                  <div style={OPTION_LIST}>
                    {tippingFactorOptions(state.outcome, primary).map((opt) => (
                      <div key={opt}>
                        <OptionRow
                          label={opt}
                          selected={state.tipping_factor === opt}
                          onClick={() => handleTippingSelect(opt)}
                        />
                        {opt === "Something else" && state.tipping_factor === "Something else" && (
                          <div style={INLINE_FIELD_WRAP}>
                            <textarea
                              rows={3}
                              placeholder="Tell us more..."
                              value={state.tipping_factor_other}
                              onChange={(e) =>
                                setState((s) => ({ ...s, tipping_factor_other: e.target.value }))
                              }
                              style={{ ...TEXTAREA_STYLE, marginTop: 0 }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {state.tipping_factor === "Something else" && (
                    <button
                      style={continueBtn(saving)}
                      disabled={saving}
                      onClick={() => {
                        const nextSteps = buildSteps(state.outcome, primary);
                        const nextIdx = currentStepIdx + 1;
                        if (nextSteps[nextIdx] === "complete") {
                          saveAndComplete(state);
                        } else {
                          advance();
                        }
                      }}
                    >
                      {saving ? "Saving..." : "Continue →"}
                    </button>
                  )}
                </div>
              )}

              {currentStep === "bought_alternative" && (
                <div>
                  <p style={questionStyle(isMobile)}>Did you buy something else instead?</p>
                  <div style={OPTION_LIST}>
                  <OptionRow
                    label="Yes, I bought something else"
                    selected={state.bought_alternative === true}
                    onClick={() => setState((s) => ({ ...s, bought_alternative: true }))}
                  />
                  {state.bought_alternative === true && (
                    <div style={{ paddingBottom: 20 }}>
                      <input
                        type="url"
                        inputMode="url"
                        autoCapitalize="none"
                        placeholder="Paste the link to what you bought"
                        value={state.alt_product_url}
                        onChange={(e) => setState((s) => ({ ...s, alt_product_url: e.target.value }))}
                        onBlur={(e) => pullPulledProduct(e.target.value)}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData("text");
                          if (pasted) setTimeout(() => pullPulledProduct(pasted), 0);
                        }}
                        style={{ ...TEXTAREA_STYLE, resize: undefined, marginTop: 0 }}
                      />

                      {altFetching && (
                        <p style={{ ...meta(10.5, C.muted), marginTop: 10 }}>Reading that link...</p>
                      )}

                      {/* What we pulled off the link: she sees the exact image
                          that will show up on her card before she commits. */}
                      {!altFetching && altPulled && (
                        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
                          {altPulled.image_url ? (
                            <img src={altPulled.image_url} alt="" style={{ width: 56, height: 72, objectFit: "cover", borderRadius: RADIUS, flexShrink: 0, background: C.well, display: "block" }} />
                          ) : (
                            <div style={{ ...meta(8.5, C.muted), width: 56, height: 72, borderRadius: RADIUS, flexShrink: 0, background: C.well, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", lineHeight: 1.3 }}>no image</div>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {altPulled.brand && <p style={{ ...strong(13), textTransform: "uppercase", letterSpacing: "0.05em" }}>{altPulled.brand}</p>}
                            {altPulled.name && <p style={{ ...body(13, C.inkSoft), lineHeight: 1.35, marginTop: 3 }}>{altPulled.name}</p>}
                            {altPulled.price && <p style={{ ...strong(13), marginTop: 5 }}>{altPulled.price.startsWith("$") ? altPulled.price : `$${altPulled.price}`}</p>}
                          </div>
                        </div>
                      )}

                      {!altFetching && altFailed && (
                        <p style={{ ...body(12, C.muted), lineHeight: 1.45, marginTop: 8 }}>
                          Couldn't read that link, so there won't be an image. Your link still saves.
                        </p>
                      )}

                      <input
                        type="text"
                        placeholder="What is it? (optional) e.g. Reformation Cynthia dress"
                        value={state.alt_product_name}
                        onChange={(e) => setState((s) => ({ ...s, alt_product_name: e.target.value }))}
                        style={{ ...TEXTAREA_STYLE, resize: undefined, marginTop: 12 }}
                      />
                      <p style={{ ...meta(11, C.ink), fontWeight: 700, marginTop: 22 }}>Why this one instead?</p>
                      <p style={{ ...body(12.5, C.muted), lineHeight: 1.45, marginTop: 5 }}>
                        Optional, and the part women like you will actually read. What made you switch?
                      </p>
                      <textarea
                        rows={3}
                        placeholder="e.g. tried the other pair on and the rise was all wrong, these sit better on me"
                        value={state.alt_reason}
                        onChange={(e) => setState((s) => ({ ...s, alt_reason: e.target.value }))}
                        style={TEXTAREA_STYLE}
                      />
                    </div>
                  )}
                  <OptionRow
                    label="No, I passed on it entirely"
                    selected={state.bought_alternative === false}
                    onClick={() => {
                      const next = { ...state, bought_alternative: false, alt_product_url: "", alt_product_name: "", alt_reason: "" };
                      setState(next);
                      saveAndComplete(next, null);
                    }}
                  />
                  </div>
                  {state.bought_alternative === true && (
                    <button
                      style={continueBtn(saving)}
                      disabled={saving}
                      onClick={() => {
                        // Never make her wait on the link read. Start it if it
                        // hasn't run (fast typer, or no blur on mobile) and save
                        // now — whatever comes back patches the row after.
                        if (!altPulled && !altFetching) void pullPulledProduct(state.alt_product_url);
                        saveAndComplete(state, altPulled);
                      }}
                    >
                      {saving ? "Saving..." : "Continue →"}
                    </button>
                  )}
                </div>
              )}

              {currentStep === "size_bought" && (
                <div>
                  <p style={questionStyle(isMobile)}>What size did you buy?</p>
                  <input
                    type="text"
                    placeholder="e.g. Medium, Size 6, US 8..."
                    value={state.size_bought}
                    onChange={(e) => setState((s) => ({ ...s, size_bought: e.target.value }))}
                    style={{
                      ...TEXTAREA_STYLE,
                      resize: undefined,
                      marginTop: 0,
                    }}
                  />
                  <button
                    style={continueBtn(saving)}
                    disabled={saving}
                    onClick={() => {
                      const nextSteps = buildSteps(state.outcome, primary);
                      const nextIdx = currentStepIdx + 1;
                      if (nextSteps[nextIdx] === "complete") {
                        saveAndComplete(state);
                      } else {
                        advance();
                      }
                    }}
                  >
                    {saving ? "Saving..." : "Continue →"}
                  </button>
                </div>
              )}

              {currentStep === "fit_result" && (
                <div>
                  <p style={questionStyle(isMobile)}>How did it actually turn out?</p>
                  <div style={OPTION_LIST}>
                    {FIT_RESULT_OPTIONS.map((opt) => (
                      <div key={opt}>
                        <OptionRow
                          label={opt}
                          selected={state.fit_result === opt}
                          onClick={() => handleFitResultSelect(opt)}
                        />
                        {opt === "Not at all what I expected" &&
                          state.fit_result === "Not at all what I expected" && (
                            <div style={INLINE_FIELD_WRAP}>
                              <textarea
                                rows={3}
                                placeholder="What happened? (optional)"
                                value={state.fit_result_note}
                                onChange={(e) =>
                                  setState((s) => ({ ...s, fit_result_note: e.target.value }))
                                }
                                style={{ ...TEXTAREA_STYLE, marginTop: 0 }}
                              />
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                  {state.fit_result === "Not at all what I expected" && (
                    <button style={continueBtn(false)} onClick={advance}>
                      Continue →
                    </button>
                  )}
                </div>
              )}

              {currentStep === "size_recommendation" && (
                <div>
                  <p style={questionStyle(isMobile)}>What would you recommend to your matches?</p>
                  <div style={OPTION_LIST}>
                    {SIZE_RECOMMENDATION_OPTIONS.map((opt) => (
                      <OptionRow
                        key={opt}
                        label={opt}
                        selected={state.size_recommendation === opt}
                        onClick={() => handleSizeRecommendationSelect(opt)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {currentStep === "outcome_detail" && state.outcome && (
                <div>
                  <p style={questionStyle(isMobile)}>
                    {outcomeDetailQuestion(primary, state.outcome)}
                  </p>
                  <div style={OPTION_LIST}>
                    {outcomeDetailOptions(primary).map((opt) => (
                      <div key={opt}>
                        <OptionRow
                          label={opt}
                          selected={state.outcome_detail === opt}
                          onClick={() => handleOutcomeDetailSelect(opt)}
                        />
                        {state.outcome_detail === opt && outcomeDetailHasTextarea(primary, opt) && (
                          <div style={INLINE_FIELD_WRAP}>
                            <textarea
                              rows={3}
                              placeholder={isNegativeAnswer(opt) ? "What didn't work? (optional)" : "Tell us more... (optional)"}
                              value={state.outcome_detail_other}
                              onChange={(e) =>
                                setState((s) => ({ ...s, outcome_detail_other: e.target.value }))
                              }
                              style={{ ...TEXTAREA_STYLE, marginTop: 0 }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {state.outcome_detail && outcomeDetailHasTextarea(primary, state.outcome_detail) && (
                    <button
                      style={continueBtn(saving)}
                      disabled={saving}
                      onClick={() => saveAndComplete(state)}
                    >
                      {saving ? "Saving..." : "Continue →"}
                    </button>
                  )}
                </div>
              )}

              {currentStep === "complete" && state.outcome && (
                <div style={{ padding: isMobile ? "10px 0 8px" : "14px 0 10px" }}>
                  {/* A thin burgundy check, drawn, not a badge. */}
                  <svg
                    width="34"
                    height="26"
                    viewBox="0 0 34 26"
                    aria-hidden
                    style={{ display: "block", marginBottom: 18 }}
                  >
                    <path
                      d="M1.5 13.5 L11.5 23.5 L32.5 2.5"
                      fill="none"
                      stroke={C.burgundy}
                      strokeWidth="1.5"
                    />
                  </svg>
                  <p style={{ ...body(isMobile ? 16 : 17, C.ink), lineHeight: 1.45, maxWidth: "34ch" }}>
                    {completeMessage(state.outcome, state.bought_alternative)}
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default OutcomeModal;
