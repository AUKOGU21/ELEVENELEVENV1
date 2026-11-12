// ── Why her? ──────────────────────────────────────────────────────────────────
// The match % on a take, rec or feed card is a button. Tapping it opens a short list of
// what you have in common (see lib/whyMatch.ts for the wording). The first time
// someone sees one, a small dark tip points at it once.
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { C, SANS } from "@/lib/design";
import { track } from "@/lib/track";
import MatchSeal from "./MatchSeal";
import type { WhyLine } from "@/lib/whyMatch";

export function SealButton({ score, size, labelSize, open, onToggle, enabled, sealRef }: {
  score: number;
  size: number;
  labelSize?: number;
  open: boolean;
  onToggle: () => void;
  /** No facts to show (signed out, guest): the seal stays a plain label. */
  enabled: boolean;
  sealRef?: React.Ref<HTMLButtonElement>;
}) {
  if (!enabled) return <MatchSeal score={score} size={size} labelSize={labelSize} />;
  return (
    // Never the click that opens the card it sits on.
    <button ref={sealRef} onClick={(e) => { e.stopPropagation(); onToggle(); }} onKeyDown={(e) => e.stopPropagation()} aria-expanded={open} aria-label={`${Math.round(score)}% match. See what you have in common`}
      style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", display: "inline-flex", WebkitTapHighlightColor: "transparent" }}>
      <MatchSeal score={score} size={size} labelSize={labelSize} />
    </button>
  );
}

export function WhyPanel({ lines }: { lines: WhyLine[] }) {
  // Just the details: no "Why her?" heading, so it reads as what you two share,
  // not a verdict on her.
  return (
    <div style={{ marginTop: 12, background: "#F1EDE7", borderRadius: 12, padding: "8px 16px 6px" }}>
      {!lines.some((l) => !l.diff) && (
        <p style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.4, color: C.muted, padding: lines.length ? "8px 0 0" : "8px 0 6px" }}>
          Not much in common on file yet.
        </p>
      )}
      {lines.length > 0 && (
        <ul style={{ listStyle: "none", padding: "2px 0", margin: 0 }}>
          {lines.map((l) => (
            <li key={l.text} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "6px 0", fontFamily: SANS, fontSize: 14, lineHeight: 1.35, fontWeight: l.diff ? 500 : 600, color: l.diff ? C.inkSoft : C.ink }}>
              {l.diff
                ? <span aria-hidden style={{ width: 12, flexShrink: 0, color: C.muted, textAlign: "center" }}>–</span>
                : <Check aria-hidden strokeWidth={1.75} style={{ width: 12, height: 12, flexShrink: 0, color: C.burgundy, position: "relative", top: 1 }} />}
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The one-time "New!" tip, under the name row, its arrow pointing up at the seal. */
export function WhyTip({ sealEl, onDismiss, align = "left" }: { sealEl: HTMLElement | null; onDismiss: () => void; align?: "left" | "right" }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [arrowLeft, setArrowLeft] = useState(28);
  useEffect(() => {
    track("why_tip_shown");
    const place = () => {
      const box = boxRef.current;
      if (!sealEl || !box) return;
      const s = sealEl.getBoundingClientRect(), b = box.getBoundingClientRect();
      setArrowLeft(Math.max(14, Math.min(s.left - b.left + 18, b.width - 28)));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [sealEl]);
  return (
    <div ref={boxRef} role="note" onClick={(e) => e.stopPropagation()} style={{ position: "relative", marginTop: 12, maxWidth: 300, marginLeft: align === "right" ? "auto" : undefined, cursor: "default", background: C.ink, color: C.paper, borderRadius: 10, padding: "10px 36px 10px 13px", fontFamily: SANS, fontSize: 13, lineHeight: 1.35, boxShadow: "0 10px 24px rgba(20,18,16,.22)" }}>
      <span aria-hidden style={{ position: "absolute", top: -5, left: arrowLeft, width: 11, height: 11, background: C.ink, transform: "rotate(45deg)" }} />
      <b style={{ color: "#E3C38E" }}>New!</b> Tap the match % to see what you have in common.
      <button onClick={onDismiss} aria-label="Got it" style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", padding: 4, cursor: "pointer", color: C.faint, lineHeight: 0 }}>
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}
