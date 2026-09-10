import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import { FIT_CATEGORIES } from "@/components/onboarding/OnboardingData";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import fitEditorial from "@/assets/fit-editorial.jpg";

// Same type system as onboarding and the emails.
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const INK = "#1C1712";
const INK_SOFT = "#3A3530";
const MUTED = "#8C7A70";
const LINE = "rgba(28,23,18,0.16)";
const GOLD = "#C49E64";
const GOLD_TINT = "rgba(196,158,100,0.13)";
const PAPER = "#F1EFEB";
const scrim = (a: number) => `rgba(241,239,235,${a})`;

const doneKey = (userId: string) => `eleven_fit_prompt_done_${userId}`;
const snoozeKey = (userId: string) => `eleven_fit_prompt_snooze_${userId}`;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // stay quiet for 2 weeks after a skip/dismiss

// True when this profile has no fit answers saved yet. This is the real check:
// localStorage only knows about this device, and 19 of 28 accounts have never
// filled fit in, so the prompt has to follow the person, not the browser.
export function missingFitCategories(fitDetails: Record<string, unknown> | null | undefined): string[] {
  const fd = fitDetails ?? {};
  return FIT_CATEGORIES
    .map(c => c.label)
    .filter(label => {
      const v = fd[label];
      return !(typeof v === "string" && v.trim() !== "");
    });
}

export function fitIsEmpty(fitDetails: Record<string, unknown> | null | undefined): boolean {
  return missingFitCategories(fitDetails).length === FIT_CATEGORIES.length;
}

// The account-level record that we already asked her once, unprompted. It lives
// on the profile rather than in localStorage so it follows her to every device
// and every browser: the auto-prompt gets exactly one shot per account, ever.
// Opening the modal herself from her profile doesn't count and doesn't stamp.
export async function markFitPromptAsked(userId: string): Promise<void> {
  markFitPromptDone(userId);   // stop this device immediately, before the round trip
  try {
    await supabase
      .from("profiles")
      .update({ fit_prompt_dismissed_at: new Date().toISOString() })
      .eq("id", userId);
  } catch (err) {
    console.warn("could not record the fit prompt as asked:", err);
  }
}

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
  /** True when the app opened this on its own. Auto-opens get one shot per account. */
  auto?: boolean;
  /** Ask only for these categories. Omit to ask for all of them. */
  only?: string[];
}

export function DialInFitModal({ open, onClose, variant = "weigh_in", only, auto = false }: Props) {
  // Someone who answered three of five should be asked the other two, not all
  // five again. Saving merges, so her existing answers are never disturbed.
  const asking = only && only.length > 0
    ? FIT_CATEGORIES.filter(c => only.includes(c.label))
    : FIT_CATEGORIES;
  const partial = asking.length < FIT_CATEGORIES.length;
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Holds non-answer meta keys from fit_details (e.g. `_fit_photos`) so saving answers doesn't wipe them
  const metaRef = useRef<Record<string, unknown>>({});

  // Closing without saving snoozes the prompt so it stops reappearing on every action.
  const handleDismiss = () => { if (user) snoozeFitPrompt(user.id); onClose(); };

  // An auto-open is spent the moment she sees it. Whether she answers, skips, or
  // closes the tab on it, we don't ask again on our own initiative.
  useEffect(() => {
    if (open && auto && user) markFitPromptAsked(user.id);
  }, [open, auto, user]);

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
    // "About average" and "About proportional" used to be thrown away here. That
    // was wrong twice over: matching scores two women who both answered the same
    // way, so neutral-and-neutral is a real match, and discarding the answer left
    // the category looking unanswered, which meant she got asked again forever.
    const filtered = Object.fromEntries(
      Object.entries(answers).filter(([k, v]) =>
        typeof v === "string" && v.trim() !== "" && !k.startsWith("_")
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

  const filledCount = asking.filter(c => (answers[c.label] ?? "").trim() !== "").length;

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
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 8,
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
              position: "relative", width: "100%", maxWidth: 520,
              maxHeight: "calc(100vh - 32px)", overflowY: "auto",
              borderRadius: 16, overflowX: "hidden", background: PAPER,
            }}
          >
            {/* The photograph sits behind everything, knocked back so type stays loudest. */}
            <div aria-hidden style={{
              position: "absolute", inset: 0,
              backgroundImage: `url(${fitEditorial})`, backgroundSize: "cover",
              backgroundPosition: "60% 4%", filter: "grayscale(1) contrast(1.02)", opacity: 0.62,
            }} />
            <div aria-hidden style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(180deg, ${scrim(0.34)} 0%, ${scrim(0.72)} 34%, ${scrim(0.94)} 62%, ${scrim(0.985)} 100%)`,
            }} />

            <button
              onClick={handleDismiss}
              aria-label="Close"
              style={{
                position: "absolute", top: 16, right: 16, zIndex: 2,
                width: 30, height: 30, borderRadius: "50%", border: `1px solid ${LINE}`,
                background: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", color: INK,
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>

            <div style={{ position: "relative", zIndex: 1, padding: "92px 26px 28px" }}>
              <h2 style={{
                fontFamily: SANS, fontSize: 27, lineHeight: 1.1, fontWeight: 700,
                letterSpacing: "2.6px", textTransform: "uppercase", color: INK, margin: "0 0 14px",
              }}>
                Dial in your fit
              </h2>
              <p style={{ fontFamily: SANS, fontSize: 12.5, lineHeight: 1.6, color: INK_SOFT, margin: "0 0 26px", maxWidth: "36ch" }}>
                {partial
                  ? `You're almost there. ${asking.length === 1 ? "One question" : `${asking.length} questions`} left.`
                  : "Make your matches and responses more precise in seconds."}
              </p>

              <div style={{ height: 1, background: LINE, marginBottom: 24 }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {asking.map(cat => (
                  <div key={cat.label}>
                    <p style={{
                      fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "2.2px",
                      textTransform: "uppercase", color: INK, margin: "0 0 10px",
                    }}>
                      {cat.label}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {cat.options.map(opt => {
                        const active = answers[cat.label] === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => select(cat.label, opt)}
                            style={{
                              padding: "9px 15px", borderRadius: 0,
                              border: `1.5px solid ${active ? GOLD : LINE}`,
                              background: active ? GOLD_TINT : "rgba(255,255,255,0.45)",
                              color: INK_SOFT, fontFamily: SANS, fontSize: 11.5,
                              fontWeight: active ? 600 : 500, letterSpacing: "0.2px",
                              cursor: "pointer", whiteSpace: "nowrap", transition: "all .14s",
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSave}
                disabled={filledCount === 0 || saving}
                style={{
                  width: "100%", marginTop: 30, padding: "17px 0", borderRadius: 0,
                  border: `2px solid ${INK}`, background: "transparent", color: INK,
                  fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "2.4px",
                  textTransform: "uppercase",
                  opacity: filledCount === 0 || saving ? 0.32 : 1,
                  cursor: filledCount === 0 || saving ? "default" : "pointer",
                  transition: "opacity .15s",
                }}
              >
                {saving ? "Saving..." : "Improve my matches"}
                {!saving && <ArrowRight style={{ width: 14, height: 14, display: "inline", verticalAlign: "-2px", marginLeft: 10 }} />}
              </button>

              <button
                onClick={handleDismiss}
                style={{
                  display: "block", width: "100%", marginTop: 16, background: "none", border: "none",
                  fontFamily: SANS, fontSize: 11, letterSpacing: "1.6px", textTransform: "uppercase",
                  color: MUTED, cursor: "pointer", textDecoration: "underline",
                  textUnderlineOffset: 3, padding: "6px 0",
                }}
              >
                {auto ? "Not now" : "Skip for now"}
              </button>
              {auto && (
                <p style={{
                  fontFamily: SANS, fontSize: 9.5, letterSpacing: "1.4px", textTransform: "uppercase",
                  color: MUTED, textAlign: "center", margin: "10px 0 0",
                }}>
                  You can always do this from your profile
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
