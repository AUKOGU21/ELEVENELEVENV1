// ── LookingFor (creation) ─────────────────────────────────────────────────────
// Posting flow for a "Looking For" — an earlier decision stage. Not a forum post:
// it always leads toward a shopping decision, so the community answers with
// product recommendations (see LookingForView).
//
// Set in the editorial system (src/lib/design.ts): type, rules and square
// edges. Selected priorities are ink-filled with paper text, as in Post a
// decision; burgundy is kept for the post button and the confidence scale.
import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { C, RADIUS, SANS, body, display, hairline, meta } from "@/lib/design";

const PRIORITY_OPTIONS = [
  "Tall friendly", "Petite friendly", "Natural fibers", "Bust support", "Machine washable",
  "Minimal", "Travel", "Workwear", "Running", "Breathable", "Elevated", "Comfortable", "Size inclusive",
];

const textLink = (colour: string = C.ink): CSSProperties => ({
  ...meta(11, colour),
  fontWeight: 700,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
});

const chip = (on: boolean): CSSProperties => ({
  fontFamily: SANS,
  fontSize: 13.5,
  fontWeight: on ? 600 : 500,
  lineHeight: 1.2,
  color: on ? C.paper : C.ink,
  background: on ? C.ink : "transparent",
  border: `1px solid ${on ? C.ink : C.rule}`,
  borderRadius: RADIUS,
  padding: "10px 14px",
  cursor: "pointer",
  transition: "background 0.12s, color 0.12s, border-color 0.12s",
});

const PAGE_CSS = `
.lf-field::placeholder { color: ${C.muted}; opacity: 1; }
.lf-field:focus { border-color: ${C.ink} !important; }
`;

function Masthead({ isMobile, onHome, onFeed }: { isMobile: boolean; onHome: () => void; onFeed: () => void }) {
  return (
    <header style={{ background: C.paper, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, padding: isMobile ? "14px 16px" : "20px 40px" }}>
        <button onClick={onFeed} style={{ ...textLink(C.ink), justifySelf: "start" }}>← Feed</button>
        <button
          onClick={onHome}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", userSelect: "none", fontFamily: SANS, textTransform: "uppercase", letterSpacing: isMobile ? "0.22em" : "0.32em", fontSize: isMobile ? 12 : 15, color: C.ink, whiteSpace: "nowrap" }}
        >
          <span style={{ fontWeight: 700 }}>ELEVEN</span>
          <span style={{ fontWeight: 300 }}>ELEVEN</span>
        </button>
        <span />
      </div>
    </header>
  );
}

export default function LookingFor() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [occasion, setOccasion] = useState("");
  const [priorities, setPriorities] = useState<string[]>([]);
  const [confidence, setConfidence] = useState(5);
  const [context, setContext] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const togglePriority = (p: string) =>
    setPriorities((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const canSubmit = title.trim().length > 2 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    if (!user) { navigate("/signin?mode=signup"); return; }
    setSubmitting(true);
    try {
      await supabase.from("decisions").insert({
        user_id: user.id,
        post_type: "looking_for",
        lf_title: title.trim(),
        lf_budget: budget.trim() || null,
        lf_occasion: occasion.trim() || null,
        lf_priorities: priorities.length ? priorities : null,
        lf_context: context.trim() || null,
        confidence_score: confidence,
        status: "open",
        is_public: true,
      });
      navigate("/feed");
    } catch (e) {
      console.error("looking-for post failed:", e);
      setSubmitting(false);
    }
  };

  const label: CSSProperties = { ...meta(11, C.ink), display: "block", margin: "0 0 10px" };
  const optional: CSSProperties = { color: C.muted, fontWeight: 500 };
  // 16px on phones so iOS doesn't zoom into the field on focus.
  const input: CSSProperties = {
    width: "100%", boxSizing: "border-box", borderRadius: RADIUS, border: `1px solid ${C.rule}`, background: "#FFFFFF",
    padding: "13px 14px", fontFamily: SANS, fontSize: isMobile ? 16 : 15, lineHeight: 1.5, color: C.ink, outline: "none",
  };
  const group: CSSProperties = { marginBottom: isMobile ? 26 : 30 };

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      <style>{PAGE_CSS}</style>
      <Masthead isMobile={isMobile} onHome={() => navigate("/", { state: { home: true } })} onFeed={() => navigate("/feed")} />

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ flex: 1, width: "100%", maxWidth: 640, margin: "0 auto", boxSizing: "border-box", padding: isMobile ? "28px 20px 72px" : "56px 24px 96px" }}
      >
        <p style={{ ...meta(11, C.burgundy), fontWeight: 700, marginBottom: 16 }}>Looking for</p>
        <h1 style={{ ...display(isMobile ? "clamp(34px, 10.5vw, 44px)" : 56), marginBottom: 14 }}>What are you looking for?</h1>
        <p style={{ ...body(isMobile ? 15 : 16, C.inkSoft), maxWidth: "46ch" }}>
          Tell the community what you want and get matched product picks from women like you.
        </p>

        <div style={{ ...hairline(), margin: isMobile ? "28px 0" : "36px 0" }} />

        {/* Title */}
        <div style={group}>
          <label style={label}>What are you looking for?</label>
          <input className="lf-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. High-waisted linen pants for summer" style={input} />
        </div>

        {/* Budget + Occasion */}
        <div style={{ ...group, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 26 : 16 }}>
          <div>
            <label style={label}>Budget <span style={optional}>(optional)</span></label>
            <input className="lf-field" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. Under $150" style={input} />
          </div>
          <div>
            <label style={label}>Occasion <span style={optional}>(optional)</span></label>
            <input className="lf-field" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. Work, travel" style={input} />
          </div>
        </div>

        {/* Priorities */}
        <div style={group}>
          <label style={label}>Priorities</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRIORITY_OPTIONS.map((p) => {
              const on = priorities.includes(p);
              return (
                <button key={p} onClick={() => togglePriority(p)} aria-pressed={on} style={chip(on)}>{p}</button>
              );
            })}
          </div>
        </div>

        {/* Confidence */}
        <div style={group}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
            <label style={{ ...label, margin: 0 }}>How sure are you about what you want?</label>
            <span style={{ ...meta(11, C.burgundy), fontWeight: 700, whiteSpace: "nowrap" }}>{confidence}/10</span>
          </div>
          <div style={{ display: "flex", gap: isMobile ? 4 : 6 }}>
            {Array.from({ length: 10 }).map((_, i) => {
              const n = i + 1;
              const on = n <= confidence;
              return (
                <button
                  key={n}
                  onClick={() => setConfidence(n)}
                  aria-label={`${n} out of 10`}
                  style={{
                    flex: 1, minWidth: 0, height: isMobile ? 44 : 50, padding: 0,
                    borderRadius: RADIUS, border: `1px solid ${on ? C.burgundy : C.rule}`,
                    background: on ? C.burgundy : "transparent", color: on ? "#FFFFFF" : C.ink,
                    fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: "pointer",
                    transition: "background 0.12s, color 0.12s, border-color 0.12s",
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* Context */}
        <div style={{ marginBottom: isMobile ? 32 : 40 }}>
          <label style={label}>Additional context <span style={optional}>(optional)</span></label>
          <textarea
            className="lf-field"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            placeholder="Anything that helps women recommend the right thing: how you'll wear it, what hasn't worked before..."
            style={{ ...input, resize: "none" }}
          />
        </div>

        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em",
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: C.burgundy, border: `1px solid ${C.burgundy}`, borderRadius: RADIUS,
            padding: "15px 18px", cursor: canSubmit ? "pointer" : "default",
            opacity: canSubmit ? 1 : 0.35, transition: "opacity 0.15s",
          }}
        >
          {submitting ? "Posting…" : <>Post to the community <ArrowRight style={{ width: 16, height: 16 }} strokeWidth={2} /></>}
        </button>
      </motion.main>
    </div>
  );
}
