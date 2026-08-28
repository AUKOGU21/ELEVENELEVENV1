// ── RecommendationCard ────────────────────────────────────────────────────────
// One product recommendation on a Looking For post. Like ResponseCard, but the
// product itself (image, brand, name, price) is the centerpiece.
import { ThumbsUp, Check, ExternalLink } from "lucide-react";
import MatchBadge from "./MatchBadge";
import { ProductImage } from "./ProductImage";
import { formatName, getInitials, recommendationLabel, timeAgo } from "@/lib/format";

export interface RecommendationData {
  id: string;
  recommendation: "buy" | "do_not_buy" | string;
  reasoning: string;
  fit_note: string | null;
  who_for: string | null;
  product_url: string | null;
  product_name: string | null;
  brand_name: string | null;
  price_note: string | null;
  product_image_url: string | null;
  match_score: number | null;
  user_id: string;
  created_at: string;
  profiles: { display_name: string | null; avatar_url?: string | null } | null;
}

interface Props {
  rec: RecommendationData;
  counts: { helpful: number; not_helpful: number };
  myVote: "helpful" | "not_helpful" | undefined;
  canVote: boolean;
  onHelpful: (recId: string) => void;
}

const INK = "#1C1712";
const MUTED = "#8C7A70";

export default function RecommendationCard({ rec, counts, myVote, canVote, onHelpful }: Props) {
  const isBuy = rec.recommendation !== "do_not_buy";
  const price = rec.price_note ? (rec.price_note.startsWith("$") ? rec.price_note : `$${rec.price_note}`) : null;
  return (
    <div style={{ background: "rgba(0,0,0,0.035)", borderRadius: 14, padding: "13px 15px", border: "1px solid rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#3A3530", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, color: "white", fontWeight: 700 }}>
            {rec.profiles?.avatar_url
              ? <img src={rec.profiles.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : getInitials(rec.profiles?.display_name ?? null)}
          </div>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1A1A1A" }}>{formatName(rec.profiles?.display_name ?? null)}</span>
            <MatchBadge score={rec.match_score} />
          </div>
        </div>
        <div style={{ flexShrink: 0, borderRadius: 100, padding: "3px 10px", fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap", background: isBuy ? "rgba(22,163,74,0.10)" : "rgba(192,57,43,0.10)", color: isBuy ? "#16a34a" : "#c0392b" }}>
          {recommendationLabel(rec.recommendation)}
        </div>
      </div>

      {/* Reasoning */}
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "#5A4A42", margin: "0 0 10px" }}>{rec.reasoning}</p>

      {/* Product preview tile */}
      {(rec.product_name || rec.brand_name || rec.product_image_url || rec.product_url) && (
        <a
          href={rec.product_url ?? undefined}
          target={rec.product_url ? "_blank" : undefined}
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", background: "#FDFAF6", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 10, marginBottom: rec.fit_note || rec.who_for ? 10 : 12 }}
        >
          <div style={{ width: 54, height: 54, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: "#EDE8E2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ProductImage url={rec.product_image_url} fallback={<ExternalLink style={{ width: 18, height: 18, color: MUTED }} />} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {rec.brand_name && <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.brand_name}</p>}
            {rec.product_name && <p style={{ fontSize: 10.5, color: MUTED, margin: "1px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.product_name}</p>}
            {price && <p style={{ fontSize: 11.5, fontWeight: 600, color: INK, margin: "3px 0 0" }}>{price}</p>}
          </div>
          {rec.product_url && <ExternalLink style={{ width: 15, height: 15, color: MUTED, flexShrink: 0 }} />}
        </a>
      )}

      {/* Fit note / who-for */}
      {(rec.fit_note || rec.who_for) && (
        <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {rec.fit_note && <p style={{ fontSize: 11, color: "#5A4A42", margin: 0 }}><span style={{ color: MUTED }}>Fit —</span> {rec.fit_note}</p>}
          {rec.who_for && <p style={{ fontSize: 11, color: "#5A4A42", margin: 0 }}><span style={{ color: MUTED }}>Best for —</span> {rec.who_for}</p>}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <button
          onClick={() => canVote && onHelpful(rec.id)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 13px", borderRadius: 100,
            border: `1.5px solid ${myVote === "helpful" ? "rgba(58,53,48,0.35)" : "rgba(0,0,0,0.15)"}`,
            background: myVote === "helpful" ? "rgba(58,53,48,0.08)" : "white",
            color: myVote === "helpful" ? "#1A1A1A" : "#5A4A42",
            cursor: canVote ? "pointer" : "default", fontSize: 11, fontWeight: 600, opacity: canVote ? 1 : 0.55,
          }}
        >
          {myVote === "helpful" ? <Check style={{ width: 12, height: 12 }} /> : <ThumbsUp style={{ width: 12, height: 12 }} />}
          <span>Helpful{counts.helpful > 0 ? ` (${counts.helpful})` : ""}</span>
        </button>
        <span style={{ fontSize: 11, color: MUTED }}>{timeAgo(rec.created_at)}</span>
      </div>
    </div>
  );
}
