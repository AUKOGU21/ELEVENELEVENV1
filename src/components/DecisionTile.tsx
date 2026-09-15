// ── DecisionTile ──────────────────────────────────────────────────────────────
// A person's decision, as a tile in the feed grid. Visual and spare: who, the
// thing, and one word for where it stands. The concerns, her confidence and the
// conversation live in the decision view, one tap in. Nothing here is a box
// inside a box, a pill or a badge.
import { ArrowRight } from "lucide-react";
import { C, RADIUS, STATE_WORD, body, display, meta, stateColor, strong, type DecisionState } from "@/lib/design";
import { ringStyle } from "@/lib/tiers";
import { formatBudget, formatName, getInitials, timeAgo } from "@/lib/format";

export interface TileDecision {
  id: string;
  user_id: string;
  created_at: string;
  status: string;
  post_type?: string;
  product_name: string | null;
  brand_name: string | null;
  product_image_url: string | null;
  product_image_url_2?: string | null;
  lf_title?: string | null;
  lf_budget?: string | null;
  lf_occasion?: string | null;
  matchScore?: number | null;
  responses?: unknown[] | null;
  recommendations?: unknown[] | null;
  outcomes?: {
    did_purchase: boolean | null;
    outcome_type: string | null;
    alt_product_image_url?: string | null;
  }[] | null;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
    badge_tier?: string | null;
    city: string | null;
  } | null;
}

const RESOLVED = ["purchased", "closed", "outcome_logged"];

export const isResolved = (d: Pick<TileDecision, "status">) => RESOLVED.includes(d.status);

/**
 * Where a decision stands, as one word. Bought means she bought it: "bought
 * something else instead" reads DIDN'T BUY here, and the decision view says what
 * she chose. Your own open post says DECIDING, since you can't weigh in on
 * yourself.
 */
export function decisionState(d: TileDecision, viewerId: string | null): DecisionState {
  const mine = !!viewerId && d.user_id === viewerId;
  const resolved = isResolved(d);
  if (d.post_type === "looking_for") return resolved ? "found" : mine ? "deciding" : "recommend";
  if (!resolved) return mine ? "deciding" : "weigh_in";
  const o = d.outcomes?.[0];
  const bought = d.status === "purchased" || o?.did_purchase === true || o?.outcome_type === "bought_it";
  return bought ? "bought" : "didnt_buy";
}

function footnote(d: TileDecision, state: DecisionState): string {
  if (state === "bought" || state === "didnt_buy" || state === "found") return "See why";
  if (d.post_type === "looking_for") {
    const n = d.recommendations?.length ?? 0;
    return n === 0 ? (state === "recommend" ? "Be the first" : "No picks yet") : `${n} ${n === 1 ? "pick" : "picks"}`;
  }
  const n = d.responses?.length ?? 0;
  return n === 0 ? (state === "weigh_in" ? "Be the first" : "No responses yet") : `${n} ${n === 1 ? "response" : "responses"}`;
}

export function Avatar({ url, name, tier, size }: { url: string | null; name: string | null; tier?: string | null; size: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      background: "#3A3530", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: Math.round(size * 0.32), fontWeight: 700,
      ...ringStyle(tier, size >= 44 ? 2 : 1.5),
    }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(name)}
    </div>
  );
}

const productImg: React.CSSProperties = {
  maxWidth: "100%",
  maxHeight: "100%",
  objectFit: "contain",
  // Product shots arrive on white. Multiply lets them sit on the paper instead
  // of in a white rectangle.
  mixBlendMode: "multiply",
};

interface Props {
  d: TileDecision;
  viewerId: string | null;
  onOpen: (id: string) => void;
  isMobile: boolean;
}

export default function DecisionTile({ d, viewerId, onOpen, isMobile }: Props) {
  const state = decisionState(d, viewerId);
  const isLF = d.post_type === "looking_for";
  const city = d.profiles?.city?.split(",")[0] ?? "";
  const match = d.matchScore != null ? Math.round(d.matchScore) : null;
  const colour = stateColor(state);

  const images = isLF
    ? [d.outcomes?.[0]?.alt_product_image_url].filter(Boolean) as string[]
    : [d.product_image_url, d.product_image_url_2].filter(Boolean) as string[];

  return (
    <article
      className="e11-tile"
      role="button"
      tabIndex={0}
      aria-label={`${formatName(d.profiles?.display_name)}: ${isLF ? d.lf_title ?? "Looking for" : [d.brand_name, d.product_name].filter(Boolean).join(" ")}. ${STATE_WORD[state]}`}
      onClick={() => onOpen(d.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(d.id); } }}
      style={{
        background: "#FBFAF7",
        border: `1px solid ${C.rule}`,
        borderRadius: RADIUS,
        padding: isMobile ? "14px 14px 16px" : "16px 18px 18px",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {/* Who */}
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar url={d.profiles?.avatar_url ?? null} name={d.profiles?.display_name ?? null} tier={d.profiles?.badge_tier} size={isMobile ? 36 : 40} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ ...strong(12), textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {formatName(d.profiles?.display_name)}
          </p>
          {city && <p style={{ ...body(12, C.muted), lineHeight: 1.35, marginTop: 1 }}>{city}</p>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ ...body(11.5, C.muted), lineHeight: 1.35 }}>{timeAgo(d.created_at)}</p>
          {match != null && (
            <p style={{ ...meta(10, C.ink), letterSpacing: "0.08em", marginTop: 2 }}>{match}% match</p>
          )}
        </div>
      </header>

      {/* The thing */}
      <div style={{
        aspectRatio: "4 / 5", margin: isMobile ? "12px 0 12px" : "14px 0 14px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, overflow: "hidden",
      }}>
        {images.length === 2 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", height: "100%", alignItems: "center" }}>
            {images.map((src) => (
              <div key={src} style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img src={src} alt="" loading="lazy" style={productImg} />
              </div>
            ))}
          </div>
        ) : images.length === 1 ? (
          <img src={images[0]} alt="" loading="lazy" style={productImg} />
        ) : isLF ? (
          // No photograph yet: the ask itself is the image.
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
            <p style={meta(10.5, C.muted)}>Looking for</p>
            <p style={{ ...display(isMobile ? 34 : "clamp(28px, 2.6vw, 38px)"), lineHeight: 0.95, overflowWrap: "anywhere" }}>
              {d.lf_title || "Recommendations"}
            </p>
            {(d.lf_budget || d.lf_occasion) && (
              <p style={meta(10.5, C.inkSoft)}>
                {[d.lf_budget && `${formatBudget(d.lf_budget)} budget`, d.lf_occasion].filter(Boolean).join("  /  ")}
              </p>
            )}
          </div>
        ) : (
          <p style={meta(10.5, C.faint)}>No image</p>
        )}
      </div>

      {/* Brand and product, when there is one */}
      {!isLF || images.length > 0 ? (
        <div style={{ minHeight: 34 }}>
          <p style={{ ...strong(12.5), textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {isLF ? (d.lf_title || "Looking for") : (d.brand_name || "")}
          </p>
          <p style={{ ...body(12, C.inkSoft), textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
            {isLF ? "Found it" : (d.product_name || "")}
          </p>
        </div>
      ) : null}

      {/* Where it stands */}
      <footer style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: "auto", paddingTop: 10 }}>
        <span style={{ ...display(isMobile ? 34 : "clamp(30px, 2.7vw, 42px)", colour), lineHeight: 0.85, whiteSpace: "nowrap" }}>
          {STATE_WORD[state]}
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <ArrowRight style={{ width: 20, height: 20, color: colour }} strokeWidth={1.75} />
          <span style={{ ...body(12, C.muted), whiteSpace: "nowrap" }}>{footnote(d, state)}</span>
        </span>
      </footer>
    </article>
  );
}
