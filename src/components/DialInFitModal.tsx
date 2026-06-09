import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ArrowRight } from "lucide-react";
import { FIT_CATEGORIES } from "@/components/onboarding/OnboardingData";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const promptKey = (userId: string) => `eleven_fit_prompt_${userId}_at`;

export function shouldShowFitPrompt(userId: string): boolean {
  const last = localStorage.getItem(promptKey(userId));
  if (!last) return true;
  return Date.now() - parseInt(last) > 24 * 60 * 60 * 1000;
}

export function markFitPromptShown(userId: string): void {
  localStorage.setItem(promptKey(userId), Date.now().toString());
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

  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from("profiles")
      .select("fit_details")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.fit_details) setAnswers(data.fit_details as Record<string, string>);
      });
  }, [open, user]);

  const select = (category: string, option: string) =>
    setAnswers(prev => ({ ...prev, [category]: prev[category] === option ? "" : option }));

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    const filtered = Object.fromEntries(
      Object.entries(answers).filter(([, v]) =>
        v && !v.toLowerCase().includes("average") && !v.toLowerCase().includes("proportional")
      )
    );
    try {
      // Timeout guard so a hung request can never leave the button stuck on "Saving…"
      const { error } = await Promise.race([
        supabase.from("profiles").update({ fit_details: filtered }).eq("id", user.id),
        new Promise<{ error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error("save timed out")), 10000)
        ),
      ]);
      if (error) throw error;
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
              onClick={onClose}
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
                onClick={onClose}
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
