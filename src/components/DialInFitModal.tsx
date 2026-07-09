import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ArrowRight } from "lucide-react";
import { FIT_CATEGORIES } from "@/components/onboarding/OnboardingData";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const doneKey = (userId: string) => `eleven_fit_prompt_done_${userId}`;
const snoozeKey = (userId: string) => `eleven_fit_prompt_snooze_${userId}`;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // stay quiet for 2 weeks after a skip/dismiss

// Show the fit prompt until the user saves their fit once (then never again), and
// stay quiet for a while after they skip or dismiss it so it doesn't nag on every action.
export function shouldShowFitPrompt(userId: string): boolean {
  if (localStorage.getItem(doneKey(userId))) return false;
  const snoozed = localStorage.getItem(snoozeKey(userId));
  if (snoozed && Date.now() - Number(snoozed) < SNOOZE_MS) return false;
  return true;
}

export function markFitPromptDone(userId: string): void {
  localStorage.setItem(doneKey(userId), "1");
}

// Skipped or closed without saving → don't auto-prompt again for SNOOZE_MS.
export function snoozeFitPrompt(userId: string): void {
  localStorage.setItem(snoozeKey(userId), String(Date.now()));
}

interface Props {
  open: boolean;
  onClose: () => void;
  variant?: "weigh_in" | "post_decision";
}

export function DialInFitModal({ open, onClose, variant = "weigh_in" }: Props) {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Holds non-answer meta keys from fit_details (e.g. `_fit_photos`) so saving answers doesn't wipe them
  const metaRef = useRef<Record<string, unknown>>({});

  // Closing without saving snoozes the prompt so it stops reappearing on every action.
  const handleDismiss = () => { if (user) snoozeFitPrompt(user.id); onClose(); };

  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from("profiles")
      .select("fit_details")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const fd = (data?.fit_details ?? {}) as Record<string, unknown>;
        // Preserve underscore-prefixed meta (fit photos) untouched
        metaRef.current = Object.fromEntries(Object.entries(fd).filter(([k]) => k.startsWith("_")));
        // Only string answers belong in the selectable state
        setAnswers(
          Object.fromEntries(
            Object.entries(fd).filter(([k, v]) => typeof v === "string" && !k.startsWith("_"))
          ) as Record<string, string>
        );
      });
  }, [open, user]);

  const select = (category: string, option: string) =>
    setAnswers(prev => ({ ...prev, [category]: prev[category] === option ? "" : option }));

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    const filtered = Object.fromEntries(
      Object.entries(answers).filter(([k, v]) =>
        typeof v === "string" && v && !k.startsWith("_") &&
        !v.toLowerCase().includes("average") && !v.toLowerCase().includes("proportional")
      )
    );
    // Merge back the preserved meta (e.g. _fit_photos) so saving answers never wipes uploaded photos
    const merged = { ...metaRef.current, ...filtered };
    try {
      // Timeout guard so a hung request can never leave the button stuck on "Saving…"
      const { error } = await Promise.race([
        supabase.from("profiles").update({ fit_details: merged }).eq("id", user.id),
        new Promise<{ error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error("save timed out")), 10000)
        ),
      ]);
      if (error) throw error;
      markFitPromptDone(user.id);   // saved successfully → never prompt again
      onClose();
    } catch (err) {
      console.error("DialInFit save failed:", err);
      // leave the modal open and re-enable the button so the user can retry or close
    } finally {
      setSaving(false);
    }
  };

  const filledCount = Object.values(answers).filter(Boolean).length;

  const heading =
    variant === "post_decision"
      ? "You're one step closer to the right call."
      : "You're building better context for everyone.";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="fit-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px",
          }}
        >
          <motion.div
            key="fit-card"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#F5EFEA",
              borderRadius: 20,
              position: "relative",
              width: "100%",
              maxWidth: 520,
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              padding: "28px 20px 32px",
            }}
          >
            {/* Close */}
            <button
              onClick={handleDismiss}
              style={{
                position: "absolute", top: 18, right: 20,
                width: 32, height: 32, borderRadius: "50%",
                border: "1px solid rgba(28,23,18,0.15)",
                background: "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X style={{ width: 15, height: 15, color: "#8C7A70" }} />
            </button>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#1C1712",
                  lineHeight: 1.25,
                  marginBottom: 10,
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  letterSpacing: "-0.01em",
                }}
              >
                {heading}
              </h2>
              <p
                style={{
                  fontSize: 22,
                  fontStyle: "italic",
                  color: "#C49E64",
                  marginBottom: 10,
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  lineHeight: 1.3,
                }}
              >
                Let's dial in your fit.
              </p>
              <p style={{ fontSize: 14, color: "#8C7A70", lineHeight: 1.5 }}>
                Make your matches more precise in seconds.
              </p>
            </div>

            {/* Fit categories */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {FIT_CATEGORIES.map(cat => (
                <div key={cat.label}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#1C1712",
                      marginBottom: 8,
                    }}
                  >
                    {cat.label}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                    {cat.options.map(opt => {
                      const active = answers[cat.label] === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => select(cat.label, opt)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 999,
                            border: `1.5px solid ${active ? "#C49E64" : "rgba(28,23,18,0.18)"}`,
                            background: active ? "rgba(196,158,100,0.10)" : "transparent",
                            color: active ? "#1C1712" : "#5A4F47",
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 5,
                            transition: "all 0.15s",
                          }}
                        >
                          {active && (
                            <Check style={{ width: 12, height: 12, color: "#C49E64", flexShrink: 0 }} />
                          )}
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ marginTop: 32 }}>
              <button
                onClick={handleSave}
                disabled={filledCount === 0 || saving}
                style={{
                  width: "100%",
                  padding: "16px 24px",
                  borderRadius: 999,
                  background: "#1C1712",
                  color: "#FDFAF6",
                  border: "none",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: filledCount === 0 ? "default" : "pointer",
                  opacity: filledCount === 0 ? 0.35 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transition: "opacity 0.2s",
                  letterSpacing: "0.01em",
                }}
              >
                {saving ? "Saving…" : "Improve my matches"}
                {!saving && <ArrowRight style={{ width: 16, height: 16 }} />}
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  width: "100%",
                  marginTop: 14,
                  background: "transparent",
                  border: "none",
                  fontSize: 14,
                  color: "#8C7A70",
                  cursor: "pointer",
                  padding: "8px 0",
                  textAlign: "center",
                }}
              >
                Skip for now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
