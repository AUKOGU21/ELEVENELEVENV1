// ── ReferralPopup ─────────────────────────────────────────────────────────────
// One-time invite prompt. Primary CTA opens the native share sheet (copy-link
// fallback on desktop); dismissing stamps referral_prompt_dismissed_at so it
// never reappears unless manually re-triggered.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Users, Check, Link as LinkIcon } from "lucide-react";
import { shareInvite } from "@/lib/referral";

const INK = "#1C1712";
const CREAM = "#FDFAF6";
const MUTED = "#8C7A70";
const GOLD = "#C49E64";

interface Props {
  open: boolean;
  code: string | null;
  onDismiss: () => void; // stamp dismissed + close
}

export default function ReferralPopup({ open, code, onDismiss }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  const invite = async () => {
    if (!code) { onDismiss(); return; }
    const res = await shareInvite(code);
    if (res === "copied") { setCopied(true); setTimeout(() => { setCopied(false); onDismiss(); }, 1400); return; }
    if (res === "shared") { onDismiss(); }
    // cancelled → leave popup open so they can try again
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onDismiss}
          style={{ position: "fixed", inset: 0, zIndex: 340, background: "rgba(28,23,18,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, boxSizing: "border-box" }}>
          <motion.div key="card" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            style={{ position: "relative", width: "min(430px, 100%)", maxHeight: "90vh", overflowY: "auto", background: CREAM, borderRadius: 22, boxShadow: "0 24px 64px rgba(28,23,18,0.34)", padding: "30px 28px 26px", textAlign: "center", boxSizing: "border-box" }}>
            <button onClick={onDismiss} aria-label="Close" style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: MUTED }}>
              <X style={{ width: 18, height: 18 }} />
            </button>

            <div style={{ width: 54, height: 54, borderRadius: "50%", margin: "4px auto 18px", background: "rgba(196,158,100,0.14)", border: `1px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users style={{ width: 24, height: 24, color: "#A07848" }} />
            </div>

            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 24, lineHeight: 1.2, color: INK, margin: "0 0 14px", letterSpacing: "-0.01em" }}>
              Every great recommendation starts with someone you trust.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "#5A4A42", margin: "0 0 24px" }}>
              Loving ELEVENELEVEN? Invite the friends whose opinions you always ask for before you buy.
            </p>

            <button onClick={invite} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: INK, color: CREAM, border: "none", borderRadius: 100, padding: "15px 0", fontSize: 15.5, fontWeight: 600, cursor: "pointer" }}>
              {copied ? <><Check style={{ width: 17, height: 17 }} /> Link copied</> : <><LinkIcon style={{ width: 16, height: 16 }} /> Invite My Shopping Circle</>}
            </button>
            <button onClick={onDismiss} style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 600, color: MUTED }}>
              Maybe Later
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
