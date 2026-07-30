// ── FeedBanner ────────────────────────────────────────────────────────────────
// The primary posting surface at the top of the feed. Replaces the old floating
// "+ Post" as the main entry point. Decision dominates; Looking For is secondary.
import { ShoppingBag, Search, ArrowRight } from "lucide-react";

const INK = "#1C1712";
const MUTED = "#8C7A70";
const GOLD = "#C49E64";

interface Props {
  onDecision: () => void;
  onLookingFor: () => void;
  isMobile: boolean;
}

export default function FeedBanner({ onDecision, onLookingFor, isMobile }: Props) {
  return (
    <div style={{
      position: "relative", zIndex: 1,
      background: "#F5EFEA", borderRadius: 20, padding: isMobile ? "20px 16px" : "26px 28px",
      boxShadow: "0 6px 24px rgba(0,0,0,0.06)", marginBottom: 20, border: "1px solid rgba(0,0,0,0.04)",
    }}>
      <div style={{ textAlign: "center", marginBottom: isMobile ? 18 : 22 }}>
        <p style={{ fontFamily: "Georgia, serif", fontSize: isMobile ? 22 : 28, color: INK, margin: 0, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
          What are you deciding on today?
        </p>
        <p style={{ fontSize: isMobile ? 13.5 : 15, color: MUTED, margin: "7px 0 0" }}>
          Share a decision or ask the community for help.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 16 }}>
        {/* PRIMARY — Decision */}
        <button
          onClick={onDecision}
          style={{
            flex: 1, textAlign: "left", cursor: "pointer",
            background: "rgba(255,255,255,0.72)", borderRadius: 16,
            border: `1.5px solid ${GOLD}`,
            boxShadow: "0 0 14px rgba(196,158,100,0.20)",
            padding: isMobile ? "16px" : "18px 20px",
            display: "flex", flexDirection: "column", gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(196,158,100,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ShoppingBag style={{ width: 22, height: 22, color: "#A07848" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, margin: "0 0 2px" }}>Decision</p>
              <p style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.15 }}>Should I buy this?</p>
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: "#5A4A42", margin: 0, lineHeight: 1.45 }}>
            Get real opinions from women like you before you buy.
          </p>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: INK, color: "#FDFAF6", borderRadius: 100, padding: "11px 0", fontSize: 14.5, fontWeight: 600, marginTop: 2 }}>
            Share a decision <ArrowRight style={{ width: 16, height: 16 }} />
          </span>
        </button>

        {/* SECONDARY — Looking For */}
        <button
          onClick={onLookingFor}
          style={{
            flex: 1, textAlign: "left", cursor: "pointer",
            background: "rgba(255,255,255,0.5)", borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.10)",
            padding: isMobile ? "16px" : "18px 20px",
            display: "flex", flexDirection: "column", gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Search style={{ width: 21, height: 21, color: "#6F665A" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, margin: "0 0 2px" }}>Looking For</p>
              <p style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.15 }}>Need recommendations?</p>
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: "#5A4A42", margin: 0, lineHeight: 1.45 }}>
            Tell us what you want and get matched product picks.
          </p>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", color: INK, border: "1px solid rgba(0,0,0,0.22)", borderRadius: 100, padding: "10px 0", fontSize: 14.5, fontWeight: 600, marginTop: 2 }}>
            Ask the community <ArrowRight style={{ width: 16, height: 16 }} />
          </span>
        </button>
      </div>
    </div>
  );
}
