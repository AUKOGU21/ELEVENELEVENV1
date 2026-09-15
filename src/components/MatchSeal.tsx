// ── MatchSeal ─────────────────────────────────────────────────────────────────
// How closely she matches you: the number in gold, "MATCH" beside it, a thin gold
// rule underneath. Gold rather than burgundy, because burgundy means "do
// something" everywhere else. No shape and no bar: most matches today sit
// between 25 and 60 percent, and a bar that's mostly empty reads as a failing
// grade.
import { DISPLAY, SANS } from "@/lib/design";

const GOLD = "#C49E64";       // the rule
const GOLD_TEXT = "#A57D3E";  // the number: a shade deeper so it holds on paper

interface Props {
  score: number;
  /** Rough visual size; the number is about half of it. */
  size?: number;
  /** Kept for existing callers. The word "match" always shows now. */
  withLabel?: boolean;
  labelSize?: number;
}

export default function MatchSeal({ score, size = 44, labelSize }: Props) {
  const n = Math.round(score);
  const num = Math.max(14, Math.round(size * 0.52));
  const lab = labelSize ?? Math.max(9, Math.round(num * 0.44));
  return (
    <span
      title={`${n}% match`}
      aria-label={`${n}% match`}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", gap: Math.max(3, Math.round(num / 6)), flexShrink: 0, lineHeight: 1 }}
    >
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: DISPLAY, fontSize: num, color: GOLD_TEXT, lineHeight: 1 }}>{n}%</span>
        <span style={{ fontFamily: SANS, fontSize: lab, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#141210" }}>Match</span>
      </span>
      <span aria-hidden style={{ display: "block", height: num >= 20 ? 2 : 1.5, background: GOLD }} />
    </span>
  );
}
