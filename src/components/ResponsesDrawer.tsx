// ── ResponsesDrawer ───────────────────────────────────────────────────────────
// The right-side drawer that holds a decision's weigh-ins. Pins the original
// shopping question + confidence at the top, offers Would/Wouldn't filters, and
// lists every response via the shared ResponseCard. Built on SideDrawer, so the
// feed stays put behind it. (Looking For will reuse SideDrawer for recommendations.)
import { useState } from "react";
import { Plus } from "lucide-react";
import SideDrawer from "./SideDrawer";
import ResponseCard, { ResponseCardData } from "./ResponseCard";

const INK = "#1C1712";
const MUTED = "#8C7A70";

export interface ResponsesDrawerDecision {
  id: string;
  status: string;
  user_id: string;
  confidence_score: number | null;
  uncertainty_text: string | null;
  product_name: string | null;
  brand_name: string | null;
  responses: ResponseCardData[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  decision: ResponsesDrawerDecision | null;
  user: { id: string } | null;
  voteCounts: Record<string, { helpful: number; not_helpful: number }>;
  userVotes: Record<string, "helpful" | "not_helpful">;
  onHelpful: (responseId: string) => void;
  onAddThoughts: (decisionId: string) => void;
  onSignIn: () => void;
  onSubmitReply: (responseId: string, body: string) => Promise<void>;
  onDeleteReply: (replyId: string) => Promise<void>;
  onEditReply: (replyId: string, body: string) => Promise<void>;
  focusResponseId?: string | null;
}

type FilterKey = "all" | "buy" | "do_not_buy";

export default function ResponsesDrawer({
  open, onClose, decision, user, voteCounts, userVotes, onHelpful, onAddThoughts, onSignIn, onSubmitReply, onDeleteReply, onEditReply, focusResponseId,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  if (!decision) return <SideDrawer open={open} onClose={onClose} title="Responses">{null}</SideDrawer>;

  const isClosed = decision.status === "purchased" || decision.status === "closed";
  const isOwner = user?.id === decision.user_id;

  // Sort strongest match first, matching the feed's ordering.
  const sorted = [...(decision.responses ?? [])].sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
  const buyCount = sorted.filter((r) => r.recommendation === "buy").length;
  const noBuyCount = sorted.filter((r) => r.recommendation === "do_not_buy").length;
  const shown = filter === "all" ? sorted : sorted.filter((r) => r.recommendation === filter);

  const title = isClosed ? "What women like you said" : "What women like you are saying";
  const count = sorted.length;

  const question = (decision.uncertainty_text ?? "").trim();
  const confidence = decision.confidence_score ?? null;

  const chip = (key: FilterKey, label: string, n: number) => {
    const active = filter === key;
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        style={{
          padding: "6px 14px", borderRadius: 100, cursor: "pointer",
          fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          border: active ? "1px solid transparent" : "1px solid rgba(0,0,0,0.12)",
          background: active ? INK : "transparent",
          color: active ? "#FDFAF6" : "#5A4A42",
        }}
      >
        {label} ({n})
      </button>
    );
  };

  const pinned = (
    <div>
      <p style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, margin: "0 0 5px" }}>
        {isClosed ? "Was deciding about" : "The question"}
      </p>
      <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.35 }}>
        {question || (decision.brand_name || decision.product_name || "This decision")}
      </p>
      {confidence != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
          <span style={{ fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>Confidence when posted</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#3A3530" }}>{confidence}/10</span>
          <div style={{ display: "flex", gap: 2 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ width: 4, height: 12, borderRadius: 2, background: i < confidence ? "#3A3530" : "rgba(0,0,0,0.12)" }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const footer = isOwner ? null : user ? (
    <>
      <button
        onClick={() => { onAddThoughts(decision.id); onClose(); }}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: INK, color: "#FDFAF6", border: "none", borderRadius: 100, padding: "13px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        <Plus style={{ width: 17, height: 17 }} /> Add your thoughts
      </button>
      <p style={{ fontSize: 10.5, color: MUTED, textAlign: "center", margin: "9px 0 0" }}>
        Share your experience to help other women decide.
      </p>
    </>
  ) : (
    <button
      onClick={() => { onSignIn(); }}
      style={{ width: "100%", background: INK, color: "#FDFAF6", border: "none", borderRadius: 100, padding: "13px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
    >
      Sign in to weigh in
    </button>
  );

  return (
    <SideDrawer open={open} onClose={onClose} title={title} subtitle={`${count} response${count === 1 ? "" : "s"}`} pinned={pinned} footer={footer}>
      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {chip("all", "All", count)}
        {chip("buy", "Would buy", buyCount)}
        {chip("do_not_buy", "Wouldn't buy", noBuyCount)}
      </div>

      {/* Responses */}
      {shown.length === 0 ? (
        <p style={{ fontSize: 12, color: MUTED, textAlign: "center", padding: "28px 0" }}>
          {count === 0 ? "No responses yet — be the first to weigh in." : "None in this filter."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {shown.map((resp) => (
            <ResponseCard
              key={resp.id}
              resp={resp}
              counts={voteCounts[resp.id] ?? { helpful: 0, not_helpful: 0 }}
              myVote={userVotes[resp.id]}
              canVote={!!user && resp.user_id !== user.id}
              onHelpful={onHelpful}
              user={user}
              onSubmitReply={onSubmitReply}
              onDeleteReply={onDeleteReply}
              onEditReply={onEditReply}
              onSignIn={onSignIn}
              focused={focusResponseId === resp.id}
            />
          ))}
        </div>
      )}
    </SideDrawer>
  );
}
