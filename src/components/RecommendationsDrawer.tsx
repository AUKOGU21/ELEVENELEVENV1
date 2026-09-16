// ── RecommendationsDrawer ─────────────────────────────────────────────────────
// Right-side drawer holding a Looking For post's product recommendations. Same
// SideDrawer as the responses drawer. This one is about product picks, not
// discussion. Pins what the person is looking for, plus budget and priorities.
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { C, RADIUS, body, meta, strong } from "@/lib/design";
import SideDrawer from "./SideDrawer";
import RecommendationCard, { RecommendationData } from "./RecommendationCard";
import { formatBudget } from "@/lib/format";

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

// Square, filled. Matches LookingForView's squareBtn.
const squareBtn = (colour: string = C.ink): React.CSSProperties => ({
  ...meta(12, "#FFFFFF"),
  fontWeight: 700,
  letterSpacing: "0.16em",
  width: "100%",
  background: colour,
  border: `1px solid ${colour}`,
  borderRadius: RADIUS,
  padding: "15px 18px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
});

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

  // Filters are words with a rule under the live one, not pills.
  const tab = (key: FilterKey, label: string, n: number) => {
    const active = filter === key;
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        style={{
          ...meta(10.5, active ? C.ink : C.muted),
          fontWeight: active ? 700 : 600,
          background: "none",
          border: "none",
          padding: "0 0 5px",
          cursor: "pointer",
          borderBottom: `1px solid ${active ? C.ink : "transparent"}`,
        }}
      >
        {label} ({n})
      </button>
    );
  };

  const priorities = lookingFor.lf_priorities ?? [];

  const pinned = (
    <div>
      <p style={{ ...meta(10, C.burgundy), marginBottom: 8 }}>Looking for</p>
      <p style={{ ...strong(14), lineHeight: 1.35 }}>{lookingFor.lf_title || "Recommendations"}</p>
      {(lookingFor.lf_budget || priorities.length > 0) && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
          {lookingFor.lf_budget && (
            <p style={body(12.5, C.inkSoft)}>
              <span style={{ ...meta(10, C.muted), marginRight: 10 }}>Budget</span>{formatBudget(lookingFor.lf_budget)}
            </p>
          )}
          {priorities.length > 0 && (
            <p style={body(12.5, C.inkSoft)}>
              <span style={{ ...meta(10, C.muted), marginRight: 10 }}>Priorities</span>{priorities.join("  /  ")}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const footer = isOwner ? null : user ? (
    <>
      <button onClick={() => { onAddRecommendation(lookingFor.id); onClose(); }} style={squareBtn(C.burgundy)}>
        Add a recommendation <ArrowRight style={{ width: 15, height: 15 }} />
      </button>
      <p style={{ ...body(11.5, C.muted), textAlign: "center", margin: "10px 0 0" }}>Share a product link and why you recommend it.</p>
    </>
  ) : (
    <button onClick={onSignIn} style={squareBtn(C.burgundy)}>
      Sign in to recommend
    </button>
  );

  return (
    <SideDrawer open={open} onClose={onClose} title="Recommendations" subtitle={`${count} recommendation${count === 1 ? "" : "s"}`} pinned={pinned} footer={footer}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "16px 0 0", borderBottom: `1px solid ${C.rule}` }}>
        {tab("all", "All", count)}
        {tab("buy", "Would buy", buyCount)}
        {tab("do_not_buy", "Wouldn't buy", noBuyCount)}
      </div>
      {shown.length === 0 ? (
        <p style={{ ...body(13.5, C.muted), padding: "28px 0" }}>
          {count === 0 ? "No recommendations yet. Be the first to share a pick." : "None in this filter."}
        </p>
      ) : (
        <div>
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
