// ── NotificationPrompt ────────────────────────────────────────────────────────
// Nobody goes looking under the bell, so this asks directly: a dialog on the feed
// that turns push on in one tap.
//
// Only for people running the installed app from their home screen, because push
// is the only thing it can deliver and that is the only place it works. Everyone
// still in a browser gets email for the same events, and never sees this.
//
// Once notifications are on, it never appears again.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell } from "lucide-react";
import { pushState, enablePush, isStandalone, type PushState } from "@/lib/push";

const INK = "#1C1712";
const MUTED = "#8C7A70";
const GOLD = "#C49E64";

const SNOOZE_DAYS = 14;      // "Not now"
const BLOCKED_DAYS = 60;     // she said no to the browser prompt, so back well off

export default function NotificationPrompt({ userId, isMobile }: { userId: string; isMobile: boolean }) {
  const snoozeKey = `ee_push_modal_snoozed_${userId}`;
  const bannerKey = `ee_push_prompt_dismissed_${userId}`;

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PushState>(() => pushState());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const snooze = (days: number) => {
    const until = Date.now() + days * 86400000;
    try {
      localStorage.setItem(snoozeKey, String(until));
      // We just asked in the most direct way there is. Don't also nag in the feed.
      localStorage.setItem(bannerKey, String(Date.now()));
    } catch { /* private mode */ }
  };

  useEffect(() => {
    // Home screen only. In a browser there is nothing to turn on, so don't ask.
    if (!isStandalone()) return;
    const current = pushState();
    if (current === "granted" || current === "unsupported" || current === "denied") return;
    try {
      const until = Number(localStorage.getItem(snoozeKey));
      if (Number.isFinite(until) && until > Date.now()) return;
    } catch { /* private mode: just show it */ }
    // Let the feed paint first so this reads as a prompt, not a page load.
    const t = setTimeout(() => { setState(current); setOpen(true); }, 1200);
    return () => clearTimeout(t);
  }, [snoozeKey]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") notNow(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const notNow = () => { snooze(SNOOZE_DAYS); setOpen(false); };

  const turnOn = async () => {
    setBusy(true);
    await enablePush(userId);
    const next = pushState();
    setState(next);
    setBusy(false);
    if (next === "granted") {
      setDone(true);
      try { localStorage.removeItem(snoozeKey); } catch { /* private mode */ }
      setTimeout(() => setOpen(false), 1600);
    } else {
      // She declined the browser's own prompt, or it was already blocked.
      snooze(BLOCKED_DAYS);
    }
  };

  if (!open) return null;

  const blocked = state === "denied";

  const title = done
    ? "You're all set ✦"
    : blocked
    ? "Notifications are blocked"
    : "Turn on push notifications";

  const body = done
    ? "We'll ping you the moment someone weighs in."
    : blocked
    ? "Turn them back on for ElevenEleven in your phone's notification settings."
    : "Get a ping when someone weighs in on your decision.";

  const dark: React.CSSProperties = {
    flex: 1, padding: "13px 18px", borderRadius: 100, border: "none",
    background: INK, color: "#FDFAF6", fontSize: 14, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1,
  };
  const ghost: React.CSSProperties = {
    flex: 1, padding: "13px 18px", borderRadius: 100, border: "1px solid rgba(0,0,0,0.14)",
    background: "transparent", color: MUTED, fontSize: 14, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <AnimatePresence>
      <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={notNow}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative", width: "100%", maxWidth: 380,
            background: "#F5EFEA", borderRadius: 22, padding: isMobile ? "26px 22px 22px" : "30px 26px 24px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.32)", textAlign: "center",
          }}
        >
          <div style={{
            width: 54, height: 54, borderRadius: "50%", margin: "0 auto 16px",
            background: "rgba(196,158,100,0.16)", border: `1px solid ${GOLD}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bell style={{ width: 24, height: 24, color: "#A07848" }} />
          </div>

          <p style={{ fontFamily: "Georgia, serif", fontSize: 19.5, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.25 }}>
            {title}
          </p>
          <p style={{ fontSize: 13.5, color: MUTED, margin: "9px 0 0", lineHeight: 1.5 }}>
            {body}
          </p>

          {!done && (
            <div style={{ display: "flex", gap: 9, marginTop: 20 }}>
              {blocked ? (
                <button ref={closeRef} style={dark} onClick={notNow}>Got it</button>
              ) : (
                <>
                  <button ref={closeRef} style={ghost} onClick={notNow}>Not now</button>
                  <button style={dark} disabled={busy} onClick={turnOn}>
                    {busy ? "Turning on…" : "Turn on"}
                  </button>
                </>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
