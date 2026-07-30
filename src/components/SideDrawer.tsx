// ── SideDrawer ────────────────────────────────────────────────────────────────
// Generic right-side sliding drawer (Linear / Notion / IG-comments feel). Keeps
// the feed in place behind a dim scrim — the user never navigates away. Reused for
// both the Decision "responses" drawer and the Looking For "recommendations" drawer.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const INK = "#1C1712";
const MUTED = "#8C7A70";
const CREAM = "#FDFAF6";

export interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Pinned block directly under the header (e.g. the original question). */
  pinned?: React.ReactNode;
  /** Sticky footer (e.g. an "Add your thoughts" CTA). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export default function SideDrawer({ open, onClose, title, subtitle, pinned, footer, children }: SideDrawerProps) {
  // Lock body scroll while open + close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(28,23,18,0.42)", zIndex: 300, backdropFilter: "blur(2px)" }}
          />
          <motion.div
            key="panel"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 301,
              width: "min(460px, 100vw)", background: CREAM,
              boxShadow: "-16px 0 48px rgba(28,23,18,0.22)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{ flexShrink: 0, padding: "16px 20px 14px", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                >
                  <X style={{ width: 17, height: 17, color: INK }} />
                </button>
                <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                  <p style={{ fontSize: 17, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.2 }}>{title}</p>
                  {subtitle && <p style={{ fontSize: 13, color: MUTED, margin: "2px 0 0" }}>{subtitle}</p>}
                </div>
                <div style={{ width: 32, flexShrink: 0 }} />
              </div>
            </div>

            {/* Scrollable body */}
            <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
              {pinned && (
                <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(0,0,0,0.015)" }}>
                  {pinned}
                </div>
              )}
              <div style={{ padding: "16px 18px 24px" }}>{children}</div>
            </div>

            {/* Sticky footer */}
            {footer && (
              <div style={{ flexShrink: 0, padding: "14px 18px", borderTop: "1px solid rgba(0,0,0,0.07)", background: CREAM }}>
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
