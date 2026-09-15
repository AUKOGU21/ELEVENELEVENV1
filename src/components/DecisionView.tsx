// ── DecisionView ──────────────────────────────────────────────────────────────
// Opening a decision opens a person's decision, not a product page. It lays over
// the feed, which stays where it was, dimmed, so closing puts you back exactly
// where you left off.
//
// Open and resolved decisions share this one view. Resolving doesn't summarise a
// decision away: what she was deciding about stays, and what she did is added as
// the next chapter. Nor does it close the conversation. Responses hold what was
// said while she was deciding; Follow-ups hold what's asked after, which is how
// a decision from months ago stays useful.
import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, ExternalLink, MoreHorizontal, X } from "lucide-react";
import { C, RADIUS, SANS, STATE_WORD, body, display, meta, stateColor, strong } from "@/lib/design";
import { formatName, prettyHost, timeAgo } from "@/lib/format";
import { track } from "@/lib/track";
import FollowButton from "./FollowButton";
import MatchSeal from "./MatchSeal";
import { Avatar, decisionState, isResolved, type TileDecision } from "./DecisionTile";
import ResponseItem, { type ResponseItemData } from "./ResponseItem";
import CommentThread, { type CommentData } from "./CommentThread";
import {
  FIT_RESULT_OPTIONS,
  outcomeDetailOptions,
  outcomeDetailQuestion,
  parsePrimaryUncertainty,
} from "./OutcomeModal";

export interface ViewOutcome {
  did_purchase: boolean | null;
  outcome_type: string | null;
  created_at?: string | null;
  size_bought?: string | null;
  confidence_after?: number | null;
  take?: string | null;
  fit_result_note?: string | null;
  outcome_detail_other?: string | null;
  tipping_factor_other?: string | null;
  tipping_factor?: string | null;
  followed_up_at?: string | null;
  kept?: boolean | null;
  recommend?: boolean | null;
  arrival_status?: string | null;
  next_prompt_at?: string | null;
  photo_url?: string | null;
  chosen_option?: string | null;
  bought_alternative?: boolean | null;
  alt_product_url?: string | null;
  alt_product_name?: string | null;
  alt_product_image_url?: string | null;
  alt_brand_name?: string | null;
  alt_price_note?: string | null;
  alt_reason?: string | null;
}

export interface ViewDecision extends TileDecision {
  product_url: string | null;
  product_url_2?: string | null;
  product_name_2?: string | null;
  brand_name_2?: string | null;
  price_note: string | null;
  price_note_2?: string | null;
  product_category: string | null;
  sizes_note: string | null;
  context_note: string | null;
  confidence_score: number;
  uncertainty_text: string | null;
  resolved_at?: string | null;
  responses: ResponseItemData[];
  decision_comments?: CommentData[];
  outcomes: ViewOutcome[] | null;
  profiles: (NonNullable<TileDecision["profiles"]> & {
    height_range?: string | null;
    top_size?: string | null;
    bottom_size?: string | null;
    fit_preference?: string | null;
    silhouette_preference?: string[] | null;
  }) | null;
}

export type ReceivedData = {
  primary: string;
  detailAnswer: string | null;
  kept: boolean | null;
  recommend: boolean | null;
  confidence: number | null;
  photoFile: File | null;
  take: string | null;
};

interface Props {
  d: ViewDecision;
  viewer: { id: string } | null;
  isMobile: boolean;
  onClose: () => void;
  onOpenDecision: (id: string) => void;
  similar: TileDecision[];
  /** Replaces the columns and tabs. Looking For posts use it for now, carrying
   *  their existing card, so the found-it flow keeps working until it's redone. */
  customBody?: React.ReactNode;
  initialTab?: "responses" | "followups";
  focusResponseId?: string | null;
  // Standing
  isSaved: boolean;
  onSave: () => void;
  onHide: () => void;
  isFollowing: boolean;
  onToggleFollow: (targetUserId: string, following: boolean) => void;
  onViewProfile: () => void;
  onSignIn: () => void;
  onLightbox: (url: string) => void;
  // Weighing in
  onWeighIn: () => void;
  // Her own post
  outcomeLogged: boolean;
  canDelete: boolean;
  onLogOutcome: (initial: "bought_it" | "didnt_buy" | null, chosen?: "first" | "second" | "both" | null) => void;
  onStillDeciding: () => void;
  onDelete: () => void;
  onSaveEdit: (patch: { context_note: string | null; confidence_score: number; price_note: string | null; sizes_note: string | null }) => void;
  updateOutcome: (patch: Record<string, unknown>) => void;
  submitReceived: (data: ReceivedData) => void;
  submitReturned: (data: { note: string | null; photoFile: File | null }) => void;
  // The conversation
  voteCounts: Record<string, { helpful: number; not_helpful: number }>;
  userVotes: Record<string, "helpful" | "not_helpful">;
  onHelpful: (responseId: string) => void;
  onSubmitReply: (responseId: string, body: string) => Promise<void>;
  onEditReply: (replyId: string, body: string) => Promise<void>;
  onDeleteReply: (replyId: string) => Promise<void>;
  onSubmitComment: (body: string) => Promise<void>;
  onEditComment: (commentId: string, body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

// ── Small parts ───────────────────────────────────────────────────────────────

/** Her concern as a heading. Labels that are questions read as questions
 *  ("WORTH THE PRICE?"); topics stay topics ("QUALITY CONCERNS", "BETWEEN SIZES"). */
const questionize = (label: string) =>
  /\?$/.test(label) || !/^(will|is|does|do|can|should|would|worth|how|what|which|am|are)\b/i.test(label.trim())
    ? label
    : `${label}?`;

const money = (p: string | null | undefined) => (p ? (p.trim().startsWith("$") ? p.trim() : `$${p.trim()}`) : null);

const squareBtn = (filled: boolean, colour: string = C.ink): React.CSSProperties => ({
  ...meta(12, filled ? "#FFFFFF" : colour),
  fontWeight: 700,
  letterSpacing: "0.16em",
  background: filled ? colour : "transparent",
  border: `1px solid ${colour}`,
  borderRadius: RADIUS,
  padding: "15px 18px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
});

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

const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: RADIUS,
  border: `1px solid ${C.rule}`,
  background: "#FFFFFF",
  padding: "11px 13px",
  fontFamily: SANS,
  fontSize: 14,
  lineHeight: 1.5,
  color: C.ink,
  outline: "none",
  resize: "none",
};

function Ticks({ value, colour = C.burgundy }: { value: number; colour?: string }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }} aria-hidden>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{ width: 4, height: 26, background: i < value ? colour : "rgba(20,18,16,0.12)" }} />
      ))}
    </div>
  );
}

/** Concerns as she wrote them: the label, and the detail she added under it. */
function parseConcerns(d: ViewDecision) {
  const labels = (d.uncertainty_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ctx: Record<string, string> = {};
  (d.context_note ?? "").split(" · ").forEach((note) => {
    const i = note.indexOf(": ");
    if (i > -1) ctx[note.slice(0, i).trim().toLowerCase()] = note.slice(i + 2).trim();
  });
  const sizes = (d.sizes_note ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return labels.map((label) => {
    const l = label.toLowerCase();
    const key = Object.keys(ctx).find((k) => l.includes(k) || k.includes(l));
    return {
      label,
      detail: key ? ctx[key] : null,
      sizes: l.includes("between sizes") ? sizes : [],
    };
  });
}

// ── The view ──────────────────────────────────────────────────────────────────

export default function DecisionView(props: Props) {
  const {
    d, viewer, isMobile, onClose, onOpenDecision, similar, customBody, initialTab, focusResponseId,
    isSaved, onSave, onHide, isFollowing, onToggleFollow, onViewProfile, onSignIn, onLightbox,
    onWeighIn, outcomeLogged, canDelete, onLogOutcome, onStillDeciding, onDelete, onSaveEdit,
    updateOutcome, submitReceived, submitReturned,
    voteCounts, userVotes, onHelpful, onSubmitReply, onEditReply, onDeleteReply,
    onSubmitComment, onEditComment, onDeleteComment,
  } = props;

  const isOwn = !!viewer && viewer.id === d.user_id;
  const resolved = isResolved(d);
  const isLFPost = d.post_type === "looking_for";
  const state = decisionState(d, viewer?.id ?? null);
  const outcome = d.outcomes?.[0] ?? null;
  const concerns = useMemo(() => parseConcerns(d), [d.uncertainty_text, d.context_note, d.sizes_note]);
  const confidence = d.confidence_score ?? 0;
  const closeRef = useRef<HTMLButtonElement>(null);
  const convoRef = useRef<HTMLElement>(null);

  // Escape closes; focus lands on the close control so the keyboard has a way out.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Images: her photo in real life leads once she has one, then the product
  //    photos (the one she chose first), then what she bought instead.
  const hasTwo = !!(d.product_image_url_2 || d.product_url_2);
  const chosen = outcome?.chosen_option ?? null;
  const altBought = d.status === "closed" && outcome?.bought_alternative === true;
  const web = chosen === "second" ? [d.product_image_url_2, d.product_image_url] : [d.product_image_url, d.product_image_url_2];
  const slides = [
    ...(outcome?.photo_url ? [{ src: outcome.photo_url, kind: "irl" as const }] : []),
    ...web.filter(Boolean).map((src) => ({ src: src as string, kind: src === d.product_image_url_2 ? "second" as const : "first" as const })),
    ...(altBought && outcome?.alt_product_image_url ? [{ src: outcome.alt_product_image_url, kind: "alt" as const }] : []),
  ];
  const [slide, setSlide] = useState(0);
  const cur = slides[Math.min(slide, Math.max(0, slides.length - 1))];
  const touchX = useRef<number | null>(null);

  const showing = cur?.kind ?? "first";
  const shownBrand = showing === "alt" ? (outcome?.alt_brand_name || outcome?.alt_product_name || "What she bought instead")
    : showing === "second" ? (d.brand_name_2 || d.brand_name) : d.brand_name;
  const shownName = showing === "alt" ? (outcome?.alt_brand_name ? outcome?.alt_product_name ?? null : null)
    : showing === "second" ? (d.product_name_2 || d.product_name) : d.product_name;
  const shownPrice = money(showing === "alt" ? outcome?.alt_price_note : showing === "second" ? (d.price_note_2 || d.price_note) : d.price_note);
  const shownUrl = showing === "alt" ? outcome?.alt_product_url : showing === "second" ? (d.product_url_2 || d.product_url) : d.product_url;
  const caption = showing === "irl" ? "On her" : showing === "alt" ? "Bought instead" : hasTwo ? (showing === "second" ? "Option B" : "Option A") : null;

  // ── The conversation, split at the moment she decided.
  const decidedAt = resolved ? (d.resolved_at ?? outcome?.created_at ?? null) : null;
  const comments = d.decision_comments ?? [];
  const before = decidedAt ? comments.filter((c) => new Date(c.created_at) <= new Date(decidedAt)) : comments;
  const after = decidedAt ? comments.filter((c) => new Date(c.created_at) > new Date(decidedAt)) : [];
  const [tab, setTab] = useState<"responses" | "followups">(resolved && initialTab === "followups" ? "followups" : "responses");
  const [sort, setSort] = useState<"match" | "helpful" | "newest">("match");
  const [verdict, setVerdict] = useState<"all" | "buy" | "do_not_buy" | "need_more_info">("all");
  const helpful = (r: ResponseItemData) => voteCounts[r.id]?.helpful ?? r.helpfulness_votes ?? 0;
  const responses = [...(d.responses ?? [])]
    .filter((r) => verdict === "all" || r.recommendation === verdict)
    .sort((a, b) =>
      sort === "helpful" ? helpful(b) - helpful(a)
        : sort === "newest" ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          : (b.match_score ?? 0) - (a.match_score ?? 0));
  const counts = {
    buy: d.responses.filter((r) => r.recommendation === "buy").length,
    do_not_buy: d.responses.filter((r) => r.recommendation === "do_not_buy").length,
    need_more_info: d.responses.filter((r) => r.recommendation === "need_more_info").length,
  };

  // ── Menu and editing.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const [editing, setEditing] = useState(false);
  const [editDetails, setEditDetails] = useState<Record<string, string>>({});
  const [editConf, setEditConf] = useState(confidence);
  const [editPrice, setEditPrice] = useState("");
  const [editSizes, setEditSizes] = useState("");
  const openEdit = () => {
    const details: Record<string, string> = {};
    concerns.forEach((c) => { details[c.label] = c.detail ?? ""; });
    setEditDetails(details);
    setEditConf(confidence);
    setEditPrice((d.price_note ?? "").replace(/^\$/, ""));
    setEditSizes(d.sizes_note ?? "");
    setEditing(true);
  };
  const saveEdit = () => {
    const context_note = concerns
      .filter((c) => (editDetails[c.label] ?? "").trim())
      .map((c) => `${c.label}: ${editDetails[c.label].trim()}`)
      .join(" · ") || null;
    onSaveEdit({
      context_note,
      confidence_score: editConf,
      price_note: editPrice.trim() ? `$${editPrice.trim().replace(/^\$/, "")}` : null,
      sizes_note: editSizes.trim() || null,
    });
    setEditing(false);
  };

  const [snoozed, setSnoozed] = useState(false);
  useEffect(() => {
    if (!snoozed) return;
    const t = setTimeout(() => setSnoozed(false), 2600);
    return () => clearTimeout(t);
  }, [snoozed]);

  const [profileOpen, setProfileOpen] = useState(false);
  const p = d.profiles;
  const city = p?.city?.split(",")[0] ?? "";
  const match = d.matchScore != null ? Math.round(d.matchScore) : null;

  // ── Layout
  const panelWidth = isMobile ? "100vw" : "min(1240px, 80vw)";
  const wide = !isMobile && typeof window !== "undefined" && window.innerWidth >= 1280;

  const identity = (
    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, flexWrap: "wrap" }}>
      <Avatar url={p?.avatar_url ?? null} name={p?.display_name ?? null} tier={p?.badge_tier} size={isMobile ? 44 : 54} />
      <div style={{ minWidth: 0 }}>
        <p style={{ ...strong(isMobile ? 13 : 14), textTransform: "uppercase", letterSpacing: "0.05em" }}>{formatName(p?.display_name)}</p>
        <p style={{ ...body(12.5, C.muted), marginTop: 2 }}>{[city, timeAgo(d.created_at)].filter(Boolean).join("  ·  ")}</p>
      </div>
      {match != null && <span style={{ marginLeft: isMobile ? 0 : 6 }}><MatchSeal score={match} size={isMobile ? 40 : 48} withLabel /></span>}
      {!isOwn && (
        <FollowButton targetUserId={d.user_id} user={viewer} following={isFollowing} onChange={onToggleFollow} onSignIn={onSignIn} size="md" variant="editorial" />
      )}
      <button onClick={() => setProfileOpen((v) => !v)} style={{ ...textLink(C.muted), fontWeight: 600 }}>
        {isOwn ? "Your profile" : "See her profile"}
      </button>
    </div>
  );

  const profileLine = profileOpen && p && (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 22, rowGap: 8, padding: "14px 0 0" }}>
      {[
        ["Height", p.height_range],
        ["Top", p.top_size],
        ["Bottom", p.bottom_size],
        ["Fit", p.fit_preference],
        ["Silhouette", p.silhouette_preference?.[0]],
      ].filter(([, v]) => v).map(([k, v]) => (
        <span key={k as string} style={{ display: "inline-flex", gap: 8, alignItems: "baseline" }}>
          <span style={meta(10, C.muted)}>{k}</span>
          <span style={body(13, C.ink)}>{v}</span>
        </span>
      ))}
      <button onClick={onViewProfile} style={textLink(C.burgundy)}>
        View full profile <ArrowRight style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );

  const menu = (
    <div style={{ position: "relative" }} ref={menuRef}>
      <button onClick={() => setMenuOpen((v) => !v)} aria-label="More" style={{ background: "none", border: "none", padding: 6, cursor: "pointer", color: C.ink, lineHeight: 0 }}>
        <MoreHorizontal style={{ width: 20, height: 20 }} />
      </button>
      {menuOpen && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: RADIUS, minWidth: 180, zIndex: 5 }}>
          {!isOwn && (
            <button onClick={() => { setMenuOpen(false); onHide(); onClose(); }} style={{ ...textLink(C.ink), width: "100%", padding: "13px 16px" }}>Hide this post</button>
          )}
          {isOwn && !resolved && d.post_type !== "looking_for" && (
            <button onClick={() => { setMenuOpen(false); openEdit(); }} style={{ ...textLink(C.ink), width: "100%", padding: "13px 16px" }}>Edit post</button>
          )}
          {isOwn && !resolved && !outcomeLogged && d.post_type !== "looking_for" && (
            <button onClick={() => { setMenuOpen(false); onLogOutcome(null); }} style={{ ...textLink(C.ink), width: "100%", padding: "13px 16px", borderTop: `1px solid ${C.rule}` }}>Log outcome</button>
          )}
          {isOwn && canDelete && (
            <button onClick={() => { setMenuOpen(false); if (confirm("Remove this decision?")) { onDelete(); onClose(); } }} style={{ ...textLink(C.burgundy), width: "100%", padding: "13px 16px", borderTop: `1px solid ${C.rule}` }}>Delete post</button>
          )}
        </div>
      )}
    </div>
  );

  // ── Images column
  const imageColumn = (
    <div>
      <div
        style={{ position: "relative", background: C.well, aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) setSlide((i) => (dx < 0 ? Math.min(slides.length - 1, i + 1) : Math.max(0, i - 1)));
          touchX.current = null;
        }}
      >
        {cur ? (
          <img
            src={cur.src}
            alt={[shownBrand, shownName].filter(Boolean).join(" ")}
            onClick={() => onLightbox(cur.src)}
            style={{ maxWidth: "88%", maxHeight: "88%", objectFit: "contain", mixBlendMode: cur.kind === "irl" ? "normal" : "multiply", cursor: "zoom-in" }}
          />
        ) : (
          <p style={meta(10.5, C.faint)}>No image</p>
        )}
        {shownUrl && (
          <a
            href={shownUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`View on ${prettyHost(shownUrl)}`}
            onClick={(e) => { e.stopPropagation(); track("product_click", { decisionId: d.id, userId: viewer?.id ?? null }); }}
            style={{
              position: "absolute", top: 14, right: 14, zIndex: 2,
              display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
              background: C.paper, border: `1px solid ${C.rule}`, borderRadius: RADIUS, padding: "8px 11px",
              ...meta(10, C.ink), fontWeight: 700,
            }}
          >
            View <ArrowUpRight style={{ width: 13, height: 13 }} strokeWidth={2} />
          </a>
        )}
        {slides.length > 1 && !isMobile && (
          <>
            <button aria-label="Previous image" onClick={() => setSlide((i) => Math.max(0, i - 1))} disabled={slide === 0}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: slide === 0 ? "default" : "pointer", opacity: slide === 0 ? 0.25 : 1, color: C.ink, padding: 6 }}>
              <ArrowLeft style={{ width: 22, height: 22 }} strokeWidth={1.5} />
            </button>
            <button aria-label="Next image" onClick={() => setSlide((i) => Math.min(slides.length - 1, i + 1))} disabled={slide >= slides.length - 1}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: slide >= slides.length - 1 ? "default" : "pointer", opacity: slide >= slides.length - 1 ? 0.25 : 1, color: C.ink, padding: 6 }}>
              <ArrowRight style={{ width: 22, height: 22 }} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10, minHeight: 16 }}>
        <span style={meta(10, caption === "Bought instead" || caption === "On her" ? C.burgundy : C.muted)}>{caption ?? ""}</span>
        {slides.length > 1 && <span style={meta(10, C.muted)}>{Math.min(slide, slides.length - 1) + 1} / {slides.length}{isMobile ? "  ·  swipe" : ""}</span>}
      </div>
      <div style={{ marginTop: 14 }}>
        {shownBrand && <p style={{ ...strong(isMobile ? 15 : 17), textTransform: "uppercase", letterSpacing: "0.04em" }}>{shownBrand}</p>}
        {shownName && <p style={{ ...body(isMobile ? 13.5 : 14.5, C.inkSoft), textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 3 }}>{shownName}</p>}
        {shownPrice && <p style={{ ...body(14, C.ink), marginTop: 6 }}>{shownPrice}</p>}
      </div>
    </div>
  );

  // ── What she's deciding about
  const concernsBlock = editing ? (
    <div>
      <p style={{ ...meta(11, C.ink), marginBottom: 16 }}>Edit your post</p>
      {concerns.map((c) => (
        <div key={c.label} style={{ marginBottom: 14 }}>
          <p style={{ ...strong(13), textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{c.label}</p>
          <textarea rows={2} value={editDetails[c.label] ?? ""} onChange={(e) => setEditDetails((m) => ({ ...m, [c.label]: e.target.value }))} placeholder="Add detail (optional)" style={fieldStyle} />
        </div>
      ))}
      {concerns.some((c) => c.sizes.length > 0 || c.label.toLowerCase().includes("between sizes")) && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ ...meta(10, C.muted), marginBottom: 6 }}>Sizes you're deciding between</p>
          <input value={editSizes} onChange={(e) => setEditSizes(e.target.value)} placeholder="e.g. S, M" style={fieldStyle} />
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <p style={{ ...meta(10, C.muted), marginBottom: 6 }}>Price</p>
        <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="e.g. 199" style={fieldStyle} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <p style={{ ...meta(10, C.muted), marginBottom: 8 }}>Confidence: {editConf}/10</p>
        <input type="range" min={1} max={10} value={editConf} onChange={(e) => setEditConf(Number(e.target.value))} style={{ width: "100%", accentColor: C.burgundy }} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setEditing(false)} style={{ ...squareBtn(false), flex: 1 }}>Cancel</button>
        <button onClick={saveEdit} style={{ ...squareBtn(true), flex: 1 }}>Save changes</button>
      </div>
    </div>
  ) : (
    <div>
      <p style={{ ...meta(11, C.ink), marginBottom: 4 }}>{resolved ? "What I was deciding about" : "What I'm deciding about"}</p>
      {concerns.length === 0 && <p style={{ ...body(14, C.muted), padding: "16px 0" }}>She didn't name a specific concern.</p>}
      {concerns.map((c, i) => (
        <div key={c.label} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 8, padding: "18px 0", borderBottom: `1px solid ${C.rule}` }}>
          <span style={{ ...strong(14, C.ink), letterSpacing: "0.02em" }}>{String(i + 1).padStart(2, "0")}</span>
          <div>
            <p style={{ ...strong(isMobile ? 15 : 16.5), textTransform: "uppercase", letterSpacing: "0.03em" }}>
              {questionize(c.label)}
            </p>
            {c.sizes.length > 0 && (
              <p style={{ ...body(14, C.inkSoft), marginTop: 6 }}>Deciding between {c.sizes.join(" / ")}</p>
            )}
            {c.detail && <p style={{ ...body(isMobile ? 14 : 15, C.inkSoft), marginTop: 6 }}>&ldquo;{c.detail}&rdquo;</p>}
          </div>
        </div>
      ))}
    </div>
  );

  // ── Confidence
  const confAfter = outcome?.confidence_after ?? null;
  const confidenceBlock = (
    <div style={{ padding: "22px 0", borderBottom: `1px solid ${C.rule}` }}>
      <p style={{ ...meta(11, C.ink), marginBottom: 10 }}>Confidence</p>
      {resolved && confAfter != null ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <span style={display(isMobile ? 40 : 52, C.muted)}>{confidence}/10</span>
          <ArrowRight style={{ width: 26, height: 26, color: C.ink, alignSelf: "center" }} strokeWidth={1.5} />
          <span style={display(isMobile ? 40 : 52, C.ink)}>{confAfter}/10</span>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={display(isMobile ? 40 : 52)}>{confidence}/10</span>
          <Ticks value={confidence} />
        </div>
      )}
    </div>
  );

  // ── Actions while it's open
  const weighInCount = d.responses.filter((r) => r.user_id !== d.user_id).length;
  const optA = d.brand_name || d.product_name || "Option A";
  const optB = d.brand_name_2 || d.product_name_2 || "Option B";
  const openActions = !resolved && !editing && (
    <div style={{ paddingTop: 22 }}>
      {!isOwn ? (
        <button onClick={() => (viewer ? onWeighIn() : onSignIn())} style={{ ...squareBtn(true, C.burgundy), width: "100%" }}>
          Weigh in <ArrowRight style={{ width: 16, height: 16 }} />
        </button>
      ) : outcomeLogged ? null : snoozed ? (
        <p style={{ ...body(14, C.ink) }}>Sounds good. We'll circle back. ✦</p>
      ) : (
        <div>
          <p style={{ ...body(14.5, C.ink), marginBottom: 12 }}>
            {hasTwo ? "Which did you go with?"
              : weighInCount > 0 ? `${weighInCount} ${weighInCount === 1 ? "woman" : "women"} weighed in. Don't leave ${weighInCount === 1 ? "her" : "them"} hanging, spill.`
                : "How'd it go?"}
          </p>
          {hasTwo ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button onClick={() => onLogOutcome("bought_it", "first")} style={squareBtn(true)}>{optA}</button>
              <button onClick={() => onLogOutcome("bought_it", "second")} style={squareBtn(true)}>{optB}</button>
              <button onClick={() => onLogOutcome("bought_it", "both")} style={squareBtn(false)}>Both</button>
              <button onClick={() => onLogOutcome("didnt_buy", null)} style={squareBtn(false)}>Neither</button>
              <button onClick={() => { onStillDeciding(); setSnoozed(true); }} style={{ ...squareBtn(false, C.muted), gridColumn: "1 / -1" }}>Still deciding</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <button onClick={() => onLogOutcome("bought_it")} style={squareBtn(true)}>Bought it</button>
              <button onClick={() => onLogOutcome("didnt_buy")} style={squareBtn(false)}>Passed</button>
              <button onClick={() => { onStillDeciding(); setSnoozed(true); }} style={squareBtn(false, C.muted)}>Still deciding</button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── My decision: the chapter that resolving adds
  const take = outcome?.take || outcome?.fit_result_note || outcome?.outcome_detail_other || outcome?.tipping_factor_other || outcome?.tipping_factor || null;
  const takeQuotes = [...new Set([outcome?.alt_reason, take].filter(Boolean) as string[])];
  const decisionDetail = [
    chosen === "both" ? "Bought both" : chosen === "first" ? `Went with ${optA}` : chosen === "second" ? `Went with ${optB}` : null,
    altBought ? "Bought something else instead" : null,
    (state === "bought" || state === "returned") && outcome?.size_bought ? `Size ${outcome.size_bought}` : null,
  ].filter(Boolean) as string[];
  // What happened after she bought it belongs to the decision itself, in the same
  // voice, not in a footnote: "BOUGHT." then "THEN RETURNED IT."
  const returned = outcome?.kept === false || outcome?.arrival_status === "returned";
  const keptIt = outcome?.kept === true;
  const mainWord = state === "returned" ? STATE_WORD.bought : STATE_WORD[state];
  const afterLine = state === "bought" || state === "returned"
    ? (returned ? "Then returned it." : keptIt ? "And kept it." : null)
    : null;
  const myDecision = resolved && (
    <div style={{ padding: "26px 0 24px", borderBottom: `1px solid ${C.rule}` }}>
      <p style={{ ...meta(11, C.ink), marginBottom: 12 }}>My decision</p>
      <p style={display(isMobile ? 54 : 72, stateColor(state))}>{mainWord}</p>
      {afterLine && <p style={{ ...display(isMobile ? 34 : 46, C.ink), marginTop: 6 }}>{afterLine}</p>}
      {decisionDetail.length > 0 && <p style={{ ...meta(11, C.inkSoft), marginTop: 12 }}>{decisionDetail.join("  ·  ")}</p>}
      {takeQuotes.map((q, i) => (
        <p key={i} style={{ ...body(isMobile ? 15 : 16.5, C.ink), marginTop: i === 0 ? 16 : 10, maxWidth: "58ch" }}>&ldquo;{q}&rdquo;</p>
      ))}
      {altBought && (outcome?.alt_brand_name || outcome?.alt_product_name || outcome?.alt_product_url) && (
        <div style={{ marginTop: 18 }}>
          <p style={{ ...meta(10, C.muted), marginBottom: 6 }}>What she bought instead</p>
          <p style={{ ...strong(14), textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {[outcome?.alt_brand_name, outcome?.alt_product_name].filter(Boolean).join("  ·  ") || "Her pick"}
            {outcome?.alt_price_note ? `  ·  ${money(outcome.alt_price_note)}` : ""}
          </p>
          {outcome?.alt_product_url && (
            <a href={outcome.alt_product_url} target="_blank" rel="noopener noreferrer"
              onClick={() => track("product_click", { decisionId: d.id, userId: viewer?.id ?? null })}
              style={{ ...textLink(C.ink), marginTop: 8 }}>
              <ExternalLink style={{ width: 12, height: 12 }} /> View on {prettyHost(outcome.alt_product_url)}
            </a>
          )}
        </div>
      )}
      {outcome?.recommend != null && (
        <p style={{ ...meta(12, C.ink), fontWeight: 700, marginTop: 16 }}>
          {outcome.recommend ? "Would recommend it" : "Wouldn't recommend it"}
        </p>
      )}
    </div>
  );

  // ── Her follow-up once it arrives (owner only), restyled from the card.
  const [fuStage, setFuStage] = useState<"gate" | "returned" | "detail" | "keep" | "recommend" | "confidence" | "photo">("gate");
  const [fuDetail, setFuDetail] = useState<string | null>(null);
  const [fuKept, setFuKept] = useState<boolean | null>(null);
  const [fuRec, setFuRec] = useState<boolean | null>(null);
  const [fuConf, setFuConf] = useState<number | null>(null);
  const [fuReturnNote, setFuReturnNote] = useState("");
  const [fuTake, setFuTake] = useState("");
  const [fuPhoto, setFuPhoto] = useState<File | null>(null);
  const [fuDismiss, setFuDismiss] = useState(false);
  const [fuThanks, setFuThanks] = useState(false);
  const fuPhotoRef = useRef<HTMLInputElement>(null);

  const receivedFlow = (() => {
    if (!isOwn || !(d.status === "purchased" || altBought) || !outcome) return null;
    const arrival = outcome.arrival_status;
    if (arrival === "received" || arrival === "returned" || fuDismiss) return null;
    if (arrival === "waiting" && outcome.next_prompt_at && Date.now() < new Date(outcome.next_prompt_at).getTime()) return null;
    const itemName = (altBought
      ? [outcome.alt_brand_name, outcome.alt_product_name].filter(Boolean).join(" ").trim()
      : [d.brand_name, d.product_name].filter(Boolean).join(" ").trim()) || "your pick";
    const primary = parsePrimaryUncertainty(d.uncertainty_text);
    const fitLike = primary === "Between sizes" || primary === "Will it fit right";
    const detailQ = fitLike ? "How did it fit?" : outcomeDetailQuestion(primary, "bought_it");
    const detailOpts: string[] = fitLike ? FIT_RESULT_OPTIONS : outcomeDetailOptions(primary);
    const q = (t: string) => <p style={{ ...strong(15), marginBottom: 12, lineHeight: 1.35 }}>{t}</p>;
    const wrap = (inner: React.ReactNode) => (
      <div style={{ padding: "22px 0", borderBottom: `1px solid ${C.rule}` }}>
        <p style={{ ...meta(10.5, C.burgundy), marginBottom: 12 }}>Close the loop</p>
        {inner}
      </div>
    );
    if (fuStage === "gate") return wrap(
      <>
        {q(`Ready to tell us how the ${itemName} went?`)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <button style={squareBtn(false)} onClick={() => { updateOutcome({ arrival_status: "waiting", next_prompt_at: new Date(Date.now() + 3 * 86400000).toISOString() }); setFuDismiss(true); }}>Still waiting</button>
          <button style={squareBtn(false)} onClick={() => setFuStage("returned")}>Returned / canceled</button>
          <button style={squareBtn(true)} onClick={() => setFuStage("detail")}>Received it</button>
        </div>
      </>
    );
    if (fuStage === "returned") return wrap(
      <>
        {q("What went wrong? (optional)")}
        <textarea value={fuReturnNote} onChange={(e) => setFuReturnNote(e.target.value)} rows={2} placeholder="e.g. ran huge, fabric felt cheap, changed my mind" style={fieldStyle} />
        <input ref={fuPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFuPhoto(e.target.files?.[0] ?? null)} />
        <button onClick={() => fuPhotoRef.current?.click()} style={{ ...textLink(C.ink), marginTop: 12 }}>{fuPhoto ? "Photo added. Change" : "+ Add a photo (optional)"}</button>
        <p style={{ ...body(12, C.muted), marginTop: 6 }}>Even if it didn't work out, a photo shows the next woman why.</p>
        <button style={{ ...squareBtn(true), width: "100%", marginTop: 14 }} onClick={() => { submitReturned({ note: fuReturnNote.trim() || null, photoFile: fuPhoto }); setFuThanks(true); setFuDismiss(true); }}>Done</button>
      </>
    );
    if (fuStage === "detail") return wrap(
      <>
        {q(detailQ)}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {detailOpts.map((opt) => <button key={opt} style={squareBtn(false)} onClick={() => { setFuDetail(opt); setFuStage("keep"); }}>{opt}</button>)}
        </div>
      </>
    );
    if (fuStage === "keep") return wrap(
      <>
        {q("Will you keep it, or return it?")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={squareBtn(true)} onClick={() => { setFuKept(true); setFuStage("recommend"); }}>Keeping it</button>
          <button style={squareBtn(false)} onClick={() => { setFuKept(false); setFuStage("recommend"); }}>Returning it</button>
        </div>
      </>
    );
    if (fuStage === "recommend") return wrap(
      <>
        {q("Would you recommend it to women like you?")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={squareBtn(true)} onClick={() => { setFuRec(true); setFuStage("confidence"); }}>Yes</button>
          <button style={squareBtn(false)} onClick={() => { setFuRec(false); setFuStage("confidence"); }}>No</button>
        </div>
      </>
    );
    if (fuStage === "confidence") return wrap(
      <>
        {q("Post-purchase confidence?")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <button key={i} onClick={() => { setFuConf(i + 1); setFuStage("photo"); }} style={{ ...squareBtn(false), padding: "12px 0" }}>{i + 1}</button>
          ))}
        </div>
        <p style={{ ...body(12, C.muted), marginTop: 8 }}>1 = wish I hadn't, 10 = so glad I did</p>
      </>
    );
    return wrap(
      <>
        {q("Anything you'd tell a woman like you?")}
        <textarea value={fuTake} onChange={(e) => setFuTake(e.target.value)} rows={3} placeholder="Share what the photos can't show..." style={fieldStyle} />
        <input ref={fuPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFuPhoto(e.target.files?.[0] ?? null)} />
        <button onClick={() => fuPhotoRef.current?.click()} style={{ ...textLink(C.ink), marginTop: 12 }}>{fuPhoto ? "Photo added. Change" : "+ Add a photo (optional)"}</button>
        <button
          style={{ ...squareBtn(true), width: "100%", marginTop: 14 }}
          onClick={() => {
            submitReceived({ primary, detailAnswer: fuDetail, kept: fuKept, recommend: fuRec, confidence: fuConf, photoFile: fuPhoto, take: fuTake.trim() || null });
            setFuThanks(true);
            setFuDismiss(true);
          }}
        >
          Done
        </button>
      </>
    );
  })();

  // ── The conversation
  const tabBtn = (key: "responses" | "followups", label: string) => (
    <button
      onClick={() => setTab(key)}
      style={{
        ...meta(12, tab === key ? C.ink : C.muted),
        fontWeight: 700,
        background: "none",
        border: "none",
        padding: "0 0 12px",
        cursor: "pointer",
        borderBottom: `2px solid ${tab === key ? C.burgundy : "transparent"}`,
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );

  const conversation = (
    <section ref={convoRef} style={{ marginTop: isMobile ? 34 : 48, scrollMarginTop: 96 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${C.rule}` }}>
        <div style={{ display: "flex", gap: isMobile ? 22 : 34 }}>
          {tabBtn("responses", isLFPost ? `Comments (${before.length})` : `Responses (${d.responses.length + before.length})`)}
          {resolved && tabBtn("followups", `Follow-ups (${after.length})`)}
        </div>
        {tab === "responses" && d.responses.length > 1 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingBottom: 12 }}>
            <span style={meta(10.5, C.muted)}>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
              style={{ ...meta(10.5, C.ink), fontWeight: 700, background: "transparent", border: "none", borderRadius: 0, WebkitAppearance: "none", appearance: "none", cursor: "pointer", outline: "none" }}>
              <option value="match">Highest match</option>
              <option value="helpful">Most helpful</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        )}
      </div>

      {tab === "responses" ? (
        <div>
          {d.responses.length > 1 && (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "16px 0 4px" }}>
              {([
                ["all", `All (${d.responses.length})`],
                ["buy", `Would buy (${counts.buy})`],
                ["do_not_buy", `Wouldn't buy (${counts.do_not_buy})`],
                ["need_more_info", `Depends (${counts.need_more_info})`],
              ] as const).filter(([k]) => k === "all" || counts[k as keyof typeof counts] > 0).map(([k, label]) => (
                <button key={k} onClick={() => setVerdict(k)}
                  style={{ ...meta(10.5, verdict === k ? C.ink : C.muted), fontWeight: verdict === k ? 700 : 600, background: "none", border: "none", padding: "0 0 4px", cursor: "pointer", borderBottom: `1px solid ${verdict === k ? C.ink : "transparent"}` }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {!isLFPost && d.responses.length === 0 && (
            <p style={{ ...body(14, C.muted), padding: "22px 0" }}>
              {resolved ? "No one weighed in on this one." : isOwn ? "No responses yet. Your mirrors will start weighing in." : "No responses yet. Be the first to weigh in."}
            </p>
          )}
          {d.responses.length > 0 && responses.length === 0 && (
            <p style={{ ...body(14, C.muted), padding: "22px 0" }}>None in this filter.</p>
          )}
          {responses.map((r) => (
            <ResponseItem
              key={r.id}
              resp={r}
              helpfulCount={helpful(r)}
              myVote={userVotes[r.id]}
              canVote={!!viewer && viewer.id !== r.user_id}
              onHelpful={onHelpful}
              user={viewer}
              onSubmitReply={onSubmitReply}
              onDeleteReply={onDeleteReply}
              onEditReply={onEditReply}
              onSignIn={onSignIn}
              focused={focusResponseId === r.id}
              isMobile={isMobile}
            />
          ))}

          {!isLFPost && !isOwn && !resolved && viewer && (
            <button onClick={onWeighIn} style={{ ...textLink(C.burgundy), marginTop: 20, fontSize: 12 }}>
              + Add your thoughts <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          )}

          {/* Whatever was said while she was deciding stays here, read-only.
              Weighing in is how you join an open decision, and anything asked
              after she decides belongs in Follow-ups, so there's no composer. */}
          {before.length > 0 && (
            <div style={{ marginTop: isLFPost ? 8 : 36 }}>
              <CommentThread
                comments={before}
                user={viewer}
                posterId={d.user_id}
                isClosed={false}
                heading={isLFPost ? null : `Comments (${before.length})`}
                emptyHint={null}
                placeholder="Ask a question..."
                submitLabel="Ask"
                hideComposer
                onSubmit={onSubmitComment}
                onDelete={onDeleteComment}
                onEdit={onEditComment}
                onSignIn={onSignIn}
              />
            </div>
          )}
        </div>
      ) : (
        <div style={{ paddingTop: 8 }}>
          <CommentThread
            comments={after}
            user={viewer}
            posterId={d.user_id}
            isClosed
            heading={null}
            emptyHint={isOwn
              ? "No follow-ups yet. When someone asks how it held up, it'll show here."
              : isLFPost ? "How is it holding up? Would she buy it again? Ask her." : "How did it hold up? Would she still recommend it? What did she buy instead? Ask her."}
            placeholder={isOwn ? "Add an update..." : "Add a follow-up..."}
            submitLabel={isOwn ? "Post update" : "Add a follow-up"}
            onSubmit={onSubmitComment}
            onDelete={onDeleteComment}
            onEdit={onEditComment}
            onSignIn={onSignIn}
          />
        </div>
      )}
    </section>
  );

  // ── Similar decisions: a library of real experiences, not a catalogue.
  const similarBlock = similar.length > 0 && (
    <aside>
      <p style={{ ...meta(11, C.ink), marginBottom: 14 }}>Similar decisions</p>
      <div style={{ display: "grid", gridTemplateColumns: wide || isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: isMobile ? 0 : 18 }}>
        {similar.map((s) => {
          const st = decisionState(s, viewer?.id ?? null);
          const img = s.product_image_url ?? s.outcomes?.[0]?.alt_product_image_url ?? null;
          return (
            <button key={s.id} onClick={() => onOpenDecision(s.id)}
              style={{ display: "block", textAlign: "left", background: "none", border: "none", padding: isMobile ? "14px 0" : 0, borderBottom: isMobile ? `1px solid ${C.rule}` : "none", cursor: "pointer" }}>
              <div style={{ display: isMobile ? "grid" : "block", gridTemplateColumns: "88px 1fr", gap: 14, alignItems: "center" }}>
                <div style={{ background: C.well, aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {img ? <img src={img} alt="" loading="lazy" style={{ maxWidth: "86%", maxHeight: "86%", objectFit: "contain", mixBlendMode: "multiply" }} />
                    : <p style={{ ...display(18), padding: 10, textAlign: "center" }}>{s.lf_title ?? ""}</p>}
                </div>
                <div style={{ marginTop: isMobile ? 0 : 10 }}>
                  <p style={{ ...strong(12), textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.brand_name || s.lf_title || ""}</p>
                  <p style={{ ...body(12, C.inkSoft), textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{s.product_name || ""}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={display(22, stateColor(st))}>{STATE_WORD[st]}</span>
                    <ArrowRight style={{ width: 18, height: 18, color: C.ink }} strokeWidth={1.5} />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );

  // A resolved decision is where the later questions come from: how it held up,
  // whether she'd buy it again. One line and one button, in the same voice as
  // the rest of the view.
  const firstName = (p?.display_name ?? "").trim().split(" ")[0] || "her";
  const askFollowUp = () => {
    setTab("followups");
    setTimeout(() => {
      convoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      convoRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
    }, 90);
  };
  const followUpPrompt = resolved && (
    <div style={{ padding: "26px 0", borderBottom: `1px solid ${C.rule}` }}>
      <p style={{ ...meta(11, C.ink), marginBottom: 12 }}>Follow up</p>
      <p style={display(isMobile ? 32 : 42)}>
        {isOwn ? "How is it holding up?" : `Have a question for ${firstName}?`}
      </p>
      <button onClick={() => (viewer ? askFollowUp() : onSignIn())} style={{ ...squareBtn(true, C.burgundy), width: "100%", marginTop: 20 }}>
        {isOwn ? "Post an update" : "Ask a follow-up"} <ArrowRight style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );

  const infoColumn = (
    <div style={{ minWidth: 0 }}>
      {concernsBlock}
      {!editing && confidenceBlock}
      {openActions}
      {myDecision}
      {followUpPrompt}
      {receivedFlow}
      {isOwn && fuThanks && (
        <p style={{ ...body(14, C.ink), padding: "18px 0", borderBottom: `1px solid ${C.rule}` }}>
          Your experience is now part of ELEVENELEVEN. It will help women like you shop with more confidence.
        </p>
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60 }} role="dialog" aria-modal="true" aria-label="Decision">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: C.scrim }}
      />
      <motion.div
        initial={isMobile ? { y: "100%" } : { x: 60, opacity: 0 }}
        animate={isMobile ? { y: 0 } : { x: 0, opacity: 1 }}
        exit={isMobile ? { y: "100%" } : { x: 60, opacity: 0 }}
        transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: panelWidth,
          background: C.paper, overflowY: "auto", overscrollBehavior: "contain",
          boxShadow: isMobile ? "none" : "-24px 0 60px rgba(0,0,0,0.12)",
        }}
      >
        {/* The bar: who, and the way out */}
        <div style={{
          position: "sticky", top: 0, zIndex: 3, background: C.paper,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: isMobile ? "12px 18px" : "22px 44px", borderBottom: `1px solid ${C.rule}`,
        }}>
          {identity}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, alignSelf: "flex-start" }}>
            <button
              onClick={() => (viewer ? onSave() : onSignIn())}
              aria-label={isSaved ? "Saved" : "Save"}
              aria-pressed={isSaved}
              data-tip={isSaved ? "Saved" : "Save"}
              className="e11-tip"
              style={{ background: "none", border: "none", padding: 6, cursor: "pointer", color: C.ink, lineHeight: 0 }}
            >
              <Bookmark style={{ width: 20, height: 20 }} strokeWidth={1.6} fill={isSaved ? C.ink : "none"} />
            </button>
            {viewer && menu}
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="e11-close"
              style={{ background: "none", border: "none", padding: 6, cursor: "pointer", color: C.ink, lineHeight: 0 }}>
              <X style={{ width: 26, height: 26 }} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {customBody ? (
          <div style={{ padding: isMobile ? "18px 18px 60px" : "34px 44px 80px" }}>
            {/* The body places the follow-up prompt itself, since where it sits
                depends on the layout it draws. */}
            {isValidElement<{ followUp?: React.ReactNode }>(customBody)
              ? cloneElement(customBody, { followUp: followUpPrompt || null })
              : customBody}
            {(!isLFPost || resolved || before.length > 0) && conversation}
          </div>
        ) : (
        <div style={{ padding: isMobile ? "0 18px 60px" : "0 44px 80px" }}>
          {profileLine}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : wide && similar.length > 0 ? "minmax(0, 0.95fr) minmax(0, 1fr) 190px" : "minmax(0, 0.95fr) minmax(0, 1fr)",
            columnGap: isMobile ? 0 : 44,
            rowGap: 28,
            paddingTop: isMobile ? 18 : 34,
            alignItems: "start",
          }}>
            {imageColumn}
            {infoColumn}
            {wide && similarBlock && <div style={{ borderLeft: `1px solid ${C.rule}`, paddingLeft: 24 }}>{similarBlock}</div>}
          </div>

          {conversation}

          {!wide && similarBlock && (
            <div style={{ marginTop: isMobile ? 40 : 56, paddingTop: 24, borderTop: `1px solid ${C.rule}` }}>{similarBlock}</div>
          )}
        </div>
        )}
      </motion.div>
    </div>
  );
}
