// ── ResponseCard ──────────────────────────────────────────────────────────────
// One weigh-in, rendered identically wherever it appears (currently the responses
// drawer). Mirrors the card markup that used to live inline in Feed.tsx.
import { ThumbsUp, Check, ExternalLink } from "lucide-react";
import MatchBadge from "./MatchBadge";
import { formatName, getInitials, recommendationLabel, prettyHost, timeAgo } from "@/lib/format";

export interface ResponseCardData {
  id: string;
  recommendation: "buy" | "do_not_buy" | "need_more_info" | string;
  reasoning: string;
  photo_url: string | null;
  product_url: string | null;
  match_score: number | null;
  user_id: string;
  created_at: string;
  profiles: { display_name: string | null; avatar_url?: string | null } | null;
}

interface Props {
  resp: ResponseCardData;
  counts: { helpful: number; not_helpful: number };
  myVote: "helpful" | "not_helpful" | undefined;
  canVote: boolean;
  onHelpful: (responseId: string) => void;
}

export default function ResponseCard({ resp, counts, myVote, canVote, onHelpful }: Props) {
  const isBuy = resp.recommendation === "buy";
  const isNoBuy = resp.recommendation === "do_not_buy";
  return (
    <div style={{ background: "rgba(0,0,0,0.035)", borderRadius: 14, padding: "13px 15px", border: "1px solid rgba(0,0,0,0.06)" }}>
      {/* Header: avatar + name + match + rec badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#3A3530", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "white", fontWeight: 700 }}>
            {resp.profiles?.avatar_url
              ? <img src={resp.profiles.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : getInitials(resp.profiles?.display_name ?? null)}
          </div>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#1A1A1A" }}>{formatName(resp.profiles?.display_name ?? null)}</span>
            <MatchBadge score={resp.match_score} />
          </div>
        </div>
        <div style={{ flexShrink: 0, borderRadius: 100, padding: "3px 10px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", background: isBuy ? "rgba(22,163,74,0.10)" : isNoBuy ? "rgba(192,57,43,0.10)" : "rgba(217,119,6,0.10)", color: isBuy ? "#16a34a" : isNoBuy ? "#c0392b" : "#d97706" }}>
          {recommendationLabel(resp.recommendation)}
        </div>
      </div>

      {/* Reasoning */}
      <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "#5A4A42", margin: "0 0 10px" }}>{resp.reasoning}</p>

      {/* Product link */}
      {resp.product_url && (
        <a href={resp.product_url} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, maxWidth: "100%", padding: "7px 13px", marginBottom: 10, borderRadius: 100, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(0,0,0,0.02)", color: "#3A3530", fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}>
          <ExternalLink style={{ width: 14, height: 14, flexShrink: 0, color: "#8C7A70" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prettyHost(resp.product_url)}</span>
        </a>
      )}

      {/* Photo */}
      {resp.photo_url && (
        <img src={resp.photo_url} alt="response" onClick={() => window.open(resp.photo_url!, "_blank")}
          style={{ height: 120, width: 96, objectFit: "cover", objectPosition: "top", borderRadius: 10, display: "block", marginBottom: 10, cursor: "zoom-in" }} />
      )}

      {/* Footer: helpful + date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <button
          onClick={() => canVote && onHelpful(resp.id)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 13px", borderRadius: 100,
            border: `1.5px solid ${myVote === "helpful" ? "rgba(58,53,48,0.35)" : "rgba(0,0,0,0.15)"}`,
            background: myVote === "helpful" ? "rgba(58,53,48,0.08)" : "white",
            color: myVote === "helpful" ? "#1A1A1A" : "#5A4A42",
            cursor: canVote ? "pointer" : "default",
            fontSize: 13, fontWeight: 600, transition: "all 0.15s",
            opacity: canVote ? 1 : 0.55,
          }}
        >
          {myVote === "helpful" ? <Check style={{ width: 12, height: 12 }} /> : <ThumbsUp style={{ width: 12, height: 12 }} />}
          <span>Helpful{counts.helpful > 0 ? ` (${counts.helpful})` : ""}</span>
        </button>
        <span style={{ fontSize: 13, color: "#8C7A70" }}>{timeAgo(resp.created_at)}</span>
      </div>
    </div>
  );
}
