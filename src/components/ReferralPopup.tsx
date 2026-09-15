// ── ReferralPopup ─────────────────────────────────────────────────────────────
// One-time invite prompt, set like the tier email: the faded photograph, one
// question in Anton, one button. The CTA opens the native share sheet (copy-link
// fallback on desktop); dismissing stamps referral_prompt_dismissed_at so it
// never reappears unless manually re-triggered.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ArrowRight } from "lucide-react";
import { shareInvite } from "@/lib/referral";
import { C, RADIUS, SANS, body, display, meta } from "@/lib/design";

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
          style={{ position: "fixed", inset: 0, zIndex: 340, background: C.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, boxSizing: "border-box" }}>
          <motion.div key="card" onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="e11-invite-title"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
            style={{
              position: "relative", width: "min(440px, 100%)", minHeight: "min(580px, 88vh)", maxHeight: "92vh",
              overflowY: "auto", boxSizing: "border-box", borderRadius: RADIUS,
              // The photo, with its top washed back so the question and the line
              // under it read cleanly over the figure.
              background: "linear-gradient(to bottom, rgba(237,236,234,0.94) 0%, rgba(237,236,234,0.72) 40%, rgba(237,236,234,0) 62%), #EDECEA url(/email/legs-faded.jpg) center 55% / cover no-repeat",
              boxShadow: "0 30px 70px rgba(20,18,16,0.35)",
              display: "flex", flexDirection: "column", textAlign: "center", fontFamily: SANS,
            }}>
            <button onClick={onDismiss} aria-label="Close" className="e11-close"
              style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", padding: 6, cursor: "pointer", color: C.ink, lineHeight: 0 }}>
              <X style={{ width: 22, height: 22 }} strokeWidth={1.5} />
            </button>

            <div style={{ padding: "40px 30px 0" }}>
              <p style={{ fontFamily: SANS, textTransform: "uppercase", letterSpacing: "0.32em", fontSize: 11, color: C.ink }}>
                <span style={{ fontWeight: 700 }}>ELEVEN</span><span style={{ fontWeight: 300 }}>ELEVEN</span>
              </p>
              <h2 id="e11-invite-title" style={{ ...display("clamp(42px, 11vw, 56px)"), lineHeight: 0.92, marginTop: 30 }}>
                Know someone with good taste?
              </h2>
              <p style={{ ...body(15, C.inkSoft), margin: "16px auto 0", maxWidth: "30ch" }}>
                Invite the friends whose opinion you ask for before you buy.
              </p>
            </div>

            <div style={{ marginTop: "auto", padding: "80px 26px 22px", background: "linear-gradient(to top, rgba(247,244,239,0.96) 45%, rgba(247,244,239,0))" }}>
              <button onClick={invite} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                background: C.burgundy, border: "none", borderRadius: RADIUS, padding: "17px 0", cursor: "pointer",
                ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em",
              }}>
                {copied
                  ? <><Check style={{ width: 16, height: 16 }} /> Link copied</>
                  : <>Send an invite <ArrowRight style={{ width: 16, height: 16 }} /></>}
              </button>
              <button onClick={onDismiss} style={{ ...meta(11, C.muted), fontWeight: 700, marginTop: 16, background: "none", border: "none", padding: 4, cursor: "pointer" }}>
                Maybe later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
