import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

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
}

type OutcomeType = "bought_it" | "didnt_buy" | "still_deciding";

type StepId =
  | "outcome"
  | "tipping_factor"
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

function parsePrimaryUncertainty(uncertaintyText: string | null): string {
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
    if (primary === "Between sizes" || primary === "Will it fit right") {
      return [...base, "size_bought", "fit_result", "size_recommendation", "complete"];
    }
    if (primary === "Other") {
      return [...base, "complete"];
    }
    return [...base, "outcome_detail", "complete"];
  }

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

function outcomeDetailQuestion(primary: string, outcome: OutcomeType): string {
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

function outcomeDetailOptions(primary: string): string[] {
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

const FIT_RESULT_OPTIONS = [
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

function completeMessage(outcome: OutcomeType): string {
  if (outcome === "bought_it") return "Got it. This helps us understand what you need.";
  if (outcome === "didnt_buy") return "Makes sense. We're using this to get you more relevant input.";
  return "Thanks. This helps us sharpen future matches.";
}

const OPTION_BASE: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "14px 18px",
  borderRadius: 12,
  background: "rgba(28,23,18,0.05)",
  border: "1.5px solid rgba(28,23,18,0.12)",
  fontSize: 16,
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
  fontSize: 16,
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
  fontSize: 16,
  fontFamily: "inherit",
  color: "#1C1712",
  resize: "none",
  boxSizing: "border-box",
  marginTop: 8,
  marginBottom: 4,
};

const QUESTION_STYLE: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "#1C1712",
  fontFamily: "Georgia, serif",
  marginBottom: 20,
  lineHeight: 1.3,
};

const OutcomeModal = ({ open, onClose, decision, onComplete, initialOutcome }: OutcomeModalProps) => {
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
  });

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      });
      // If pre-seeded, skip the "did you buy?" step and land on the first question.
      setCurrentStepIdx(seeded ? 1 : 0);
      setSaving(false);
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    }
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, [open]);

  const advance = () => setCurrentStepIdx((i) => i + 1);
  const goBack = () => setCurrentStepIdx((i) => Math.max(0, i - 1));

  const saveAndComplete = async (finalState: StepState) => {
    if (!user || !finalState.outcome) return;
    setSaving(true);

    const tf = finalState.tipping_factor === "Something else" ? null : finalState.tipping_factor;
    const tfOther = finalState.tipping_factor === "Something else" ? finalState.tipping_factor_other.trim() || null : null;
    // Save outcome_detail_other whenever the user typed something — not just for "Other".
    // Negative answers also show a textarea and that text must be preserved.
    const odOther = finalState.outcome_detail_other.trim() || null;
    const odValue = finalState.outcome_detail === "Other" ? null : finalState.outcome_detail;
    const fitNote = finalState.fit_result_note.trim() || null;

    await supabase.from("outcomes").upsert(
      {
        decision_id: decision.id,
        user_id: user.id,
        did_purchase: finalState.outcome === "bought_it",
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
      },
      { onConflict: "decision_id" }
    );

    if (finalState.outcome === "bought_it") {
      await supabase
        .from("decisions")
        .update({ status: "purchased" })
        .eq("id", decision.id);
    } else if (finalState.outcome === "didnt_buy") {
      await supabase
        .from("decisions")
        .update({ status: "closed" })
        .eq("id", decision.id);
    }

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
                fontSize: 15,
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
                    onClick={advance}
                  >
                    Continue →
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
                      fontSize: 20,
                      color: "#C49E64",
                      marginBottom: 16,
                    }}
                  >
                    ✓
                  </div>
                  <p
                    style={{
                      fontSize: 18,
                      color: "#1C1712",
                      fontFamily: "Georgia, serif",
                      lineHeight: 1.4,
                      maxWidth: 280,
                    }}
                  >
                    {completeMessage(state.outcome)}
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
