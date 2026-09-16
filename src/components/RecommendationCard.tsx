// ── RecommendationCard ────────────────────────────────────────────────────────
// One product recommendation on a Looking For post, drawn the way LookingForView
// draws its picks: the woman who sent it, how closely she matches, her verdict,
// then the product itself. No card around it. A rule underneath instead.
import { Check, ExternalLink, ThumbsUp } from "lucide-react";
import { C, body, meta, strong } from "@/lib/design";
import { formatName, prettyHost, recommendationLabel, timeAgo } from "@/lib/format";
import { Avatar } from "./DecisionTile";
import MatchSeal from "./MatchSeal";

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
  profiles: { display_name: string | null; avatar_url?: string | null; badge_tier?: string | null } | null;
}

interface Props {
  rec: RecommendationData;
  counts: { helpful: number; not_helpful: number };
  myVote: "helpful" | "not_helpful" | undefined;
  canVote: boolean;
  onHelpful: (recId: string) => void;
}

const textLink = (colour: string = C.ink): React.CSSProperties => ({
  ...meta(11, colour),
  fontWeight: 700,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  textDecoration: "none",
});

export default function RecommendationCard({ rec, counts, myVote, canVote, onHelpful }: Props) {
  const price = rec.price_note ? (rec.price_note.startsWith("$") ? rec.price_note : `$${rec.price_note}`) : null;
  const hasProduct = !!(rec.product_name || rec.brand_name || rec.product_image_url || rec.product_url);

  // The product row is only a link when there is somewhere to go. It used to
  // render as an anchor whenever any product field was set, so a pick with only
  // a brand name looked tappable and went nowhere.
  const productRow = hasProduct && (
    <>
      <div style={{ background: C.well, aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {rec.product_image_url
          ? <img src={rec.product_image_url} alt="" loading="lazy" style={{ maxWidth: "88%", maxHeight: "88%", objectFit: "contain", mixBlendMode: "multiply" }} />
          : <span style={meta(9, C.faint)}>{rec.product_url ? "Link" : "No image"}</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        {rec.brand_name && <p style={{ ...strong(12.5), textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.brand_name}</p>}
        {rec.product_name && <p style={{ ...body(12, C.inkSoft), textTransform: "uppercase", letterSpacing: "0.03em", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.product_name}</p>}
        <p style={{ ...meta(10, C.ink), marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {price && <span style={{ ...body(12.5, C.ink), textTransform: "none", letterSpacing: 0, marginRight: 8 }}>{price}</span>}
          {rec.product_url && <><ExternalLink style={{ width: 11, height: 11 }} /> {prettyHost(rec.product_url)}</>}
        </p>
      </div>
    </>
  );

  const productGrid: React.CSSProperties = {
    display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "center", marginTop: 13,
  };

  return (
    <div style={{ paddingTop: 20, paddingBottom: 20, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", gap: 12 }}>
        <Avatar url={rec.profiles?.avatar_url ?? null} name={rec.profiles?.display_name ?? null} tier={rec.profiles?.badge_tier} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 6, minWidth: 0 }}>
              <span style={{ ...strong(12.5), textTransform: "uppercase", letterSpacing: "0.05em" }}>{formatName(rec.profiles?.display_name ?? null)}</span>
              {rec.match_score != null && <MatchSeal score={rec.match_score} size={28} />}
              <span style={{ ...meta(10, C.ink), fontWeight: 700 }}>{recommendationLabel(rec.recommendation)}</span>
            </div>
            <span style={{ ...body(12, C.muted), whiteSpace: "nowrap", flexShrink: 0 }}>{timeAgo(rec.created_at)}</span>
          </div>

          <p style={{ ...body(14, C.ink), marginTop: 10 }}>{rec.reasoning}</p>

          {hasProduct && (
            rec.product_url ? (
              <a
                href={rec.product_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...productGrid, textDecoration: "none", color: "inherit" }}
              >
                {productRow}
              </a>
            ) : (
              <div style={productGrid}>{productRow}</div>
            )
          )}

          {(rec.fit_note || rec.who_for) && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {rec.fit_note && <p style={body(13, C.inkSoft)}><span style={{ ...meta(10, C.muted), marginRight: 10 }}>Fit</span>{rec.fit_note}</p>}
              {rec.who_for && <p style={body(13, C.inkSoft)}><span style={{ ...meta(10, C.muted), marginRight: 10 }}>Best for</span>{rec.who_for}</p>}
            </div>
          )}

          <button
            onClick={() => canVote && onHelpful(rec.id)}
            disabled={!canVote}
            style={{ ...textLink(myVote === "helpful" ? C.burgundy : C.ink), marginTop: 14, cursor: canVote ? "pointer" : "default", opacity: canVote || counts.helpful > 0 ? 1 : 0.5 }}
          >
            {myVote === "helpful" ? <Check style={{ width: 13, height: 13 }} /> : <ThumbsUp style={{ width: 13, height: 13 }} strokeWidth={1.75} />}
            Helpful{counts.helpful > 0 ? ` (${counts.helpful})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
