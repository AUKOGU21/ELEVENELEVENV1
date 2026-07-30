// ── LookingFor (creation) ─────────────────────────────────────────────────────
// Posting flow for a "Looking For" — an earlier decision stage. Not a forum post:
// it always leads toward a shopping decision, so the community answers with
// product recommendations (see RecommendationsDrawer / RecommendationCard).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const INK = "#1C1712";
const CREAM = "#FDFAF6";
const MUTED = "#8C7A70";
const LF = "#7A6AAE";

const PRIORITY_OPTIONS = [
  "Tall friendly", "Petite friendly", "Natural fibers", "Bust support", "Machine washable",
  "Minimal", "Travel", "Workwear", "Running", "Breathable", "Elevated", "Comfortable", "Size inclusive",
];

export default function LookingFor() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
    if (!user) { navigate("/signin"); return; }
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

  const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: INK, margin: "0 0 8px", display: "block" };
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", borderRadius: 12, border: "1px solid rgba(0,0,0,0.14)", background: "#fff", padding: "12px 14px", fontSize: 15, color: INK, fontFamily: "inherit" };

  return (
    <div style={{ minHeight: "100vh", background: CREAM, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
        <button onClick={() => navigate("/feed")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 14 }}>
          <ArrowLeft style={{ width: 16, height: 16 }} /> Feed
        </button>
        <span onClick={() => navigate("/")} style={{ letterSpacing: "0.32em", fontSize: 16, color: INK, cursor: "pointer" }}>
          <span style={{ fontWeight: 700 }}>ELEVEN</span><span style={{ fontWeight: 300 }}>ELEVEN</span>
        </span>
        <div style={{ width: 48 }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ flex: 1, width: "100%", maxWidth: 560, margin: "0 auto", padding: "32px 20px 60px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: LF, background: "rgba(122,106,174,0.12)", border: "1px solid rgba(122,106,174,0.28)", borderRadius: 100, padding: "4px 12px", marginBottom: 14 }}>
          <Search style={{ width: 12, height: 12 }} /> Looking for
        </span>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, color: INK, margin: "0 0 6px", lineHeight: 1.12 }}>What are you looking for?</h1>
        <p style={{ fontSize: 15, color: MUTED, margin: "0 0 26px" }}>Tell the community what you want and get matched product picks from women like you.</p>

        {/* Title */}
        <div style={{ marginBottom: 20 }}>
          <label style={label}>What are you looking for?</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. High-waisted linen pants for summer" style={input} />
        </div>

        {/* Budget + Occasion */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Budget <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. Under $150" style={input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Occasion <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
            <input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. Work, travel" style={input} />
          </div>
        </div>

        {/* Priorities */}
        <div style={{ marginBottom: 22 }}>
          <label style={label}>Priorities</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PRIORITY_OPTIONS.map((p) => {
              const on = priorities.includes(p);
              return (
                <button key={p} onClick={() => togglePriority(p)} style={{
                  fontSize: 13.5, fontWeight: 600, cursor: "pointer", borderRadius: 100, padding: "7px 14px",
                  border: on ? "1px solid transparent" : "1px solid rgba(0,0,0,0.14)",
                  background: on ? LF : "transparent", color: on ? "#fff" : "#5A4A42",
                }}>{p}</button>
              );
            })}
          </div>
        </div>

        {/* Confidence */}
        <div style={{ marginBottom: 22 }}>
          <label style={label}>How sure are you about what you want? <span style={{ color: LF }}>{confidence}/10</span></label>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: 10 }).map((_, i) => {
              const n = i + 1;
              return <button key={n} onClick={() => setConfidence(n)} style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: "1px solid rgba(0,0,0,0.14)", background: n <= confidence ? LF : "#fff", color: n <= confidence ? "#fff" : INK, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{n}</button>;
            })}
          </div>
        </div>

        {/* Context */}
        <div style={{ marginBottom: 28 }}>
          <label style={label}>Additional context <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
          <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={3} placeholder="Anything that helps women recommend the right thing — how you'll wear it, what hasn't worked before..." style={{ ...input, resize: "none" }} />
        </div>

        <button onClick={submit} disabled={!canSubmit} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          background: canSubmit ? INK : "rgba(0,0,0,0.25)", color: CREAM, border: "none", borderRadius: 100,
          padding: "15px 0", fontSize: 16, fontWeight: 600, cursor: canSubmit ? "pointer" : "default",
        }}>
          {submitting ? "Posting…" : <>Post to the community <ArrowRight style={{ width: 17, height: 17 }} /></>}
        </button>
      </motion.div>
    </div>
  );
}
