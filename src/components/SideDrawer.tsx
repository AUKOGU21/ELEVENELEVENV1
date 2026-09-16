// ── SideDrawer ────────────────────────────────────────────────────────────────
// Generic right-side sliding drawer. Keeps the feed in place behind a dim scrim,
// so the user never navigates away. Reused for both the Decision "responses"
// drawer and the Looking For "recommendations" drawer.
//
// Drawn like the rest of the redesign: paper, hairlines, a bare close mark. The
// only shadow in the system is the one under this panel, because it floats.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { C, meta, strong } from "@/lib/design";

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
            style={{ position: "fixed", inset: 0, background: C.scrim, zIndex: 300 }}
          />
          <motion.div
            key="panel"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 301,
              width: "min(460px, 100vw)", background: C.paper,
              boxShadow: "-16px 0 48px rgba(20,18,16,0.14)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{ flexShrink: 0, padding: "18px 20px 14px", borderBottom: `1px solid ${C.ruleStrong}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ ...strong(15), textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1.25 }}>{title}</p>
                  {subtitle && <p style={{ ...meta(10, C.muted), marginTop: 7 }}>{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  style={{ background: "none", border: "none", padding: 2, cursor: "pointer", lineHeight: 0, color: C.ink, flexShrink: 0 }}
                >
                  <X style={{ width: 18, height: 18 }} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
              {pinned && (
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.rule}` }}>
                  {pinned}
                </div>
              )}
              <div style={{ padding: "4px 20px 28px" }}>{children}</div>
            </div>

            {/* Sticky footer */}
            {footer && (
              <div style={{ flexShrink: 0, padding: "16px 20px", borderTop: `1px solid ${C.ruleStrong}`, background: C.paper }}>
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
