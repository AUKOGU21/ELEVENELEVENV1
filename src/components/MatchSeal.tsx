// ── MatchSeal ─────────────────────────────────────────────────────────────────
// How closely she matches you, as a gold seal rather than a pill: a scalloped
// stamp, the way a fashion site marks something new. It's the one shape in the
// system that isn't a rule or a letter, so the number reads first.
import { DISPLAY, SANS } from "@/lib/design";

const GOLD = "#C49E64";

// An 18-scallop edge on a 100-unit box: points on an inner ring, each joined to
// the next by a curve pulled out toward the rim.
const SEAL = (() => {
  const N = 18, r = 42, R = 50;
  const pt = (rad: number, i: number) => {
    const a = (2 * Math.PI * i) / N - Math.PI / 2;
    return `${(50 + rad * Math.cos(a)).toFixed(2)},${(50 + rad * Math.sin(a)).toFixed(2)}`;
  };
  let d = `M${pt(r, 0)}`;
  for (let i = 0; i < N; i++) d += ` Q${pt(R, i + 0.5)} ${pt(r, i + 1)}`;
  return `${d} Z`;
})();

interface Props {
  score: number;
  size?: number;
  /** The word "match" beside the seal, for places that introduce it. */
  withLabel?: boolean;
  labelSize?: number;
}

export default function MatchSeal({ score, size = 44, withLabel = false, labelSize = 10.5 }: Props) {
  const n = Math.round(score);
  return (
    <span
      title={`${n}% match`}
      aria-label={`${n}% match`}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0, lineHeight: 0 }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block", flexShrink: 0 }}>
        <path d={SEAL} fill={GOLD} />
        <text
          x="50" y="52"
          textAnchor="middle" dominantBaseline="central"
          fontFamily={DISPLAY} fontSize={n >= 100 ? 29 : 35} fill="#141210"
        >
          {n}%
        </text>
      </svg>
      {withLabel && (
        <span style={{ fontFamily: SANS, fontSize: labelSize, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#141210", lineHeight: 1 }}>
          Match
        </span>
      )}
    </span>
  );
}
