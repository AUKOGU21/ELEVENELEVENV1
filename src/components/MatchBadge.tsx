// Match-strength badge — single source of truth for weigh-in / recommendation
// renderers outside Feed.tsx. taupe/flat (low) → gold glow → rose glow (strong).
export default function MatchBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const m = Math.round(score);
  let col: string, bg: string, bd: string, glow: string;
  if (m >= 70) { col = "#9B2F63"; bg = "rgba(190,70,130,0.14)"; bd = "rgba(190,70,130,0.55)"; glow = "0 0 16px rgba(190,70,130,0.55)"; }
  else if (m >= 45) { col = "#8A6620"; bg = "rgba(196,158,100,0.16)"; bd = "rgba(196,158,100,0.6)"; glow = "0 0 12px rgba(196,158,100,0.45)"; }
  else { col = "#7C7066"; bg = "rgba(124,112,102,0.10)"; bd = "rgba(124,112,102,0.35)"; glow = "none"; }
  return (
    <span style={{
      marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 12, fontWeight: 800, letterSpacing: "0.02em",
      padding: "2px 10px", borderRadius: 100,
      color: col, background: bg, border: `1px solid ${bd}`, boxShadow: glow,
    }}>✦ {m}% match</span>
  );
}
