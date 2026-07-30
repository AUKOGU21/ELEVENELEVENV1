// ── RecommendationsDrawer ─────────────────────────────────────────────────────
// Right-side drawer holding a Looking For post's product recommendations. Same
// SideDrawer as the responses drawer — this one is about product picks, not
// discussion. Pins what the person is looking for + budget/priorities at the top.
import { useState } from "react";
import { Plus } from "lucide-react";
import SideDrawer from "./SideDrawer";
import RecommendationCard, { RecommendationData } from "./RecommendationCard";
import { formatBudget } from "@/lib/format";

const INK = "#1C1712";
const MUTED = "#8C7A70";
const LF = "#7A6AAE";

export interface LookingForForDrawer {
  id: string;
  user_id: string;
  lf_title: string | null;
  lf_budget: string | null;
  lf_priorities: string[] | null;
  recommendations: RecommendationData[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  lookingFor: LookingForForDrawer | null;
  user: { id: string } | null;
  voteCounts: Record<string, { helpful: number; not_helpful: number }>;
  userVotes: Record<string, "helpful" | "not_helpful">;
  onHelpful: (recId: string) => void;
  onAddRecommendation: (lookingForId: string) => void;
  onSignIn: () => void;
}

type FilterKey = "all" | "buy" | "do_not_buy";

export default function RecommendationsDrawer({
  open, onClose, lookingFor, user, voteCounts, userVotes, onHelpful, onAddRecommendation, onSignIn,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  if (!lookingFor) return <SideDrawer open={open} onClose={onClose} title="Recommendations">{null}</SideDrawer>;

  const isOwner = user?.id === lookingFor.user_id;
  const sorted = [...(lookingFor.recommendations ?? [])].sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
  const buyCount = sorted.filter((r) => r.recommendation !== "do_not_buy").length;
  const noBuyCount = sorted.filter((r) => r.recommendation === "do_not_buy").length;
  const shown = filter === "all" ? sorted : filter === "buy" ? sorted.filter((r) => r.recommendation !== "do_not_buy") : sorted.filter((r) => r.recommendation === "do_not_buy");
  const count = sorted.length;

  const chip = (key: FilterKey, label: string, n: number) => {
    const active = filter === key;
    return (
      <button key={key} onClick={() => setFilter(key)} style={{
        padding: "6px 14px", borderRadius: 100, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
        border: active ? "1px solid transparent" : "1px solid rgba(0,0,0,0.12)",
        background: active ? INK : "transparent", color: active ? "#FDFAF6" : "#5A4A42",
      }}>{label} ({n})</button>
    );
  };

  const pinned = (
    <div>
      <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: LF, margin: "0 0 5px" }}>Looking for</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.35 }}>{lookingFor.lf_title || "Recommendations"}</p>
      {(lookingFor.lf_budget || (lookingFor.lf_priorities && lookingFor.lf_priorities.length > 0)) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
          {lookingFor.lf_budget && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "#5A4A42", background: "rgba(0,0,0,0.05)", borderRadius: 100, padding: "3px 10px" }}>{formatBudget(lookingFor.lf_budget)}</span>
          )}
          {(lookingFor.lf_priorities ?? []).map((p) => (
            <span key={p} style={{ fontSize: 12, fontWeight: 600, color: LF, background: "rgba(122,106,174,0.12)", border: "1px solid rgba(122,106,174,0.25)", borderRadius: 100, padding: "3px 10px" }}>{p}</span>
          ))}
        </div>
      )}
    </div>
  );

  const footer = isOwner ? null : user ? (
    <>
      <button onClick={() => { onAddRecommendation(lookingFor.id); onClose(); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: INK, color: "#FDFAF6", border: "none", borderRadius: 100, padding: "13px 0", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
        <Plus style={{ width: 17, height: 17 }} /> Add a recommendation
      </button>
      <p style={{ fontSize: 12.5, color: MUTED, textAlign: "center", margin: "9px 0 0" }}>Share a product link and why you recommend it.</p>
    </>
  ) : (
    <button onClick={onSignIn} style={{ width: "100%", background: INK, color: "#FDFAF6", border: "none", borderRadius: 100, padding: "13px 0", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
      Sign in to recommend
    </button>
  );

  return (
    <SideDrawer open={open} onClose={onClose} title="Recommendations" subtitle={`${count} recommendation${count === 1 ? "" : "s"}`} pinned={pinned} footer={footer}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {chip("all", "All", count)}
        {chip("buy", "Would buy", buyCount)}
        {chip("do_not_buy", "Wouldn't buy", noBuyCount)}
      </div>
      {shown.length === 0 ? (
        <p style={{ fontSize: 14, color: MUTED, textAlign: "center", padding: "28px 0" }}>
          {count === 0 ? "No recommendations yet — be the first to share a pick." : "None in this filter."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {shown.map((rec) => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              counts={voteCounts[rec.id] ?? { helpful: 0, not_helpful: 0 }}
              myVote={userVotes[rec.id]}
              canVote={!!user && rec.user_id !== user.id}
              onHelpful={onHelpful}
            />
          ))}
        </div>
      )}
    </SideDrawer>
  );
}
