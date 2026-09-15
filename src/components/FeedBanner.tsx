// ── FeedBanner ────────────────────────────────────────────────────────────────
// The top of the feed: what you can do here, set as a page rather than a widget.
// An oversized question on the left, the two ways in on a grid beside it,
// separated by rules instead of boxes. No icons and no background photograph:
// the decisions underneath supply the imagery. Below it, the invite gets its
// own band and its own Anton line, so it reads as an ask rather than a footnote.
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
  const decision = (
    <Way
      n="01" eyebrow="Decision" title="Should I buy this?"
      blurb="Get real opinions from women like you before you buy."
      action="Post a decision" onClick={onDecision} isMobile={isMobile}
    />
  );
  const lookingFor = (
    <Way
      n="02" eyebrow="Looking for" title="Need recommendations?"
      blurb="Tell us what you want and get matched product picks."
      action="Ask the community" onClick={onLookingFor} isMobile={isMobile}
    />
  );

  const tagline = (
    <p style={{ ...meta(isMobile ? 10 : 11, onInvite ? C.muted : C.ink), letterSpacing: "0.3em", fontWeight: 500 }}>
      Real women. Real decisions.
    </p>
  );

  return (
    <section style={{ position: "relative", zIndex: 1, marginTop: isMobile ? 22 : 44 }}>
      {isMobile ? (
        <div>
          <h1 style={display("clamp(50px, 15vw, 64px)")}>
            What are you<br />deciding on<br />today?
          </h1>
          <div style={{ borderTop: `1px solid ${C.rule}`, marginTop: 26, paddingTop: 22 }}>{decision}</div>
          <div style={{ borderTop: `1px solid ${C.rule}`, marginTop: 24, paddingTop: 22 }}>{lookingFor}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 1fr) minmax(0, 1fr)", alignItems: "stretch" }}>
          <h1 style={{ ...display("clamp(54px, 5.7vw, 88px)"), paddingRight: 40 }}>
            What are you<br />deciding on<br />today?
          </h1>
          <div style={{ borderLeft: `1px solid ${C.rule}`, padding: "10px 32px 6px" }}>{decision}</div>
          <div style={{ borderLeft: `1px solid ${C.rule}`, padding: "10px 0 6px 32px" }}>{lookingFor}</div>
        </div>
      )}

      {onInvite ? (
        <div style={{
          display: "flex", flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "flex-end", justifyContent: "space-between", gap: isMobile ? 18 : 32,
          marginTop: isMobile ? 28 : 40, padding: isMobile ? "22px 0" : "26px 0",
          borderTop: `1px solid ${C.rule}`, borderBottom: "1px solid rgba(20,18,16,0.32)",
        }}>
          <div style={{ minWidth: 0 }}>
            {tagline}
            <p style={{ ...display(isMobile ? 36 : "clamp(36px, 3.6vw, 54px)"), marginTop: isMobile ? 10 : 12 }}>
              Know someone with good taste?
            </p>
          </div>
          <button onClick={onInvite} style={{
            ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: C.burgundy, border: "none", borderRadius: RADIUS,
            padding: isMobile ? "16px 0" : "17px 28px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            Send an invite <ArrowRight style={{ width: 16, height: 16 }} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <div style={{ marginTop: isMobile ? 26 : 30, paddingBottom: isMobile ? 16 : 18, borderBottom: "1px solid rgba(20,18,16,0.32)" }}>
          {tagline}
        </div>
      )}
    </section>
  );
}
