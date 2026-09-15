// ── FeedBanner ────────────────────────────────────────────────────────────────
// The top of the feed: what you can do here, set as a page rather than a widget.
// An oversized question on the left, the two ways in on a grid beside it,
// separated by rules instead of boxes. No icons and no background photograph:
// the decisions underneath supply the imagery.
import { ArrowRight } from "lucide-react";
import { C, body, display, meta } from "@/lib/design";

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
      <h2 style={display(isMobile ? 30 : "clamp(28px, 2.9vw, 40px)")}>{title}</h2>
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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr)", alignItems: "stretch" }}>
          <h1 style={{ ...display("clamp(64px, 7.4vw, 108px)"), paddingRight: 40 }}>
            What are you<br />deciding on<br />today?
          </h1>
          <div style={{ borderLeft: `1px solid ${C.rule}`, padding: "10px 36px 6px" }}>{decision}</div>
          <div style={{ borderLeft: `1px solid ${C.rule}`, padding: "10px 0 6px 36px" }}>{lookingFor}</div>
        </div>
      )}

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        marginTop: isMobile ? 26 : 30, paddingBottom: isMobile ? 16 : 18,
        borderBottom: "1px solid rgba(20,18,16,0.32)",
      }}>
        <p style={{ ...meta(isMobile ? 10 : 11, C.ink), letterSpacing: "0.3em", fontWeight: 500 }}>
          Real women. Real decisions.
        </p>
        {onInvite && (
          <button onClick={onInvite} style={{ ...cta, ...meta(isMobile ? 10 : 11, C.ink), letterSpacing: "0.22em", display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", whiteSpace: "nowrap" }}>
            Invite your circle <ArrowRight style={{ width: 14, height: 14 }} strokeWidth={2} />
          </button>
        )}
      </div>
    </section>
  );
}
