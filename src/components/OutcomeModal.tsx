import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeUrl, pullProduct, type PulledProduct } from "@/lib/productPull";

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
  return "Sounds good — we'll circle back.";
}


const OPTION_BASE: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "14px 18px",
  borderRadius: 12,
  background: "rgba(28,23,18,0.05)",
  border: "1.5px solid rgba(28,23,18,0.12)",
  fontSize: 13.5,
  color: "#1C1712",
  cursor: "pointer",
  marginBottom: 8,
  fontFamily: "inherit",
};

const OPTION_SELECTED: React.CSSProperties = {
  ...OPTION_BASE,
  background: "rgba(196,158,100,0.12)",
  borderColor: "#C49E64",
};

const CONTINUE_BTN: React.CSSProperties = {
  width: "100%",
  background: "#1C1712",
  color: "#FDFAF6",
  borderRadius: 100,
  padding: "14px",
  fontSize: 13.5,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  marginTop: 12,
  fontFamily: "inherit",
};

const TEXTAREA_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(196,158,100,0.4)",
  background: "white",
  fontSize: 13.5,
  fontFamily: "inherit",
  color: "#1C1712",
  resize: "none",
  boxSizing: "border-box",
  marginTop: 8,
  marginBottom: 4,
};

const QUESTION_STYLE: React.CSSProperties = {
  fontSize: 18.5,
  fontWeight: 700,
  color: "#1C1712",
  fontFamily: "Georgia, serif",
  marginBottom: 20,
  lineHeight: 1.3,
};

const OutcomeModal = ({ open, onClose, decision, onComplete, initialOutcome, initialChosenOption }: OutcomeModalProps) => {
  const { user } = useAuth();

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
      toast.error(`Couldn't close this decision — ${detail}`);
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
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }}
          onClick={onClose}
        />

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
            background: "#F5EFEA",
            borderRadius: "20px 20px 0 0",
            padding: "0 24px 40px",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: 48,
              height: 4,
              borderRadius: 100,
              background: "rgba(0,0,0,0.15)",
              margin: "14px auto 24px",
            }}
          />

          {currentStep !== "complete" && dotSteps.length > 1 && (
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28 }}>
              {dotSteps.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: i <= dotIndex ? "#C49E64" : "rgba(28,23,18,0.18)",
                    transition: "background 0.2s",
                  }}
                />
              ))}
            </div>
          )}

          {currentStep !== "outcome" && currentStep !== "complete" && (
            <button
              onClick={goBack}
              style={{
                background: "none",
                border: "none",
                padding: "0 0 20px",
                fontSize: 13,
                color: "#8C7A70",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "inherit",
              }}
            >
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
                  <p style={QUESTION_STYLE}>What did you end up doing?</p>
                  {(
                    [
                      ["bought_it", "Bought it"],
                      ["didnt_buy", "Didn't buy"],
                      ["still_deciding", "Still deciding"],
                    ] as [OutcomeType, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      style={state.outcome === value ? OPTION_SELECTED : OPTION_BASE}
                      onClick={() => handleOutcomeSelect(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {currentStep === "tipping_factor" && state.outcome && (
                <div>
                  <p style={QUESTION_STYLE}>
                    {state.outcome === "bought_it"
                      ? "What made you go for it?"
                      : state.outcome === "didnt_buy"
                      ? "What stopped you?"
                      : "What would help you decide?"}
                  </p>
                  {tippingFactorOptions(state.outcome, primary).map((opt) => (
                    <div key={opt}>
                      <button
                        style={state.tipping_factor === opt ? OPTION_SELECTED : OPTION_BASE}
                        onClick={() => handleTippingSelect(opt)}
                      >
                        {opt}
                      </button>
                      {opt === "Something else" && state.tipping_factor === "Something else" && (
                        <div>
                          <textarea
                            rows={3}
                            placeholder="Tell us more..."
                            value={state.tipping_factor_other}
                            onChange={(e) =>
                              setState((s) => ({ ...s, tipping_factor_other: e.target.value }))
                            }
                            style={TEXTAREA_STYLE}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  {state.tipping_factor === "Something else" && (
                    <button
                      style={CONTINUE_BTN}
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
                  <p style={QUESTION_STYLE}>Did you buy something else instead?</p>
                  <button
                    style={state.bought_alternative === true ? OPTION_SELECTED : OPTION_BASE}
                    onClick={() => setState((s) => ({ ...s, bought_alternative: true }))}
                  >
                    Yes, I bought something else
                  </button>
                  {state.bought_alternative === true && (
                    <div>
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
                        style={{ ...TEXTAREA_STYLE, resize: undefined }}
                      />

                      {altFetching && (
                        <p style={{ fontSize: 12, color: "#8C7A70", margin: "6px 2px 0" }}>Reading that link...</p>
                      )}

                      {/* What we pulled off the link — she sees the exact image
                          that will show up on her card before she commits. */}
                      {!altFetching && altPulled && (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "white", border: "1px solid rgba(196,158,100,0.4)", borderRadius: 10, padding: 10, marginTop: 8 }}>
                          {altPulled.image_url ? (
                            <img src={altPulled.image_url} alt="" style={{ width: 52, height: 64, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "#EDE8E2" }} />
                          ) : (
                            <div style={{ width: 52, height: 64, borderRadius: 6, flexShrink: 0, background: "#EDE8E2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#8C7A70", textAlign: "center", lineHeight: 1.2 }}>no image</div>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {altPulled.brand && <p style={{ fontSize: 13, fontWeight: 700, color: "#1C1712", margin: 0 }}>{altPulled.brand}</p>}
                            {altPulled.name && <p style={{ fontSize: 11.5, color: "#5A4A42", margin: "2px 0 0", lineHeight: 1.3 }}>{altPulled.name}</p>}
                            {altPulled.price && <p style={{ fontSize: 12, fontWeight: 600, color: "#1C1712", margin: "4px 0 0" }}>{altPulled.price.startsWith("$") ? altPulled.price : `$${altPulled.price}`}</p>}
                          </div>
                        </div>
                      )}

                      {!altFetching && altFailed && (
                        <p style={{ fontSize: 11.5, color: "#8C7A70", margin: "6px 2px 0", lineHeight: 1.4 }}>
                          Couldn't read that link, so there won't be an image. Your link still saves.
                        </p>
                      )}

                      <input
                        type="text"
                        placeholder="What is it? (optional) e.g. Reformation Cynthia dress"
                        value={state.alt_product_name}
                        onChange={(e) => setState((s) => ({ ...s, alt_product_name: e.target.value }))}
                        style={{ ...TEXTAREA_STYLE, resize: undefined, marginTop: 8 }}
                      />
                    </div>
                  )}
                  <button
                    style={state.bought_alternative === false ? OPTION_SELECTED : OPTION_BASE}
                    onClick={() => {
                      const next = { ...state, bought_alternative: false, alt_product_url: "", alt_product_name: "" };
                      setState(next);
                      saveAndComplete(next, null);
                    }}
                  >
                    No, I passed on it entirely
                  </button>
                  {state.bought_alternative === true && (
                    <button
                      style={CONTINUE_BTN}
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
                  <p style={QUESTION_STYLE}>What size did you buy?</p>
                  <input
                    type="text"
                    placeholder="e.g. Medium, Size 6, US 8..."
                    value={state.size_bought}
                    onChange={(e) => setState((s) => ({ ...s, size_bought: e.target.value }))}
                    style={{
                      ...TEXTAREA_STYLE,
                      resize: undefined,
                      marginBottom: 4,
                    }}
                  />
                  <button
                    style={CONTINUE_BTN}
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
                  <p style={QUESTION_STYLE}>How did it actually turn out?</p>
                  {FIT_RESULT_OPTIONS.map((opt) => (
                    <div key={opt}>
                      <button
                        style={state.fit_result === opt ? OPTION_SELECTED : OPTION_BASE}
                        onClick={() => handleFitResultSelect(opt)}
                      >
                        {opt}
                      </button>
                      {opt === "Not at all what I expected" &&
                        state.fit_result === "Not at all what I expected" && (
                          <div>
                            <textarea
                              rows={3}
                              placeholder="What happened? (optional)"
                              value={state.fit_result_note}
                              onChange={(e) =>
                                setState((s) => ({ ...s, fit_result_note: e.target.value }))
                              }
                              style={TEXTAREA_STYLE}
                            />
                          </div>
                        )}
                    </div>
                  ))}
                  {state.fit_result === "Not at all what I expected" && (
                    <button style={CONTINUE_BTN} onClick={advance}>
                      Continue →
                    </button>
                  )}
                </div>
              )}

              {currentStep === "size_recommendation" && (
                <div>
                  <p style={QUESTION_STYLE}>What would you recommend to your matches?</p>
                  {SIZE_RECOMMENDATION_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      style={state.size_recommendation === opt ? OPTION_SELECTED : OPTION_BASE}
                      onClick={() => handleSizeRecommendationSelect(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {currentStep === "outcome_detail" && state.outcome && (
                <div>
                  <p style={QUESTION_STYLE}>
                    {outcomeDetailQuestion(primary, state.outcome)}
                  </p>
                  {outcomeDetailOptions(primary).map((opt) => (
                    <div key={opt}>
                      <button
                        style={state.outcome_detail === opt ? OPTION_SELECTED : OPTION_BASE}
                        onClick={() => handleOutcomeDetailSelect(opt)}
                      >
                        {opt}
                      </button>
                      {state.outcome_detail === opt && outcomeDetailHasTextarea(primary, opt) && (
                        <div>
                          <textarea
                            rows={3}
                            placeholder={isNegativeAnswer(opt) ? "What didn't work? (optional)" : "Tell us more... (optional)"}
                            value={state.outcome_detail_other}
                            onChange={(e) =>
                              setState((s) => ({ ...s, outcome_detail_other: e.target.value }))
                            }
                            style={TEXTAREA_STYLE}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  {state.outcome_detail && outcomeDetailHasTextarea(primary, state.outcome_detail) && (
                    <button
                      style={CONTINUE_BTN}
                      disabled={saving}
                      onClick={() => saveAndComplete(state)}
                    >
                      {saving ? "Saving..." : "Continue →"}
                    </button>
                  )}
                </div>
              )}

              {currentStep === "complete" && state.outcome && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingTop: 24,
                    paddingBottom: 16,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "rgba(196,158,100,0.15)",
                      border: "1.5px solid #C49E64",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 17,
                      color: "#C49E64",
                      marginBottom: 16,
                    }}
                  >
                    ✓
                  </div>
                  <p
                    style={{
                      fontSize: 15.5,
                      color: "#1C1712",
                      fontFamily: "Georgia, serif",
                      lineHeight: 1.4,
                      maxWidth: 280,
                    }}
                  >
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
