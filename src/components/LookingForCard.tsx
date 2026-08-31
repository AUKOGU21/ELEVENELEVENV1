// ── LookingForCard ────────────────────────────────────────────────────────────
// The second feed post type. "What should I buy?" — the left side states what the
// person wants (title, budget, priorities, confidence); the right side fills with
// community product recommendations as they come in. Visually distinct from a
// Decision card (violet accent) but part of the same product.
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Bookmark, MoreHorizontal, ArrowRight, Search, Users, Check, ExternalLink } from "lucide-react";
import { formatName, getInitials, timeAgo, formatBudget } from "@/lib/format";
import { pullProduct, type PulledProduct } from "@/lib/productPull";
import MatchBadge from "./MatchBadge";
import { ProductImage } from "./ProductImage";
import type { RecommendationData } from "./RecommendationCard";

const INK = "#1A1A1A";
const MUTED = "#8C7A70";
const LF = "#7A6AAE";
const OLIVE = "#6E7A44";

// "Maya C.'s rec" reads badly — possessives use the first name only.
const firstNameOf = (n: string | null | undefined) => (n || "").trim().split(/\s+/)[0] || "She";

const LBL: React.CSSProperties = { fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, margin: 0 };
const BTN_DARK: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "none", background: "#1C1712", color: "#FDFAF6", fontSize: 11.5, fontWeight: 600, cursor: "pointer" };
const BTN_OUTLINE: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "1px solid #1C1712", background: "transparent", color: "#1C1712", fontSize: 11.5, fontWeight: 600, cursor: "pointer" };
const BTN_GHOST: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "transparent", color: MUTED, fontSize: 11.5, fontWeight: 600, cursor: "pointer" };
const LINK_INPUT: React.CSSProperties = { width: "100%", maxWidth: 520, boxSizing: "border-box", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(196,158,100,0.5)", background: "#fff", fontSize: 12.5, fontFamily: "inherit", color: INK };

// What she ended up buying, once she's logged it.
export interface LookingForOutcome {
  chosen_recommendation_id?: string | null;
  confidence_after?: number | null;
  alt_product_url?: string | null;
  alt_product_name?: string | null;
  alt_product_image_url?: string | null;
  alt_brand_name?: string | null;
  alt_price_note?: string | null;
  bought_alternative?: boolean | null;
}

export interface LookingForFoundPayload {
  chosenRecommendationId: string | null;
  // True when she bought the exact piece someone recommended.
  boughtExact: boolean;
  productUrl: string | null;
  productName: string | null;
  productBrand: string | null;
  productPrice: string | null;
  productImageUrl: string | null;
  confidenceAfter: number;
}

export interface LookingForDecision {
  id: string;
  user_id: string;
  created_at: string;
  status: string;
  confidence_score: number | null;
  lf_title: string | null;
  lf_budget: string | null;
  lf_occasion: string | null;
  lf_priorities: string[] | null;
  lf_context: string | null;
  matchScore?: number | null;
  recommendations: RecommendationData[];
  outcomes?: LookingForOutcome[] | null;
  profiles: { display_name: string | null; avatar_url: string | null; city: string | null } | null;
}

interface Props {
  decision: LookingForDecision;
  user: { id: string } | null;
  isMobile: boolean;
  activeTab: "feed" | "mine";
  isSaved: boolean;
  onSave: () => void;
  onHide: () => void;
  navigate: (path: string) => void;
  handleDelete: (id: string) => void;
  onOpenRecommendations: () => void;
  onAddRecommendation: () => void;
  onSignIn: () => void;
  // Logs what she bought and closes the post. Optional so other callers of this
  // card (profiles, drawers) don't have to supply it.
  onFound?: (id: string, payload: LookingForFoundPayload) => void;
  // Called when a slow link read lands after she already finished, so the saved
  // row gets its brand / price / image instead of losing them to the race.
  onProductPulled?: (id: string, pulled: PulledProduct) => void;
  onStillLooking?: (id: string) => void;
}

type FoundStep = "idle" | "pick" | "same_or_diff" | "link" | "confidence" | "thanks" | "snoozed";

export default function LookingForCard({
  decision, user, isMobile, activeTab, isSaved, onSave, onHide, navigate, handleDelete, onOpenRecommendations, onAddRecommendation, onSignIn, onFound, onProductPulled, onStillLooking,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── "Did you find it?" flow ────────────────────────────────────────────────
  const [step, setStep] = useState<FoundStep>("idle");
  const [picked, setPicked] = useState<RecommendationData | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [pulled, setPulled] = useState<PulledProduct | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullFailed, setPullFailed] = useState(false);
  const pulledUrlRef = useRef<string | null>(null);
  // Set when she picked a rec but bought a different piece from that brand.
  const [differentPiece, setDifferentPiece] = useState(false);
  // The in-flight link read, and whether she's already finished the flow.
  const pullPromiseRef = useRef<Promise<PulledProduct | null> | null>(null);
  const submittedRef = useRef(false);
  const isOwn = user?.id === decision.user_id;
  const confidence = decision.confidence_score ?? 0;
  const recs = decision.recommendations ?? [];
  const posterName = formatName(decision.profiles?.display_name ?? null);
  const posterCity = decision.profiles?.city?.split(",")[0] ?? "";

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const outcome = decision.outcomes?.[0] ?? null;
  const isFound = decision.status === "closed" && !!outcome;
  const winnerId = outcome?.chosen_recommendation_id ?? null;
  const confAfter = outcome?.confidence_after ?? null;
  const boughtBrand = outcome?.alt_brand_name ?? null;
  const boughtName = outcome?.alt_product_name ?? null;
  const boughtPrice = outcome?.alt_price_note ?? null;
  const boughtImage = outcome?.alt_product_image_url ?? null;
  const boughtUrl = outcome?.alt_product_url ?? null;
  const boughtHost = (() => {
    if (!boughtUrl) return null;
    try { return new URL(boughtUrl).hostname.replace(/^www\./, ""); } catch { return null; }
  })();
  const winner = winnerId ? recs.find((r) => r.id === winnerId) ?? null : null;

  // Read the pasted link the same way the Passed flow does. Never blocks her.
  const readLink = async (raw: string): Promise<PulledProduct | null> => {
    const key = raw.trim();
    if (!key) return null;
    if (pulledUrlRef.current === key) return pulled;
    pulledUrlRef.current = key;
    setPulling(true);
    setPullFailed(false);
    const promise = pullProduct(key);
    pullPromiseRef.current = promise;
    const got = await promise;
    setPulling(false);
    if (!got) { setPullFailed(true); setPulled(null); return null; }
    setPulled(got);
    // She may have finished before this came back — patch the saved row.
    if (submittedRef.current) onProductPulled?.(decision.id, got);
    return got;
  };

  const submitFound = (confidence: number) => {
    submittedRef.current = true;
    const exact = !!picked && !differentPiece;
    onFound?.(decision.id, {
      chosenRecommendationId: picked?.id ?? null,
      boughtExact: exact,
      productUrl: exact ? picked?.product_url ?? null : (linkUrl.trim() || null),
      productName: exact ? picked?.product_name ?? null : (pulled?.name ?? null),
      productBrand: exact ? picked?.brand_name ?? null : (pulled?.brand ?? null),
      productPrice: exact ? picked?.price_note ?? null : (pulled?.price ?? null),
      productImageUrl: exact ? picked?.product_image_url ?? null : (pulled?.image_url ?? null),
      confidenceAfter: confidence,
    });
    setStep("thanks");
  };

  const priorities = decision.lf_priorities ?? [];
  const statRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0" }}>
      <span style={{ width: 74, flexShrink: 0, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: MUTED, paddingTop: 1 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "#3A3530", fontWeight: 500 }}>{value}</span>
    </div>
  );

  const tile = (rec: RecommendationData) => {
    const price = rec.price_note ? (rec.price_note.startsWith("$") ? rec.price_note : `$${rec.price_note}`) : null;
    const selectable = step === "pick";
    const isWinner = isFound && winnerId === rec.id;
    return (
      <button
        key={rec.id}
        onClick={selectable ? () => { setPicked(rec); setStep("same_or_diff"); } : onOpenRecommendations}
        style={{
          textAlign: "left", background: "#FDFAF6",
          border: isWinner ? `2px solid ${OLIVE}` : selectable ? `1.5px solid ${LF}` : "1px solid rgba(0,0,0,0.07)",
          borderRadius: 12, overflow: "hidden", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ width: "100%", aspectRatio: "4 / 5", background: "#EDE8E2", overflow: "hidden", position: "relative" }}>
          <ProductImage url={rec.product_image_url} fallback={<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}><Search style={{ width: 20, height: 20 }} /></div>} />
          {isWinner && (
            <span style={{ position: "absolute", top: 8, left: 8, background: OLIVE, color: "#F4EEE6", fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", borderRadius: 100, padding: "3px 9px", zIndex: 2 }}>✦ Her pick</span>
          )}
          {selectable && <span style={{ position: "absolute", inset: 0, background: "rgba(122,106,174,0.10)" }} />}
        </div>
        <div style={{ padding: "8px 10px 10px" }}>
          {rec.brand_name && <p style={{ fontSize: 11, fontWeight: 700, color: INK, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.brand_name}</p>}
          {rec.product_name && <p style={{ fontSize: 10, color: MUTED, margin: "1px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.product_name}</p>}
          {price && <p style={{ fontSize: 11, fontWeight: 600, color: INK, margin: "3px 0 0" }}>{price}</p>}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#3A3530", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff", fontWeight: 700 }}>
              {rec.profiles?.avatar_url ? <img src={rec.profiles.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(rec.profiles?.display_name ?? null)}
            </div>
            <span style={{ fontSize: 9.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Rec. by {formatName(rec.profiles?.display_name ?? null)}</span>
          </div>
          {isWinner && (
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(110,122,68,0.12)", border: "1px solid rgba(110,122,68,0.3)", color: OLIVE, borderRadius: 100, padding: "3px 9px", fontSize: 9.5, fontWeight: 700 }}>
              <Check style={{ width: 10, height: 10 }} /> Found through {firstNameOf(rec.profiles?.display_name)}'s rec
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div style={{ background: "#F5EFEA", borderRadius: 20, boxShadow: "0 6px 24px rgba(0,0,0,0.08)", overflow: "visible", marginBottom: 20, position: "relative" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "10px 12px 8px" : "14px 16px 12px" }}>
        <div style={{ width: isMobile ? 44 : 56, height: isMobile ? 44 : 56, borderRadius: "50%", background: "#3A3530", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 13 : 16, color: "white", fontWeight: 700, flexShrink: 0, overflow: "hidden" }}>
          {decision.profiles?.avatar_url ? <img src={decision.profiles.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{getInitials(decision.profiles?.display_name ?? null)}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ fontSize: isMobile ? 12 : 13.5, fontWeight: 700, color: INK, lineHeight: 1.2, margin: 0 }}>{posterName}</p>
            {isFound ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: OLIVE, background: "rgba(110,122,68,0.12)", border: "1px solid rgba(110,122,68,0.3)", borderRadius: 100, padding: "2px 9px" }}>
                <Check style={{ width: 10, height: 10 }} /> Found it
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: LF, background: "rgba(122,106,174,0.12)", border: "1px solid rgba(122,106,174,0.28)", borderRadius: 100, padding: "2px 9px" }}>
                <Search style={{ width: 10, height: 10 }} /> Looking for
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
            {posterCity && <span style={{ fontSize: isMobile ? 11 : 12, color: MUTED }}>{posterCity}</span>}
            {decision.matchScore != null && <MatchBadge score={decision.matchScore} />}
          </div>
          <button onClick={() => navigate(isOwn ? "/profile" : `/profile/${decision.user_id}`)} style={{ display: "flex", alignItems: "center", gap: 3, color: MUTED, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}>
            <span style={{ fontSize: isMobile ? 10 : 12 }}>{isOwn ? "Your profile" : "See her profile"}</span>
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: isMobile ? 10 : 12, color: MUTED }}>{timeAgo(decision.created_at)}</span>
          <button onClick={onSave} title={isSaved ? "Unsave" : "Save"} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.10)", background: isSaved ? "rgba(196,158,100,0.12)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Bookmark style={{ width: 14, height: 14, color: isSaved ? "#C49E64" : MUTED, fill: isSaved ? "#C49E64" : "none" }} />
          </button>
          <div style={{ position: "relative" }} ref={menuRef}>
            <button onClick={() => setMenuOpen((v) => !v)} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.10)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <MoreHorizontal style={{ width: 14, height: 14, color: MUTED }} />
            </button>
            {menuOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#F5EFEA", borderRadius: 12, border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 8px 24px rgba(0,0,0,0.14)", minWidth: 150, zIndex: 10, overflow: "hidden" }}>
                {!isOwn && <button onClick={() => { setMenuOpen(false); onHide(); }} style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "none", border: "none", fontSize: 13, color: INK, cursor: "pointer" }}>Hide this post</button>}
                {isOwn && activeTab === "mine" && <button onClick={() => { setMenuOpen(false); if (confirm("Remove this post?")) handleDelete(decision.id); }} style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: "none", border: "none", fontSize: 13, color: "#c0392b", cursor: "pointer" }}>Delete post</button>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "stretch", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        {/* Left — the ask */}
        <div style={{ width: isMobile ? "100%" : "42%", flexShrink: 0, padding: isMobile ? "14px 14px 16px" : "18px 20px 20px", borderRight: isMobile ? "none" : "1px solid rgba(0,0,0,0.06)", borderBottom: isMobile ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
          <p style={{ fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: LF, margin: "0 0 8px" }}>Looking for</p>
          <p style={{ fontSize: isMobile ? 17 : 19.5, fontWeight: 700, color: INK, lineHeight: 1.18, margin: 0, fontFamily: "Georgia, serif" }}>{decision.lf_title || "Recommendations"}</p>
          {decision.lf_context && <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#5A4A42", margin: "10px 0 0" }}>{decision.lf_context}</p>}

          <div style={{ marginTop: 14, background: "rgba(0,0,0,0.03)", borderRadius: 12, padding: "6px 14px" }}>
            {decision.lf_budget && statRow("Budget", formatBudget(decision.lf_budget))}
            {decision.lf_occasion && statRow("Occasion", decision.lf_occasion)}
            {priorities.length > 0 && statRow("Priorities", (
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {priorities.map((p) => <span key={p} style={{ fontSize: 10.5, fontWeight: 600, color: LF, background: "rgba(122,106,174,0.12)", border: "1px solid rgba(122,106,174,0.22)", borderRadius: 100, padding: "2px 10px" }}>{p}</span>)}
              </span>
            ))}
            {!(isFound && confAfter != null) && statRow("Confidence", (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#3A3530" }}>{confidence}/10</span>
                <span style={{ display: "flex", gap: 2 }}>{Array.from({ length: 10 }).map((_, i) => <span key={i} style={{ width: 4, height: 13, borderRadius: 2, background: i < confidence ? LF : "rgba(0,0,0,0.12)" }} />)}</span>
              </span>
            ))}
          </div>

          {/* Closed post: the same confidence journey a closed decision card shows. */}
          {isFound && confAfter != null && (() => {
            const up = confAfter >= confidence;
            const delta = confAfter - confidence;
            const lo = Math.max(0, Math.min(100, Math.min(confidence, confAfter) * 10));
            const hi = Math.max(0, Math.min(100, Math.max(confidence, confAfter) * 10));
            const strong = up ? OLIVE : "#B5544A";
            const faint = up ? "rgba(110,122,68,0.30)" : "rgba(181,84,74,0.26)";
            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <p style={LBL}>Confidence journey</p>
                  <span style={{ fontSize: 10, fontWeight: 700, color: delta === 0 ? MUTED : strong, background: delta === 0 ? "rgba(0,0,0,0.05)" : up ? "rgba(110,122,68,0.12)" : "rgba(181,84,74,0.12)", borderRadius: 100, padding: "2px 9px" }}>
                    {delta === 0 ? "No change" : `${up ? "▲ +" : "▼ −"}${Math.abs(delta)}`}
                  </span>
                </div>
                <div style={{ position: "relative", height: 10, borderRadius: 100, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${lo}%`, background: faint }} />
                  <div style={{ position: "absolute", left: `${lo}%`, top: 0, bottom: 0, width: `${hi - lo}%`, background: strong }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <span style={{ fontSize: 11.5, color: "#3A3530" }}>Started <strong style={{ fontSize: 13 }}>{confidence}</strong><span style={{ color: MUTED }}>/10</span></span>
                  <span style={{ fontSize: 11.5, color: "#3A3530" }}>Ended <strong style={{ fontSize: 13, color: strong }}>{confAfter}</strong><span style={{ color: MUTED }}>/10</span></span>
                </div>
              </div>
            );
          })()}

          {/* What she actually bought — the point of the closed card. */}
          {isFound && (boughtBrand || boughtName || boughtImage) && (
            <div style={{ background: "rgba(110,122,68,0.07)", border: "1px solid rgba(110,122,68,0.25)", borderRadius: 14, padding: 16, marginTop: 16 }}>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ width: isMobile ? 130 : 215, aspectRatio: "4 / 5", borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "#EDE8E2" }}>
                  <ProductImage url={boughtImage} fallback={<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}><Search style={{ width: 20, height: 20 }} /></div>} />
                </div>
                <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <p style={{ ...LBL, marginBottom: 8 }}>She bought</p>
                  {boughtBrand && <p style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: INK, margin: 0, lineHeight: 1.15 }}>{boughtBrand}</p>}
                  {boughtName && <p style={{ fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, margin: boughtBrand ? "6px 0 0" : 0, lineHeight: 1.4 }}>{boughtName}</p>}
                  {boughtPrice && <p style={{ fontSize: 16, fontWeight: 700, color: INK, margin: "10px 0 0" }}>{boughtPrice.startsWith("$") ? boughtPrice : `$${boughtPrice}`}</p>}
                  {boughtUrl && (
                    <a href={boughtUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: "#5A4A42", textDecoration: "none", marginTop: 10, wordBreak: "break-all" }}>
                      <ExternalLink style={{ width: 12, height: 12, flexShrink: 0 }} /> {boughtHost ?? "View"}
                    </a>
                  )}
                </div>
              </div>
              {winner && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(110,122,68,0.22)", display: "flex", alignItems: "center", gap: 7 }}>
                  <Check style={{ width: 13, height: 13, color: OLIVE, flexShrink: 0 }} />
                  <p style={{ fontSize: 12, color: OLIVE, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
                    Found through {firstNameOf(winner.profiles?.display_name)}'s rec
                    {outcome?.bought_alternative ? " (different piece, same brand)" : ""}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right — community recommendations */}
        <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "14px 14px 16px" : "18px 20px 20px", display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.5)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
            <p style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Users style={{ width: 13, height: 13 }} /> Community recommendations
            </p>
            {recs.length > 0 && (
              <button onClick={onOpenRecommendations} style={{ fontSize: 11, fontWeight: 700, color: LF, background: "none", border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}>
                {recs.length} shared
              </button>
            )}
          </div>

          {recs.length === 0 ? (
            <div style={{ flex: 1, minHeight: 150, border: "1px dashed rgba(122,106,174,0.4)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "20px 16px", gap: 10 }}>
              <p style={{ fontSize: 12, color: "#5A4A42", margin: 0, lineHeight: 1.45 }}>No recommendations yet.</p>
              {!isOwn && user ? (
                <button onClick={onAddRecommendation} style={{ background: INK, color: "#FDFAF6", border: "none", borderRadius: 100, padding: "9px 18px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Be the first to recommend</button>
              ) : isOwn ? (
                <p style={{ fontSize: 10.5, color: MUTED, margin: 0 }}>Your mirrors will start filling this in.</p>
              ) : (
                <button onClick={onSignIn} style={{ background: INK, color: "#FDFAF6", border: "none", borderRadius: 100, padding: "9px 18px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Sign in to recommend</button>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr", gap: 10 }}>
                {recs.slice(0, 4).map(tile)}
              </div>
              <button onClick={onOpenRecommendations} style={{ marginTop: 14, alignSelf: "flex-end", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: LF, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {recs.length > 4 ? `View all recommendations (${recs.length})` : "View recommendations"} <ArrowRight style={{ width: 15, height: 15 }} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── "Did you find it?" — her own post, once there are recs to pick from ── */}
      {isOwn && !isFound && recs.length > 0 && onFound && (() => {
        const wrap = (inner: React.ReactNode) => (
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", background: "rgba(122,106,174,0.05)", padding: isMobile ? "12px 14px" : "14px 18px", borderRadius: "0 0 20px 20px" }}>{inner}</div>
        );
        const heading = (t: string) => <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: "0 0 10px", lineHeight: 1.4 }}>{t}</p>;

        if (step === "snoozed") return wrap(
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 13, fontWeight: 600, color: OLIVE, margin: 0 }}>
            Keep looking. We'll circle back. ✦
          </motion.p>
        );

        if (step === "thanks") return wrap(
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 13, fontWeight: 600, color: OLIVE, margin: 0 }}>
            Logged. {picked ? `${firstNameOf(picked.profiles?.display_name)} will hear her rec landed.` : "Thanks for closing the loop."} ✦
          </motion.p>
        );

        if (step === "idle") return wrap(
          <div>
            {heading("Did you find it?")}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={BTN_DARK} onClick={() => setStep("pick")}>I bought one of these</button>
              <button style={BTN_OUTLINE} onClick={() => { setPicked(null); setDifferentPiece(false); setStep("link"); }}>I bought something else</button>
              <button style={BTN_GHOST} onClick={() => { onStillLooking?.(decision.id); setStep("snoozed"); }}>Still looking</button>
            </div>
          </div>
        );

        if (step === "pick") return wrap(
          <div>
            {heading("Which one did you buy?")}
            <p style={{ fontSize: 11, color: MUTED, margin: "-6px 0 8px" }}>Tap it above.</p>
            <button style={BTN_GHOST} onClick={() => setStep("idle")}>← Back</button>
          </div>
        );

        if (step === "same_or_diff" && picked) {
          const brand = picked.brand_name || "them";
          const who = firstNameOf(picked.profiles?.display_name);
          return wrap(
            <div>
              {heading(`Same one, or a different piece from ${brand}?`)}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={BTN_DARK} onClick={() => { setDifferentPiece(false); setStep("confidence"); }}>The exact one {who} recommended</button>
                <button style={BTN_OUTLINE} onClick={() => { setDifferentPiece(true); setStep("link"); }}>A different piece from {brand}</button>
              </div>
              <button style={{ ...BTN_GHOST, marginTop: 10 }} onClick={() => setStep("pick")}>← Back</button>
            </div>
          );
        }

        if (step === "link") return wrap(
          <div>
            {heading(picked?.brand_name ? `Which ${picked.brand_name} piece did you get?` : "What did you buy?")}
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              placeholder="Paste the link to what you bought"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onBlur={(e) => readLink(e.target.value)}
              onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t) setTimeout(() => readLink(t), 0); }}
              style={LINK_INPUT}
            />
            {pulling && <p style={{ fontSize: 12, color: MUTED, margin: "6px 2px 0" }}>Reading that link...</p>}
            {!pulling && pulled && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid rgba(196,158,100,0.4)", borderRadius: 10, padding: 10, marginTop: 8, maxWidth: 520 }}>
                {pulled.image_url
                  ? <img src={pulled.image_url} alt="" style={{ width: 52, height: 64, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "#EDE8E2" }} />
                  : <div style={{ width: 52, height: 64, borderRadius: 6, flexShrink: 0, background: "#EDE8E2" }} />}
                <div style={{ minWidth: 0 }}>
                  {pulled.brand && <p style={{ fontSize: 13, fontWeight: 700, color: INK, margin: 0 }}>{pulled.brand}</p>}
                  {pulled.name && <p style={{ fontSize: 11.5, color: "#5A4A42", margin: "2px 0 0" }}>{pulled.name}</p>}
                  {pulled.price && <p style={{ fontSize: 12, fontWeight: 600, color: INK, margin: "4px 0 0" }}>{pulled.price.startsWith("$") ? pulled.price : `$${pulled.price}`}</p>}
                </div>
              </div>
            )}
            {!pulling && pullFailed && (
              <p style={{ fontSize: 11.5, color: MUTED, margin: "6px 2px 0", lineHeight: 1.4 }}>
                Couldn't read that link, so there won't be an image. Your link still saves.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                style={BTN_DARK}
                disabled={!linkUrl.trim()}
                onClick={() => { if (!pulled && !pulling) void readLink(linkUrl); setStep("confidence"); }}
              >
                Continue →
              </button>
              <button style={BTN_GHOST} onClick={() => setStep(picked ? "same_or_diff" : "idle")}>← Back</button>
            </div>
          </div>
        );

        if (step === "confidence") return wrap(
          <div>
            {heading("Now that you've heard from everyone, how confident do you feel about your decision?")}
            <p style={{ fontSize: 11, color: MUTED, margin: "-6px 0 10px" }}>You started at {confidence}/10.</p>
            <div style={{ display: "flex", gap: 4, maxWidth: 520 }}>
              {Array.from({ length: 10 }).map((_, i) => {
                const n = i + 1;
                return (
                  <button key={n} onClick={() => submitFound(n)} style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", color: INK, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{n}</button>
                );
              })}
            </div>
            <p style={{ fontSize: 10, color: MUTED, margin: "8px 0 0" }}>1 = still unsure, 10 = this is the one</p>
          </div>
        );

        return null;
      })()}
    </div>
  );
}
