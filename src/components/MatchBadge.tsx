// ── MatchBadge ────────────────────────────────────────────────────────────────
// The same seal the rest of the app uses, for the callers that hold a score that
// may be null. MatchSeal is the treatment: a gold number, "match" beside it, a
// thin gold rule under both. Gold stays reserved for the match score.
import MatchSeal from "./MatchSeal";

export default function MatchBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", marginLeft: 10 }}>
      <MatchSeal score={score} size={26} />
    </span>
  );
}
