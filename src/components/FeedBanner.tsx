// ── FeedBanner ────────────────────────────────────────────────────────────────
// The top of the feed: what you can do here, set as a page rather than a widget.
const CROC = "/home/croc-burgundy.webp";
const CREAM = "#F2EDE6";
// An oversized question on the left, the two ways in on a grid beside it,
// separated by rules instead of boxes. No icons and no background photograph:
// the decisions underneath supply the imagery.
//
// On a phone the whole thing compresses to the question on two lines and two
// actions, so the feed itself starts within the first screen. The invite rides
// above it as a thin croc-leather banner rather than a line competing with the
// actions.
import { ArrowRight } from "lucide-react";
import { C, RADIUS, body, display, meta } from "@/lib/design";

interface Props {
  onDecision: () => void;
  onLookingFor: () => void;
  onInvite?: () => void;
  isMobile: boolean;
}

const cta: React.CSSProperties = {
  ...meta(12.5, C.burgundy),
  fontWeight: 700,
  letterSpacing: "0.12em",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  alignSelf: "flex-start",
};

function Way({ n, eyebrow, title, blurb, action, onClick, isMobile }: {
  n: string;
  eyebrow: string;
  title: string;
  blurb: string;
  action: string;
  onClick: () => void;
  isMobile: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 14, height: "100%" }}>
      <p style={meta(11, C.ink)}>{n} / {eyebrow}</p>
      <h2 style={display(isMobile ? 30 : "clamp(22px, 2.1vw, 32px)")}>{title}</h2>
      <p style={{ ...body(isMobile ? 13.5 : 14.5), maxWidth: "34ch" }}>{blurb}</p>
      <button onClick={onClick} style={{ ...cta, marginTop: isMobile ? 4 : "auto", paddingTop: isMobile ? 0 : 6 }}>
        {action} <ArrowRight style={{ width: 16, height: 16 }} strokeWidth={2} />
      </button>
    </div>
  );
}

export default function FeedBanner({ onDecision, onLookingFor, onInvite, isMobile }: Props) {
  if (isMobile) {
    const bannerType: React.CSSProperties = { ...meta(10, CREAM), fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap" };
    return (
      <section style={{ position: "relative", zIndex: 1 }}>
        {onInvite && (
          // Edge to edge, tucked right under the nav: the feed's own padding is
          // 16px each side and 14px on top, so the banner reaches past it.
          <button onClick={onInvite} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
            width: "calc(100% + 32px)", margin: "-14px -16px 0", padding: "13px 12px",
            background: `#3A0A0C url(${CROC}) center / cover no-repeat`, border: "none", cursor: "pointer",
          }}>
            <span style={bannerType}>Good taste is meant to be shared.</span>
            <span style={{ ...bannerType, borderBottom: "1px solid rgba(242,237,230,0.7)", paddingBottom: 2 }}>
              Invite a friend &rarr;
            </span>
          </button>
        )}
        <h1 style={{ ...display("clamp(26px, 8.8vw, 36px)"), lineHeight: 0.95, marginTop: 16 }}>
          <span style={{ display: "block", whiteSpace: "nowrap" }}>What are you deciding</span>
          <span style={{ display: "block", whiteSpace: "nowrap" }}>on today?</span>
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 14 }}>
          <button onClick={onDecision} style={{
            ...meta(11.5, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.14em",
            display: "inline-flex", alignItems: "center", gap: 8,
            background: C.burgundy, border: "none", borderRadius: RADIUS, padding: "13px 16px", cursor: "pointer",
          }}>
            + Post a decision <ArrowRight style={{ width: 15, height: 15 }} strokeWidth={2} />
          </button>
          <button onClick={onLookingFor} style={{ ...meta(11.5, C.ink), fontWeight: 700, letterSpacing: "0.14em", display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            Ask for recs <ArrowRight style={{ width: 15, height: 15 }} strokeWidth={2} />
          </button>
        </div>
        <div style={{ borderBottom: "1px solid rgba(20,18,16,0.32)", marginTop: 18 }} />
      </section>
    );
  }

  return (
    <section style={{ position: "relative", zIndex: 1, marginTop: 44 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 1fr) minmax(0, 1fr)", alignItems: "stretch" }}>
        <h1 style={{ ...display("clamp(54px, 5.7vw, 88px)"), paddingRight: 40 }}>
          What are you<br />deciding on<br />today?
        </h1>
        <div style={{ borderLeft: `1px solid ${C.rule}`, padding: "10px 32px 6px" }}>
          <Way
            n="01" eyebrow="Decision" title="Should I buy this?"
            blurb="Get real opinions from women like you before you buy."
            action="Post a decision" onClick={onDecision} isMobile={false}
          />
        </div>
        <div style={{ borderLeft: `1px solid ${C.rule}`, padding: "10px 0 6px 32px" }}>
          <Way
            n="02" eyebrow="Looking for" title="Need recommendations?"
            blurb="Tell us what you want and get matched product picks."
            action="Ask the community" onClick={onLookingFor} isMobile={false}
          />
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        marginTop: 30, paddingBottom: 18, borderBottom: "1px solid rgba(20,18,16,0.32)",
      }}>
        <p style={{ ...meta(11, C.ink), letterSpacing: "0.3em", fontWeight: 500 }}>
          Real women. Real decisions.
        </p>
        {onInvite && (
          <button onClick={onInvite} style={{ ...meta(11, C.ink), fontWeight: 700, letterSpacing: "0.18em", display: "inline-flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", whiteSpace: "nowrap" }}>
            Know someone with good taste?
            <span style={{ ...meta(11, C.burgundy), fontWeight: 700, letterSpacing: "0.18em", display: "inline-flex", alignItems: "center", gap: 7 }}>
              Send an invite <ArrowRight style={{ width: 14, height: 14 }} strokeWidth={2} />
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
