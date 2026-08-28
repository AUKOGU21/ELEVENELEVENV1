// ── LookingForCard ────────────────────────────────────────────────────────────
// The second feed post type. "What should I buy?" — the left side states what the
// person wants (title, budget, priorities, confidence); the right side fills with
// community product recommendations as they come in. Visually distinct from a
// Decision card (violet accent) but part of the same product.
import { useState, useRef, useEffect } from "react";
import { Bookmark, MoreHorizontal, ArrowRight, Search, Users } from "lucide-react";
import { formatName, getInitials, timeAgo, formatBudget } from "@/lib/format";
import MatchBadge from "./MatchBadge";
import { ProductImage } from "./ProductImage";
import type { RecommendationData } from "./RecommendationCard";

const INK = "#1A1A1A";
const MUTED = "#8C7A70";
const LF = "#7A6AAE";

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
}

export default function LookingForCard({
  decision, user, isMobile, activeTab, isSaved, onSave, onHide, navigate, handleDelete, onOpenRecommendations, onAddRecommendation, onSignIn,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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

  const priorities = decision.lf_priorities ?? [];
  const statRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0" }}>
      <span style={{ width: 74, flexShrink: 0, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: MUTED, paddingTop: 1 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "#3A3530", fontWeight: 500 }}>{value}</span>
    </div>
  );

  const tile = (rec: RecommendationData) => {
    const price = rec.price_note ? (rec.price_note.startsWith("$") ? rec.price_note : `$${rec.price_note}`) : null;
    return (
      <button key={rec.id} onClick={onOpenRecommendations} style={{ textAlign: "left", background: "#FDFAF6", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 12, overflow: "hidden", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ width: "100%", aspectRatio: "4 / 5", background: "#EDE8E2", overflow: "hidden", position: "relative" }}>
          <ProductImage url={rec.product_image_url} fallback={<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}><Search style={{ width: 20, height: 20 }} /></div>} />
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
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: LF, background: "rgba(122,106,174,0.12)", border: "1px solid rgba(122,106,174,0.28)", borderRadius: 100, padding: "2px 9px" }}>
              <Search style={{ width: 10, height: 10 }} /> Looking for
            </span>
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
            {statRow("Confidence", (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#3A3530" }}>{confidence}/10</span>
                <span style={{ display: "flex", gap: 2 }}>{Array.from({ length: 10 }).map((_, i) => <span key={i} style={{ width: 4, height: 13, borderRadius: 2, background: i < confidence ? LF : "rgba(0,0,0,0.12)" }} />)}</span>
              </span>
            ))}
          </div>
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
    </div>
  );
}
