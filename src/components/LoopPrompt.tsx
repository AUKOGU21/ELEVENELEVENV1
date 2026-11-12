// ── LoopPrompt ────────────────────────────────────────────────────────────────
// "Did you decide?" When she opens the app with a decision still open, this asks
// about one of them, with the same four answers the card and the check-ins give:
// Bought it, Passed on it, Bought something else, Still deciding.
//
// It only asks. Every answer is handed back to the feed, which runs the exact
// same flows as the card buttons and the /feed?close= check-in links, so the
// outcome lands in the same outcomes row with the same fields.
//
// Who gets asked (a member's feedback, 2026-11-12: "sometimes I'm still deciding,
// other times I just forget"):
//   - her own open decision (not Looking For), posted 3+ days ago
//   - never answered, or answered Still deciding 7+ days ago
//   - at most one ask per day, the post with the most advice first
//   - Not now skips that post for 3 days; after two Not nows we stop asking about it
//
// Not now is remembered on this device. The answers themselves are saved to her
// account like any other outcome.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { C, RADIUS, SANS, body, display, meta, strong } from "@/lib/design";

export type LoopAnswer = "bought" | "passed" | "bought_else" | "deciding";

const DAY = 86400000;
const MIN_AGE_DAYS = 3;
const STILL_DECIDING_WAIT_DAYS = 7;
const NOT_NOW_DAYS = 3;
const MAX_NOT_NOWS = 2;
const ONCE_PER_MS = 20 * 3600 * 1000; // "once a day", without drifting later each day

interface LoopState { lastShown?: number; posts?: Record<string, { until?: number; notNows?: number }> }
const key = (userId: string) => `ee_loop_prompt_${userId}`;
function read(userId: string): LoopState {
  try { return JSON.parse(localStorage.getItem(key(userId)) ?? "{}") ?? {}; } catch { return {}; }
}
function write(userId: string, s: LoopState) {
  try { localStorage.setItem(key(userId), JSON.stringify(s)); } catch { /* private mode: it just asks again */ }
}

export interface LoopCandidate {
  id: string;
  user_id: string;
  status: string | null;
  post_type?: string | null;
  created_at: string;
  brand_name?: string | null;
  product_name?: string | null;
  product_image_url?: string | null;
  responses?: unknown[] | null;
  outcomes?: { outcome_type?: string | null; still_deciding_at?: string | null }[] | null;
}

/** The one decision to ask her about right now, or null. */
export function pickLoopCandidate<T extends LoopCandidate>(mine: T[], userId: string, now = Date.now()): T | null {
  const s = read(userId);
  if (s.lastShown && now - s.lastShown < ONCE_PER_MS) return null;
  const due = mine.filter((d) => {
    if (d.user_id !== userId || d.status !== "open" || d.post_type === "looking_for") return false;
    if (now - new Date(d.created_at).getTime() < MIN_AGE_DAYS * DAY) return false;
    const o = d.outcomes?.[0];
    if (o?.outcome_type && o.outcome_type !== "still_deciding") return false;
    if (o?.outcome_type === "still_deciding" && o.still_deciding_at
        && now - new Date(o.still_deciding_at).getTime() < STILL_DECIDING_WAIT_DAYS * DAY) return false;
    const p = s.posts?.[d.id];
    if (p && ((p.notNows ?? 0) >= MAX_NOT_NOWS || (p.until ?? 0) > now)) return false;
    return true;
  });
  due.sort((a, b) =>
    (b.responses?.length ?? 0) - (a.responses?.length ?? 0)
    || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return due[0] ?? null;
}

/** Stamp that she was asked today. */
export function markLoopShown(userId: string) {
  const s = read(userId);
  write(userId, { ...s, lastShown: Date.now() });
}

/** Not now: skip this post for a few days, and stop after the second time. */
export function markLoopNotNow(userId: string, decisionId: string) {
  const s = read(userId);
  const p = s.posts?.[decisionId] ?? {};
  write(userId, {
    ...s,
    posts: { ...(s.posts ?? {}), [decisionId]: { notNows: (p.notNows ?? 0) + 1, until: Date.now() + NOT_NOW_DAYS * DAY } },
  });
}

const OPTIONS: { answer: LoopAnswer; label: string; primary?: boolean }[] = [
  { answer: "bought", label: "Bought it", primary: true },
  { answer: "passed", label: "Passed on it" },
  { answer: "bought_else", label: "Bought something else" },
  { answer: "deciding", label: "Still deciding" },
];

export default function LoopPrompt({ decision, isMobile, onAnswer, onNotNow }: {
  decision: LoopCandidate | null;
  isMobile: boolean;
  onAnswer: (answer: LoopAnswer) => void;
  onNotNow: () => void;
}) {
  const open = !!decision;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onNotNow(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onNotNow]);

  const item = decision ? [decision.brand_name, decision.product_name].filter(Boolean).join(" ") : "";
  const n = decision?.responses?.length ?? 0;

  return createPortal(
    <AnimatePresence>
      {decision && (
        <motion.div key="wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onNotNow}
          style={{
            position: "fixed", inset: 0, zIndex: 340, background: C.scrim, display: "flex",
            alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
            padding: isMobile ? 0 : 18, boxSizing: "border-box",
          }}>
          <motion.div key="card" onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="e11-loop-title"
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
            style={{
              position: "relative", width: isMobile ? "100%" : "min(460px, 100%)", boxSizing: "border-box",
              background: C.paper, borderRadius: isMobile ? "14px 14px 0 0" : RADIUS,
              boxShadow: "0 30px 70px rgba(20,18,16,0.35)", fontFamily: SANS,
              padding: isMobile ? "22px 18px calc(18px + env(safe-area-inset-bottom))" : "26px 26px 22px",
            }}>
            <button onClick={onNotNow} aria-label="Close"
              style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", padding: 6, cursor: "pointer", color: C.ink, lineHeight: 0 }}>
              <X style={{ width: 20, height: 20 }} strokeWidth={1.5} />
            </button>

            <p style={{ ...meta(10, C.muted), fontWeight: 700 }}>Your decision</p>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
              <div style={{ width: 76, height: 92, flexShrink: 0, background: C.well, borderRadius: RADIUS, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {decision.product_image_url
                  ? <img src={decision.product_image_url} alt="" className="e11-blend" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 id="e11-loop-title" style={{ ...display(isMobile ? 30 : 34), lineHeight: 0.95 }}>Did you decide?</h2>
                {item && <p style={{ ...strong(12.5), textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item}</p>}
                {n > 0 && <p style={{ ...body(12.5, C.muted), marginTop: 4 }}>{n} {n === 1 ? "person" : "people"} weighed in</p>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 20 }}>
              {OPTIONS.map((o) => (
                <button key={o.answer} onClick={() => onAnswer(o.answer)} style={{
                  ...meta(11, o.primary ? "#FFFFFF" : C.ink), fontWeight: 700, letterSpacing: "0.08em",
                  background: o.primary ? C.burgundy : "transparent",
                  border: o.primary ? `1px solid ${C.burgundy}` : `1px solid ${C.rule}`,
                  borderRadius: RADIUS, padding: "15px 6px", cursor: "pointer", lineHeight: 1.2,
                }}>
                  {o.label}
                </button>
              ))}
            </div>

            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button onClick={onNotNow} style={{ ...meta(10.5, C.muted), fontWeight: 700, background: "none", border: "none", padding: 6, cursor: "pointer" }}>
                Not now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
