// ── DecisionTile ──────────────────────────────────────────────────────────────
// A person's decision, as a tile in the feed grid. Visual and spare: who, the
// thing, and one word for where it stands. The concerns, her confidence and the
// conversation live in the decision view, one tap in. Nothing here is a box
// inside a box, a pill or a badge. The one exception is the gold match seal.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { C, RADIUS, STATE_WORD, body, display, meta, stateColor, strong, type DecisionState } from "@/lib/design";
import { ringStyle } from "@/lib/tiers";
import { formatBudget, formatName, getInitials, timeAgo } from "@/lib/format";
import FollowButton from "./FollowButton";
import MatchSeal from "./MatchSeal";

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
  lf_priorities?: string[] | null;
  matchScore?: number | null;
  responses?: unknown[] | null;
  recommendations?: unknown[] | null;
  outcomes?: {
    did_purchase: boolean | null;
    outcome_type: string | null;
    alt_product_image_url?: string | null;
    kept?: boolean | null;
    arrival_status?: string | null;
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
  if (!bought) return "didnt_buy";
  // Bought and then sent back is its own ending, and the one women most need to see.
  return o?.kept === false || o?.arrival_status === "returned" ? "returned" : "bought";
}

function footnote(d: TileDecision, state: DecisionState): string {
  if (state === "bought" || state === "returned" || state === "didnt_buy" || state === "found") return "See why";
  if (d.post_type === "looking_for") {
    const n = d.recommendations?.length ?? 0;
    return n === 0 ? (state === "recommend" ? "Be the first" : "No recs yet") : `${n} ${n === 1 ? "rec" : "recs"}`;
  }
  const n = d.responses?.length ?? 0;
  return n === 0 ? (state === "weigh_in" ? "Be the first" : "No responses yet") : `${n} ${n === 1 ? "response" : "responses"}`;
}

export function Avatar({ url, name, tier, size, userId }: { url: string | null; name: string | null; tier?: string | null; size: number; userId?: string | null }) {
  const face = (
    <div style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      background: "#3A3530", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: Math.round(size * 0.32), fontWeight: 700,
      ...ringStyle(tier, size >= 44 ? 2 : 1.5),
    }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(name)}
    </div>
  );

  // Inside the feed tile the face has to stay inert: a link within a clickable
  // tile swallows the tile's own tap. Only the views that pass a userId get one.
  if (!userId) return face;

  const label = `See ${formatName(name)}'s profile`;
  return (
    <Link to={`/profile/${userId}`} title={label} aria-label={label}
      style={{ display: "inline-flex", flexShrink: 0, borderRadius: "50%", textDecoration: "none" }}>
      {face}
    </Link>
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

const ADVANCE_MS = 2200;

/**
 * Two photos, each at full size, sliding on their own. Hovering pauses it; on a
 * phone it swipes. A swipe must not also count as a tap on the tile, or every
 * swipe would open the decision.
 */
function TileCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const swiped = useRef(false);
  const n = images.length;

  useEffect(() => {
    if (paused || n < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), ADVANCE_MS);
    return () => clearInterval(t);
  }, [paused, n]);

  const step = (e: React.MouseEvent, dir: number) => {
    e.stopPropagation();
    setI((x) => (x + dir + n) % n);
  };

  const arrow = (side: "left" | "right"): React.CSSProperties => ({
    position: "absolute", top: "50%", [side]: 0, transform: "translateY(-50%)",
    background: "none", border: "none", padding: 8, cursor: "pointer", color: C.ink, lineHeight: 0, zIndex: 2,
  });

  return (
    <div
      className="e11-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; swiped.current = false; setPaused(true); }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 35) {
          swiped.current = true;
          setI((x) => (x + (dx < 0 ? 1 : -1) + n) % n);
        }
        touchX.current = null;
        setPaused(false);
      }}
      onClickCapture={(e) => { if (swiped.current) { e.stopPropagation(); e.preventDefault(); swiped.current = false; } }}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      <div style={{ display: "flex", height: "100%", transform: `translateX(-${i * 100}%)`, transition: "transform .6s cubic-bezier(.2,.7,.2,1)" }}>
        {images.map((src) => (
          <div key={src} style={{ flex: "0 0 100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={src} alt={alt} loading="lazy" style={productImg} />
          </div>
        ))}
      </div>
      <button aria-label="Previous photo" className="e11-carousel-arrow" onClick={(e) => step(e, -1)} style={arrow("left")}>
        <ArrowLeft style={{ width: 18, height: 18 }} strokeWidth={1.5} />
      </button>
      <button aria-label="Next photo" className="e11-carousel-arrow" onClick={(e) => step(e, 1)} style={arrow("right")}>
        <ArrowRight style={{ width: 18, height: 18 }} strokeWidth={1.5} />
      </button>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 4, display: "flex", justifyContent: "center", gap: 6 }} aria-hidden>
        {images.map((src, k) => (
          <span key={src} style={{ width: 16, height: 2, background: k === i ? C.ink : "rgba(20,18,16,0.2)", transition: "background .3s" }} />
        ))}
      </div>
    </div>
  );
}

interface Props {
  d: TileDecision;
  viewerId: string | null;
  onOpen: (id: string) => void;
  isMobile: boolean;
  following?: boolean;
  onToggleFollow?: (targetUserId: string, following: boolean) => void;
  onSignIn?: () => void;
}

export default function DecisionTile({ d, viewerId, onOpen, isMobile, following = false, onToggleFollow, onSignIn }: Props) {
  const state = decisionState(d, viewerId);
  const isLF = d.post_type === "looking_for";
  // Her first priority says what kind of jeans: "Jeans / Tall friendly".
  const lfTop = isLF ? d.lf_priorities?.[0] ?? null : null;
  const city = d.profiles?.city?.split(",")[0] ?? "";
  const match = d.matchScore != null ? Math.round(d.matchScore) : null;
  const colour = stateColor(state);
  const alt = isLF ? (d.lf_title ?? "") : [d.brand_name, d.product_name].filter(Boolean).join(" ");

  const images = isLF
    ? [d.outcomes?.[0]?.alt_product_image_url].filter(Boolean) as string[]
    : [d.product_image_url, d.product_image_url_2].filter(Boolean) as string[];

  return (
    <article
      className="e11-tile"
      role="button"
      tabIndex={0}
      aria-label={`${formatName(d.profiles?.display_name)}: ${isLF ? d.lf_title ?? "Looking for" : alt}. ${STATE_WORD[state]}`}
      onClick={() => onOpen(d.id)}
      onKeyDown={(e) => {
        // Only the tile itself: Enter on its Follow button must not open it.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(d.id); }
      }}
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <p style={{ ...strong(12), textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
              {formatName(d.profiles?.display_name)}
            </p>
            {onToggleFollow && d.user_id !== viewerId && (
              <FollowButton
                targetUserId={d.user_id}
                user={viewerId ? { id: viewerId } : null}
                following={following}
                onChange={onToggleFollow}
                onSignIn={onSignIn}
                size="sm"
                variant="editorial"
              />
            )}
          </div>
          {city && <p style={{ ...body(12, C.muted), lineHeight: 1.35, marginTop: 2 }}>{city}</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          <p style={{ ...body(11.5, C.muted), lineHeight: 1.35 }}>{timeAgo(d.created_at)}</p>
          {match != null && <MatchSeal score={match} size={isMobile ? 32 : 34} withLabel labelSize={9} />}
        </div>
      </header>

      {/* The thing */}
      <div style={{
        position: "relative", aspectRatio: "4 / 5", margin: isMobile ? "12px 0 12px" : "14px 0 14px",
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      }}>
        {images.length >= 2 ? (
          <TileCarousel images={images} alt={alt} />
        ) : images.length === 1 ? (
          <img src={images[0]} alt={alt} loading="lazy" style={productImg} />
        ) : isLF ? (
          // No photograph yet: the ask itself is the image.
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
            <p style={meta(10.5, C.muted)}>Looking for</p>
            <p style={{ ...display(isMobile ? 34 : "clamp(28px, 2.6vw, 38px)"), lineHeight: 0.95, overflowWrap: "anywhere" }}>
              {d.lf_title || "Recommendations"}
            </p>
            {(lfTop || d.lf_budget) && (
              <p style={meta(10.5, C.inkSoft)}>
                {[lfTop, d.lf_budget ? `${formatBudget(d.lf_budget)} budget` : null].filter(Boolean).join("  /  ")}
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
            {isLF ? "Looking for" : (d.brand_name || "")}
          </p>
          <p style={{ ...body(12, C.inkSoft), textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
            {isLF ? [d.lf_title, lfTop].filter(Boolean).join(" / ") : (d.product_name || "")}
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
