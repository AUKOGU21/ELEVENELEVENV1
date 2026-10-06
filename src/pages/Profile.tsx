import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, LogOut, MoreHorizontal, Plus, X } from "lucide-react";
import Cropper from "react-easy-crop";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { SILHOUETTE_OPTIONS, STYLE_OPTIONS, HEIGHT_OPTIONS, SIZE_OPTIONS } from "@/components/onboarding/OnboardingData";
import { DialInFitModal } from "@/components/DialInFitModal";
import { tierFor, nextTier } from "@/lib/tiers";
import { computeMatchScore } from "@/lib/matching";
import { imageToJpeg } from "@/lib/image";
import { C, RADIUS, SANS, body, display, meta, strong } from "@/lib/design";
import DecisionTile, { type TileDecision } from "@/components/DecisionTile";
import MatchSeal from "@/components/MatchSeal";
import { getInitials } from "@/lib/format";

// ════════════════════════════════════════════════════════════════════════════
// Shared with PublicProfile.tsx
// Her profile and someone else's are the same page seen from two sides, so the
// layout, the data helpers and the read-only sections live here once. The page
// component for /profile is further down.
// ════════════════════════════════════════════════════════════════════════════

/** Phones stack, tablets go two up, desktop gets the three-column hero and the section rail. */
export function useViewport() {
  const read = () => (typeof window === "undefined" ? 1280 : window.innerWidth);
  const [w, setW] = useState(read);
  useEffect(() => {
    const on = () => setW(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return { isMobile: w < 768, isWide: w >= 1100 };
}

export const wrap = (isMobile: boolean): React.CSSProperties => ({
  maxWidth: 1320,
  margin: "0 auto",
  padding: isMobile ? "0 16px" : "0 40px",
  boxSizing: "border-box",
});

export const squareBtn = (filled: boolean, colour: string = C.ink): React.CSSProperties => ({
  ...meta(12, filled ? "#FFFFFF" : colour),
  fontWeight: 700,
  letterSpacing: "0.16em",
  background: filled ? colour : "transparent",
  border: `1px solid ${colour}`,
  borderRadius: RADIUS,
  padding: "15px 22px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  whiteSpace: "nowrap",
});

/** A square outline button holding one icon, the height of the buttons beside it. */
const iconSquare: React.CSSProperties = {
  width: 48,
  flexShrink: 0,
  border: `1px solid ${C.ink}`,
  borderRadius: RADIUS,
  background: "transparent",
  color: C.ink,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

export const textLink = (colour: string = C.ink): React.CSSProperties => ({
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

// 16px so iOS doesn't zoom the page when a field takes focus.
const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: RADIUS,
  border: `1px solid ${C.rule}`,
  background: "#FFFFFF",
  padding: "11px 13px",
  fontFamily: SANS,
  fontSize: 16,
  lineHeight: 1.5,
  color: C.ink,
  outline: "none",
  resize: "none",
};

const arrow = <ArrowRight style={{ width: 14, height: 14 }} strokeWidth={2} />;

// ── Data ──────────────────────────────────────────────────────────────────────

/** A decision as a profile tile. sortAt is when it was posted, or when she saved it. */
export type ProfileTile = TileDecision & { sortAt: string };

/** What DecisionTile needs. Outcomes are fetched on their own: see withTileExtras. */
export const TILE_FIELDS: string = `
  id, user_id, created_at, status, post_type, product_name, brand_name,
  product_image_url, product_image_url_2, lf_title, lf_budget, lf_occasion,
  responses ( id ),
  profiles ( display_name, avatar_url, badge_tier, city )
`;

/**
 * Attach outcomes and Looking For picks to a set of decision rows. Outcomes are
 * fetched separately because embedding them in the decisions select trips
 * PostgREST's FK detection and comes back null.
 */
export async function withTileExtras(rows: any[]): Promise<ProfileTile[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const lfIds = rows.filter((r) => r.post_type === "looking_for").map((r) => r.id);
  const [outRes, recRes] = await Promise.all([
    supabase
      .from("outcomes")
      .select("decision_id, did_purchase, outcome_type, alt_product_image_url, created_at")
      .in("decision_id", ids)
      .order("created_at", { ascending: false }),
    lfIds.length
      ? supabase.from("recommendations").select("id, looking_for_id").in("looking_for_id", lfIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const outBy: Record<string, any> = {};
  ((outRes as any).data ?? []).forEach((o: any) => { if (!outBy[o.decision_id]) outBy[o.decision_id] = o; });
  const recBy: Record<string, any[]> = {};
  ((recRes as any).data ?? []).forEach((r: any) => { (recBy[r.looking_for_id] ??= []).push(r); });
  return rows.map((r) => ({
    ...r,
    outcomes: outBy[r.id] ? [outBy[r.id]] : null,
    recommendations: recBy[r.id] ?? [],
    sortAt: r.sortAt ?? r.created_at,
  }));
}

/**
 * Takes given and helpful votes, counted from response_votes. The cached
 * responses.helpfulness_votes column can't be written by non-owners (RLS), so it
 * goes stale. Both pages count the same way so the tier always agrees.
 */
export async function helpfulStats(userId: string): Promise<{ responses: number; helpfulVotes: number }> {
  const { data: mine } = await supabase.from("responses").select("id").eq("user_id", userId);
  const ids = (mine ?? []).map((r: any) => r.id);
  if (!ids.length) return { responses: 0, helpfulVotes: 0 };
  const { count } = await supabase
    .from("response_votes")
    .select("*", { count: "exact", head: true })
    .eq("vote_type", "helpful")
    .in("response_id", ids);
  return { responses: ids.length, helpfulVotes: count ?? 0 };
}

export function silhouetteFor(profile: any) {
  const raw = profile?.silhouette_preference;
  const label = Array.isArray(raw) ? raw[0] : typeof raw === "string" ? raw : null;
  return SILHOUETTE_OPTIONS.find((s) => s.label === label) ?? null;
}

/** Fit photos live inside fit_details so they didn't need a column of their own. */
export function fitPhotosFor(profile: any): string[] {
  const stored = profile?.fit_details?._fit_photos ?? profile?.fit_photo_urls ?? [];
  return Array.isArray(stored) ? stored : [];
}

const AVERAGE_TERMS = ["average", "about average", "typical", "standard", "normal", "medium", "moderate"];
const isAverage = (v: string) => AVERAGE_TERMS.some((t) => v.toLowerCase().includes(t));

/** The nuances only: no height or size repeats, nothing average, no "Overall fit". */
export function fitTagsFor(profile: any): string[] {
  const fd = profile?.fit_details as Record<string, unknown> | null;
  const notable = fd
    ? Object.entries(fd)
        // String answers only: meta keys like _fit_photos are arrays.
        .filter(([k, v]) => typeof v === "string" && v && k !== "Overall fit" && !k.startsWith("_") && !isAverage(v))
        .map(([, v]) => v as string)
    : [];
  return [
    profile?.fit_preference && !isAverage(profile.fit_preference) ? profile.fit_preference : null,
    ...notable,
  ].filter(Boolean) as string[];
}

/** "Alexis Ukogu" to ["Alexis", "Ukogu"]: first name on its own line, the rest below. */
export function nameParts(full: string): string[] {
  const p = full.trim().split(/\s+/).filter(Boolean);
  return p.length <= 1 ? p : [p[0], p.slice(1).join(" ")];
}

// ── Frame ─────────────────────────────────────────────────────────────────────

function Wordmark({ size, spacing = "0.32em" }: { size: number; spacing?: string }) {
  return (
    <span style={{ fontFamily: SANS, textTransform: "uppercase", letterSpacing: spacing, fontSize: size, color: C.ink, whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: 700 }}>ELEVEN</span>
      <span style={{ fontWeight: 300 }}>ELEVEN</span>
    </span>
  );
}

/** The feed's header: wordmark, FEED / MINE, and whatever the page needs on the right. */
export function ProfileHeader({ isMobile, right }: { isMobile: boolean; right: React.ReactNode }) {
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(isMobile ? 46 : 70);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tab: React.CSSProperties = {
    ...meta(isMobile ? 10.5 : 12, C.ink),
    fontWeight: 700,
    background: "none",
    border: "none",
    padding: 0,
    lineHeight: 1,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  return (
    <>
      <header ref={headerRef} style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 40, background: C.paper, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, padding: isMobile ? "12px 16px" : "20px 40px" }}>
        <button
          onClick={() => navigate("/", { state: { home: true } })}
          aria-label="ElevenEleven home"
          style={{ justifySelf: "start", background: "none", border: "none", padding: 0, cursor: "pointer", lineHeight: 1 }}
        >
          <Wordmark size={isMobile ? 10.5 : 15} spacing={isMobile ? "0.12em" : "0.32em"} />
        </button>
        <nav style={{ display: "flex", gap: isMobile ? 20 : 56 }}>
          <button onClick={() => navigate("/feed")} style={tab}>Feed</button>
          <button onClick={() => navigate("/feed", { state: { tab: "mine" } })} style={tab}>Mine</button>
        </nav>
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: isMobile ? 10 : 18 }}>{right}</div>
      </div>
      </header>
      {/* The fixed header's own height, so the page starts under it. */}
      <div aria-hidden style={{ height: headerH }} />
    </>
  );
}

export function ProfileFooter({ isMobile }: { isMobile: boolean }) {
  return (
    <footer style={{
      borderTop: `1px solid ${C.rule}`, marginTop: isMobile ? 56 : 88, padding: isMobile ? "18px 0 36px" : "24px 0 48px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
    }}>
      <p style={{ ...meta(isMobile ? 9.5 : 10.5, C.ink), letterSpacing: "0.3em", fontWeight: 500 }}>Real women. Real decisions.</p>
      <Wordmark size={isMobile ? 10 : 11} />
    </footer>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

/**
 * Who she is, her photo, and her in real outfits.
 *
 * On a phone it is built to be short: her name on top with Edit (or Follow) in
 * the top right corner, the portrait small with her standing beside it, then
 * You, IRL and Ask me about. Desktop keeps the three columns.
 */
export function ProfileTop({ isMobile, isWide, name, facts, since, bio, portrait, status, actions, irl, askAbout }: {
  isMobile: boolean;
  isWide: boolean;
  name: string;
  /** Age and city, already filtered. */
  facts: (string | number)[];
  /** When she joined: shown only when she has no standing yet. */
  since?: string | null;
  bio?: string | null;
  portrait: React.ReactNode;
  /** Her tier and helpful count, for everyone to see. */
  status: React.ReactNode | null;
  actions: React.ReactNode;
  irl: React.ReactNode | null;
  askAbout: React.ReactNode | null;
}) {
  const line = <IdentityLine facts={facts} tier={null} since={status ? null : since} />;
  const nameRow = (compact: boolean) => (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <BigName name={name} isMobile={compact} compact={compact} />
        <div style={{ marginTop: compact ? 8 : 14 }}>{line}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{actions}</div>
    </div>
  );

  if (isMobile) {
    return (
      <div>
        {nameRow(true)}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginTop: 16 }}>
          <div style={{ width: 120, flexShrink: 0 }}>{portrait}</div>
          {(status || bio) && (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, paddingTop: 2 }}>
              {status}
              {bio && <p style={{ ...body(13.5), whiteSpace: "pre-line" }}>{bio}</p>}
            </div>
          )}
        </div>
        {irl && <div style={{ marginTop: 26 }}>{irl}</div>}
        {askAbout && <div style={{ marginTop: 24 }}>{askAbout}</div>}
      </div>
    );
  }

  const third = irl || askAbout ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {irl}
      {askAbout}
    </div>
  ) : null;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isWide ? (third ? "260px minmax(0, 1fr) minmax(0, 0.9fr)" : "260px minmax(0, 1fr)") : "220px minmax(0, 1fr)",
      columnGap: isWide ? 48 : 36,
      rowGap: 36,
      alignItems: "start",
    }}>
      <div>{portrait}</div>
      <div style={{ minWidth: 0, paddingTop: 4 }}>
        {nameRow(false)}
        {status && <div style={{ marginTop: 22 }}>{status}</div>}
        {bio && <p style={{ ...body(15.5), marginTop: 16, maxWidth: "42ch", whiteSpace: "pre-line" }}>{bio}</p>}
      </div>
      {third && <div style={isWide ? { minWidth: 0 } : { gridColumn: "1 / -1", maxWidth: 560 }}>{third}</div>}
    </div>
  );
}

/** Her tier and how many of her takes were marked helpful. Public: this is how others read her standing. */
export function TierStatus({ tier, helpful, isMobile, children }: { tier: string | null; helpful: number; isMobile: boolean; children?: React.ReactNode }) {
  if (!tier && !helpful && !children) return null;
  return (
    <div>
      {tier && <p style={{ ...meta(11, C.burgundy), fontWeight: 700 }}>{tier}</p>}
      {(tier || helpful > 0) && (
        <p style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 10, rowGap: 4, marginTop: tier ? 8 : 0, marginBottom: 0 }}>
          <span style={display(isMobile ? 30 : 38)}>{helpful}</span>
          <span style={meta(10)}>{helpful === 1 ? "Helpful response" : "Helpful responses"}</span>
        </p>
      )}
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

/** A heading inside the header (You, IRL / Ask me about): the name's typeface, a few sizes down. */
export const headerLabel: React.CSSProperties = display("clamp(22px, 2.1vw, 28px)");

export function Portrait({ url, name, onPick }: { url: string | null; name: string; onPick?: () => void }) {
  const box: React.CSSProperties = {
    width: "100%", aspectRatio: "1 / 1", height: "auto", background: C.well, borderRadius: RADIUS, overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0, border: "none",
  };
  const inner = url
    ? <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    : <span style={display("clamp(40px, 7vw, 110px)", C.faint)}>{getInitials(name)}</span>;
  return onPick
    ? <button onClick={onPick} aria-label="Add a photo" style={{ ...box, cursor: "pointer" }}>{inner}</button>
    : <div style={box}>{inner}</div>;
}

/** "29 · Boston" and her tier beside it. Below the first rung, when she joined. */
export function IdentityLine({ facts, tier, since }: { facts: (string | number)[]; tier: string | null; since?: string | null }) {
  const d = !tier && since ? new Date(since) : null;
  const joined = d && !isNaN(d.getTime()) ? `Member since ${d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : null;
  if (!facts.length && !tier && !joined) return null;
  return (
    <p style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 18, rowGap: 6, margin: 0 }}>
      {facts.length > 0 && <span style={meta(11, C.inkSoft)}>{facts.join(" · ")}</span>}
      {tier
        ? <span style={{ ...meta(11, C.burgundy), fontWeight: 700 }}>{tier}</span>
        : joined && <span style={meta(11, C.muted)}>{joined}</span>}
    </p>
  );
}

/** Desktop sets first name over surname, big. A phone runs it on one line at a size that leaves room for the rest. */
export function BigName({ name, isMobile, compact }: { name: string; isMobile: boolean; compact?: boolean }) {
  if (compact) {
    return <h1 style={{ ...display("clamp(30px, 9vw, 40px)"), lineHeight: 0.95, overflowWrap: "anywhere" }}>{name}</h1>;
  }
  const parts = nameParts(name);
  // Long names step down so a surname never has to break mid-word.
  const longest = Math.max(1, ...parts.flatMap((p) => p.split(/\s+/)).map((w) => w.length));
  const scale = longest > 12 ? 0.62 : longest > 9 ? 0.78 : 1;
  const [min, vw, max] = isMobile ? [50, 16, 72] : [56, 5.8, 96];
  const size = `clamp(${Math.round(min * scale)}px, ${(vw * scale).toFixed(2)}vw, ${Math.round(max * scale)}px)`;
  return (
    <h1 style={{ ...display(size), lineHeight: 0.88, overflowWrap: "anywhere" }}>
      {parts.map((p, i) => <span key={i} style={{ display: "block" }}>{p}</span>)}
    </h1>
  );
}

/**
 * Ask me about: what she knows well, set as a slash line like her fit details.
 * Three show, then +N. The owner gets a way in when it is empty.
 */
export function AskMeAbout({ items, isMobile, onAdd }: { items: string[]; isMobile: boolean; onAdd?: () => void }) {
  const [all, setAll] = useState(false);
  if (!items.length && !onAdd) return null;
  const shown = all ? items : items.slice(0, 3);
  const more = items.length - shown.length;
  return (
    <div>
      <h2 style={headerLabel}>Ask me about</h2>
      {items.length > 0 ? (
        <p style={{ ...meta(isMobile ? 12 : 13, C.ink), lineHeight: 1.9, marginTop: 10 }}>
          {shown.map((t, i) => (
            <span key={`${t}-${i}`}>
              {/* Spaces round the slash are where a line may break; an entry never breaks inside itself. */}
              {i > 0 && <span style={{ color: C.faint, padding: "0 4px" }}> / </span>}
              <span style={{ whiteSpace: "nowrap" }}>{t}</span>
            </span>
          ))}
          {more > 0 && " "}
          {more > 0 && (
            <button onClick={() => setAll(true)} aria-label={`Show ${more} more`} style={{ ...textLink(C.burgundy), fontSize: "inherit", marginLeft: 8, verticalAlign: "baseline" }}>
              +{more}
            </button>
          )}
        </p>
      ) : (
        <button onClick={onAdd} style={{ ...textLink(C.burgundy), marginTop: 10 }}>Add what people should ask you {arrow}</button>
      )}
    </div>
  );
}

/** "You, IRL": up to three photos of her in real outfits. The owner gets add slots. */
export function IrlPhotos({ label, photos, onOpen, owner }: {
  label: string;
  photos: string[];
  onOpen: (i: number) => void;
  owner?: { onAdd: () => void; confirm: boolean };
}) {
  const empties = owner ? Math.max(0, 3 - photos.length) : 0;
  return (
    <div>
      <h2 style={headerLabel}>{label}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 14 }}>
        {photos.map((url, i) => (
          <button
            key={url}
            onClick={() => onOpen(i)}
            aria-label={`Open photo ${i + 1}`}
            style={{ padding: 0, border: "none", background: C.well, borderRadius: RADIUS, overflow: "hidden", aspectRatio: "2 / 3", cursor: "zoom-in", display: "block" }}
          >
            {/* Some older uploads are raw HEIC, which only Safari can draw: show the empty well, not a broken icon. */}
            <img src={url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
          </button>
        ))}
        {owner && Array.from({ length: empties }).map((_, i) => (
          <button
            key={`add-${i}`}
            onClick={owner.onAdd}
            aria-label="Add a photo"
            style={{
              aspectRatio: "2 / 3", border: `1px solid ${C.rule}`, borderRadius: RADIUS, background: "transparent",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: C.muted, padding: 0,
            }}
          >
            <Plus style={{ width: 18, height: 18 }} strokeWidth={1.5} />
            {i === 0 && <span style={meta(10, C.muted)}>Add photo</span>}
          </button>
        ))}
      </div>
      {owner && photos.length === 0 && (
        <>
          <p style={{ ...body(13), marginTop: 14, maxWidth: "46ch" }}>
            <span style={{ fontWeight: 700, color: C.ink }}>Help someone like you decide.</span>{" "}
            Add 1 to 3 photos so women with a similar body can see how things actually fit.
          </p>
          <p style={{ ...meta(10, C.muted), marginTop: 10 }}>Full body / natural lighting / everyday outfits</p>
        </>
      )}
      <AnimatePresence>
        {owner?.confirm && (
          <motion.p
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ ...body(13, C.ink), marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}
          >
            <Check style={{ width: 14, height: 14 }} strokeWidth={2} /> Your profile is now more helpful to others
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Full-screen photo viewer. Arrows, the keyboard and the bars underneath all move between photos. */
export function Lightbox({ photos, index, onIndex, onClose }: {
  photos: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex, onClose]);

  const btn = (pos: React.CSSProperties): React.CSSProperties => ({
    position: "absolute", ...pos, background: "none", border: "none", padding: 10, cursor: "pointer", color: "#FFFFFF", lineHeight: 0,
  });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(20,18,16,0.94)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <button aria-label="Close" onClick={onClose} style={btn({ top: 14, right: 14 })}>
        <X style={{ width: 22, height: 22 }} strokeWidth={1.5} />
      </button>
      {index > 0 && (
        <button aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} style={btn({ left: 10, top: "50%", transform: "translateY(-50%)" })}>
          <ArrowLeft style={{ width: 24, height: 24 }} strokeWidth={1.5} />
        </button>
      )}
      <motion.img
        key={index}
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}
        src={photos[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "86vh", maxWidth: "86vw", objectFit: "contain", borderRadius: RADIUS }}
      />
      {index < photos.length - 1 && (
        <button aria-label="Next photo" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} style={btn({ right: 10, top: "50%", transform: "translateY(-50%)" })}>
          <ArrowRight style={{ width: 24, height: 24 }} strokeWidth={1.5} />
        </button>
      )}
      {photos.length > 1 && (
        <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4 }}>
          {photos.map((_, i) => (
            <button
              key={i}
              aria-label={`Photo ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); onIndex(i); }}
              style={{ background: "none", border: "none", padding: "10px 2px", cursor: "pointer", lineHeight: 0 }}
            >
              <span style={{ display: "block", width: 20, height: 2, background: i === index ? "#FFFFFF" : "rgba(255,255,255,0.35)", transition: "background .2s" }} />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Three numbers on a plain row. With `progress` (her own profile only) a thin
 * bar underneath shows how far she is from the next tier.
 */
export function StatsRow({ decisions, takes, helpful, isMobile, progress }: { decisions: number; takes: number; helpful: number; isMobile: boolean; progress?: boolean }) {
  const next = nextTier(helpful);
  const threshold = next?.min ?? helpful;
  const pct = next ? Math.min(100, Math.round((helpful / Math.max(1, threshold)) * 100)) : 100;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: isMobile ? 12 : 28 }}>
        {[
          { value: decisions, label: "Decisions posted" },
          { value: takes, label: "Takes given" },
          { value: helpful, label: "Marked helpful" },
        ].map((s) => (
          <div key={s.label} style={{ minWidth: 0 }}>
            <p style={display(isMobile ? 34 : 48)}>{s.value}</p>
            <p style={{ ...meta(isMobile ? 9.5 : 10.5), marginTop: 8, lineHeight: 1.45 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {progress && (
        <div style={{ marginTop: isMobile ? 22 : 28, maxWidth: 520 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <p style={{ ...meta(10.5, C.ink), fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              {next ? <>Next <ArrowRight style={{ width: 13, height: 13 }} strokeWidth={2} /> {next.label}</> : "Highest tier"}
            </p>
            {next && <p style={meta(10.5)}>{helpful} / {threshold} helpful</p>}
          </div>
          <div
            role="progressbar"
            aria-label="Progress to the next tier"
            aria-valuemin={0}
            aria-valuemax={threshold}
            aria-valuenow={Math.min(helpful, threshold)}
            style={{ height: 4, background: "rgba(20,18,16,0.10)", marginTop: 10 }}
          >
            <div style={{ width: `${pct}%`, height: "100%", background: C.burgundy, transition: "width .6s ease" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

export type ProfileTab = { key: string; label: string; content: React.ReactNode };

/**
 * Fit profile, Style, Mirrors, Decisions: one at a time under a row of tabs.
 * Tap a tab, or on a phone swipe the content sideways. A swipe that starts on
 * something that scrolls or swipes itself (the mirrors row, a tile's photos, a
 * field) is left to that thing.
 */
export function ProfileTabs({ tabs, active, onChange, isMobile }: {
  tabs: ProfileTab[];
  active: string;
  onChange: (key: string) => void;
  isMobile: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [dir, setDir] = useState(0);
  const idx = Math.max(0, tabs.findIndex((t) => t.key === active));
  const headerH = isMobile ? 46 : 70;

  const go = (i: number) => {
    if (i < 0 || i >= tabs.length || i === idx) return;
    setDir(i > idx ? 1 : -1);
    onChange(tabs[i].key);
    // Scrolled deep into a long tab: bring the tabs back up so the new one starts at its top.
    const bar = barRef.current;
    if (bar && bar.getBoundingClientRect().top < headerH) bar.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.target as HTMLElement;
    touch.current = t.closest("[data-noswipe], .e11-carousel, input, textarea, select")
      ? null
      : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(idx + (dx < 0 ? 1 : -1));
  };

  return (
    <div>
      <div
        ref={barRef}
        role="tablist"
        onKeyDown={(e) => { if (e.key === "ArrowRight") go(idx + 1); if (e.key === "ArrowLeft") go(idx - 1); }}
        style={{
          display: "flex", justifyContent: isMobile ? "space-between" : "flex-start", gap: isMobile ? 12 : 44,
          borderBottom: `1px solid ${C.rule}`, overflowX: "auto", scrollbarWidth: "none", scrollMarginTop: headerH + 12,
        }}
      >
        {tabs.map((t, i) => {
          const on = i === idx;
          return (
            <button
              key={t.key}
              role="tab"
              id={`profile-tab-${t.key}`}
              aria-selected={on}
              aria-controls="profile-tabpanel"
              tabIndex={on ? 0 : -1}
              onClick={() => go(i)}
              style={{
                ...meta(isMobile ? 10.5 : 12, on ? C.ink : C.muted), fontWeight: 700,
                background: "none", border: "none", borderBottom: `2px solid ${on ? C.burgundy : "transparent"}`,
                padding: isMobile ? "0 0 12px" : "0 0 14px", marginBottom: -1, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id="profile-tabpanel"
        aria-labelledby={`profile-tab-${tabs[idx]?.key}`}
        onTouchStart={isMobile ? onTouchStart : undefined}
        onTouchEnd={isMobile ? onTouchEnd : undefined}
        style={{ paddingTop: isMobile ? 22 : 32, minHeight: isMobile ? 280 : 360 }}
      >
        <motion.div key={tabs[idx]?.key} initial={{ opacity: 0, x: dir * 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
          {tabs[idx]?.content}
        </motion.div>
      </div>
    </div>
  );
}

/** The line a section used to carry under its heading, and its Edit link, now that the tab is the heading. */
export function PanelNote({ aside, action, isMobile }: { aside?: string; action?: React.ReactNode; isMobile: boolean }) {
  if (!aside && !action) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: isMobile ? 18 : 24 }}>
      {aside ? <p style={body(isMobile ? 13.5 : 14)}>{aside}</p> : <span />}
      {action}
    </div>
  );
}

/**
 * Silhouette name huge, its line, then height and sizes as big values, then the
 * fit details as a slash-separated line, with the silhouette image beside it all.
 * Pass `owner` for the edit links.
 */
export function FitSummary({ profile, isMobile, owner }: {
  profile: any;
  isMobile: boolean;
  owner?: {
    onChangeSilhouette: () => void;
    onEditSizes: () => void;
    onEditFit: () => void;
    sizesEditor: React.ReactNode | null;
    showAll: boolean;
    onToggleAll: () => void;
  };
}) {
  const sil = silhouetteFor(profile);
  if (!sil) return null;
  const sizes = ([
    ["Height", profile?.height_range],
    ["Top size", profile?.top_size],
    ["Bottom size", profile?.bottom_size],
  ] as [string, string | null][]).filter(([, v]) => v);
  const tags = fitTagsFor(profile);
  const visible = owner && !owner.showAll ? tags.slice(0, 5) : tags;
  const rule = `1px solid ${C.rule}`;

  let sizesBlock: React.ReactNode = null;
  if (owner?.sizesEditor) sizesBlock = owner.sizesEditor;
  else if (sizes.length) {
    sizesBlock = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${sizes.length}, minmax(0, 1fr))`, borderTop: rule, borderBottom: rule }}>
          {sizes.map(([label, value], i) => (
            <div key={label} style={{
              paddingTop: isMobile ? 14 : 18,
              paddingBottom: isMobile ? 14 : 18,
              paddingRight: isMobile ? 10 : 20,
              paddingLeft: i === 0 ? 0 : isMobile ? 12 : 20,
              borderLeft: i ? rule : "none",
              minWidth: 0,
            }}>
              <p style={meta(isMobile ? 9.5 : 10.5)}>{label}</p>
              <p style={{ ...display(isMobile ? 22 : 34), lineHeight: 1, marginTop: 10, overflowWrap: "anywhere" }}>{value}</p>
            </div>
          ))}
        </div>
        {owner && <button onClick={owner.onEditSizes} style={{ ...textLink(C.burgundy), marginTop: 12 }}>Edit sizes</button>}
      </>
    );
  } else if (owner) {
    sizesBlock = <button onClick={owner.onEditSizes} style={textLink(C.burgundy)}>Add your sizes {arrow}</button>;
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "minmax(0, 1fr) 92px" : "minmax(0, 1fr) minmax(0, 200px)",
      gridTemplateAreas: isMobile ? `"name img" "sizes sizes" "details details"` : `"name img" "sizes img" "details img"`,
      columnGap: isMobile ? 16 : 40,
      rowGap: isMobile ? 22 : 28,
      alignItems: "start",
    }}>
      <div style={{ gridArea: "name", minWidth: 0 }}>
        <h3 style={{ ...display(isMobile ? "clamp(34px, 10vw, 44px)" : "clamp(44px, 5vw, 76px)"), overflowWrap: "anywhere" }}>{sil.label}</h3>
        <p style={{ ...body(isMobile ? 14 : 15), marginTop: 12 }}>{sil.desc}</p>
        {owner && (
          <button onClick={owner.onChangeSilhouette} style={{ ...textLink(C.burgundy), marginTop: 14 }}>Change silhouette {arrow}</button>
        )}
      </div>

      <img
        src={sil.image}
        alt={sil.label}
        style={{ gridArea: "img", width: "100%", aspectRatio: "3 / 4", objectFit: "cover", objectPosition: "top", borderRadius: RADIUS, background: C.well, display: "block" }}
      />

      {sizesBlock && <div style={{ gridArea: "sizes", minWidth: 0 }}>{sizesBlock}</div>}

      {(tags.length > 0 || owner) && (
        <div style={{ gridArea: "details", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <p style={meta(10.5)}>Fit details</p>
            {owner && <button onClick={owner.onEditFit} style={textLink(C.burgundy)}>Edit</button>}
          </div>
          {tags.length > 0 ? (
            <p style={{ ...meta(isMobile ? 12 : 13, C.ink), lineHeight: 1.9, marginTop: 10 }}>
              {visible.map((t, i) => (
                <span key={`${t}-${i}`}>
                  {i > 0 && <span style={{ color: C.faint, padding: "0 10px" }}>/</span>}
                  {t}
                </span>
              ))}
            </p>
          ) : (
            <p style={{ ...body(13.5, C.muted), marginTop: 10 }}>Not set yet. Tap Edit to dial in your fit.</p>
          )}
          {owner && tags.length > 5 && (
            <button onClick={owner.onToggleAll} style={{ ...textLink(C.muted), marginTop: 10 }}>
              {owner.showAll ? "Show less" : `${tags.length - 5} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Her aesthetics as an editorial row: the picture, the word, the line. */
export function StyleRow({ labels, isMobile }: { labels: string[]; isMobile: boolean }) {
  const opts = labels
    .map((l) => STYLE_OPTIONS.find((s) => s.label === l))
    .filter((o): o is (typeof STYLE_OPTIONS)[number] => !!o);
  if (!opts.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(3, minmax(0, 260px))", gap: isMobile ? 10 : 28 }}>
      {opts.map((o) => (
        <figure key={o.label} style={{ margin: 0, minWidth: 0 }}>
          <div style={{ aspectRatio: "3 / 4", background: C.well, borderRadius: RADIUS, overflow: "hidden" }}>
            <img src={o.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
          </div>
          <figcaption style={{ marginTop: isMobile ? 10 : 14 }}>
            <span style={{ ...display(isMobile ? 18 : 28), display: "block", overflowWrap: "anywhere" }}>{o.label}</span>
            {!isMobile && <span style={{ ...body(13, C.muted), display: "block", marginTop: 8 }}>{o.desc}</span>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function EmptyNote({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ padding: "4px 0" }}>
      <p style={{ ...body(15), maxWidth: "46ch" }}>{text}</p>
      {action && onAction && (
        <button onClick={onAction} style={{ ...textLink(C.burgundy), marginTop: 14 }}>{action} {arrow}</button>
      )}
    </div>
  );
}

// ── Decisions ─────────────────────────────────────────────────────────────────

type Sort = "recent" | "oldest" | "discussed";
const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest" },
  { value: "discussed", label: "Most discussed" },
];
const PAGE = 12;
const talk = (d: ProfileTile) => (d.responses?.length ?? 0) + (d.recommendations?.length ?? 0);
const at = (s: string) => new Date(s).getTime() || 0;

function SortControl({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, position: "relative", paddingBottom: 10 }}>
      <span style={meta(10.5)}>Sort:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Sort)}
        style={{
          ...meta(10.5, C.ink), fontWeight: 700, appearance: "none", WebkitAppearance: "none",
          background: "none", border: "none", borderRadius: 0, padding: "0 18px 0 0", cursor: "pointer", outline: "none",
        }}
      >
        {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <ChevronDown style={{ width: 13, height: 13, position: "absolute", right: 0, top: 1, pointerEvents: "none", color: C.ink }} />
    </label>
  );
}

/**
 * Her decisions as the feed's tiles, with a sort and no category filters. Pass
 * `saved` and `onTab` to add a Saved tab beside the heading.
 */
export function DecisionsBlock({ heading, decisions, saved, tab = "decisions", onTab, viewerId, isMobile, onOpen, empty, emptySaved, sectionRef, bare }: {
  heading: string;
  decisions: ProfileTile[] | null;
  saved?: ProfileTile[] | null;
  tab?: "decisions" | "saved";
  onTab?: (t: "decisions" | "saved") => void;
  viewerId: string | null;
  isMobile: boolean;
  onOpen: (id: string) => void;
  empty: React.ReactNode;
  emptySaved?: React.ReactNode;
  sectionRef?: React.Ref<HTMLElement>;
  /** Inside a profile tab: no rule or gap above it. */
  bare?: boolean;
}) {
  const [sort, setSort] = useState<Sort>("recent");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setShowAll(false); }, [tab, sort]);

  const hasSaved = saved !== undefined && !!onTab;
  const onSaved = hasSaved && tab === "saved";
  const list = onSaved ? saved : decisions;
  const sorted = useMemo(() => {
    if (!list) return null;
    return [...list].sort((a, b) =>
      sort === "oldest" ? at(a.sortAt) - at(b.sortAt)
      : sort === "discussed" ? talk(b) - talk(a) || at(b.sortAt) - at(a.sortAt)
      : at(b.sortAt) - at(a.sortAt));
  }, [list, sort]);
  const visible = sorted ? (showAll ? sorted : sorted.slice(0, PAGE)) : null;

  const count = (l: ProfileTile[] | null | undefined) => (l && l.length ? ` (${l.length})` : "");
  const size = isMobile ? 30 : "clamp(34px, 3.4vw, 50px)";
  const tabStyle = (active: boolean): React.CSSProperties => ({
    ...display(size, active ? C.ink : C.faint),
    background: "none", border: "none", padding: "0 0 8px", cursor: "pointer", textAlign: "left",
    borderBottom: `3px solid ${active ? C.burgundy : "transparent"}`,
  });

  return (
    <section ref={sectionRef} style={bare ? undefined : { borderTop: `1px solid ${C.rule}`, marginTop: isMobile ? 44 : 64, paddingTop: isMobile ? 22 : 32, scrollMarginTop: 90 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", columnGap: 24, rowGap: 14 }}>
        {hasSaved ? (
          <div role="tablist" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", columnGap: isMobile ? 22 : 40, rowGap: 8 }}>
            <button role="tab" aria-selected={!onSaved} onClick={() => onTab!("decisions")} style={tabStyle(!onSaved)}>
              {isMobile ? "Decisions" : heading}{count(decisions)}
            </button>
            <button role="tab" aria-selected={onSaved} onClick={() => onTab!("saved")} style={tabStyle(onSaved)}>
              Saved{count(saved)}
            </button>
          </div>
        ) : (
          <h2 style={{ ...display(size), paddingBottom: 11 }}>{heading}{count(decisions)}</h2>
        )}
        {sorted && sorted.length > 1 && <SortControl value={sort} onChange={setSort} />}
      </div>

      <div style={{ marginTop: isMobile ? 20 : 28 }}>
        {!visible ? (
          <p style={meta(10.5)}>Loading</p>
        ) : visible.length === 0 ? (
          onSaved ? emptySaved : empty
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(262px, 1fr))", gap: isMobile ? 14 : 18 }}>
            {visible.map((d) => <DecisionTile key={d.id} d={d} viewerId={viewerId} isMobile={isMobile} onOpen={onOpen} />)}
          </div>
        )}
        {sorted && sorted.length > PAGE && !showAll && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
            <button onClick={() => setShowAll(true)} style={{ ...squareBtn(false), padding: "13px 26px" }}>Show all {sorted.length}</button>
          </div>
        )}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// /profile: her own
// ════════════════════════════════════════════════════════════════════════════

const BIO_MAX = 200;

// ─── Canvas crop ──────────────────────────────────────────────────────────────
// The portrait is shown up to ~340px wide, so keep up to 800px of the crop for
// sharp retina screens. Never upscale a small source.
async function getCroppedBlob(
  imageSrc: string,
  croppedAreaPixels: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const size = Math.max(400, Math.min(800, Math.round(croppedAreaPixels.width)));
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, croppedAreaPixels.x, croppedAreaPixels.y,
        croppedAreaPixels.width, croppedAreaPixels.height, 0, 0, size, size);
      canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9);
    };
  });
}

function ImageOption({ image, label, selected, dim, onClick }: {
  image: string;
  label: string;
  selected: boolean;
  dim?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", opacity: dim ? 0.3 : 1, transition: "opacity .15s", minWidth: 0 }}
    >
      <span style={{
        display: "block", aspectRatio: "2 / 3", background: C.well, borderRadius: RADIUS, overflow: "hidden",
        outline: selected ? `2px solid ${C.burgundy}` : "none", outlineOffset: 2,
      }}>
        <img src={image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
      </span>
      <span style={{ ...meta(10, selected ? C.burgundy : C.ink), fontWeight: 700, lineHeight: 1.35, display: "block", marginTop: 9 }}>{label}</span>
    </button>
  );
}

function SaveRow({ onSave, onCancel, disabled, saving }: { onSave: () => void; onCancel: () => void; disabled: boolean; saving: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
      <button onClick={onSave} disabled={disabled} style={{ ...squareBtn(true, C.burgundy), padding: "13px 24px", opacity: disabled ? 0.45 : 1, cursor: disabled ? "default" : "pointer" }}>
        {saving ? "Saving..." : "Save"}
      </button>
      <button onClick={onCancel} style={{ ...squareBtn(false), padding: "13px 24px" }}>Cancel</button>
    </div>
  );
}

// ─── Ask me about ─────────────────────────────────────────────────────────────
const ASK_MAX = 5;
const ASK_LEN = 32;

/** Seeds the autocomplete before other women's answers and posted brands fill it in. */
const ASK_TOPICS = [
  "Tall-girl denim", "Petite fits", "Curvy fits", "Plus-size fits", "Designer bags", "Luxury bags", "Vintage",
  "Resale", "Workwear", "Wedding guest", "Swimwear", "Activewear", "Bra sizing", "Wide feet", "Sneakers", "Heels",
  "Denim", "Tailoring", "Knitwear", "Outerwear", "Capsule wardrobe", "Quality vs. price", "Sizing across brands",
  "Skincare", "Makeup", "Haircare", "Fragrance", "Jewelry", "Maternity",
];

/**
 * Up to five things she knows well. Suggestions where they exist, her own words
 * where they don't. What she picks reads as underlined words with an x, the way
 * the size picker marks a choice: no pills.
 */
function AskAboutEditor({ value, onChange, pool }: { value: string[]; onChange: (v: string[]) => void; pool: string[] }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(-1);
  const full = value.length >= ASK_MAX;
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const needle = q.trim().toLowerCase();
  const matches = needle ? pool.filter((p) => p.toLowerCase().includes(needle) && !has(p)).slice(0, 6) : [];

  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, ASK_LEN);
    setQ(""); setHi(-1);
    if (!t || full || has(t)) return;
    onChange([...value, t]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(hi >= 0 && matches[hi] ? matches[hi] : q); }
    else if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); setHi((h) => Math.min(matches.length - 1, h + 1)); }
    else if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)); }
    else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
    else if (e.key === "Escape") { setQ(""); setHi(-1); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <label htmlFor="profile-ask" style={strong(14)}>What should people ask you about?</label>
        <span style={meta(10.5, full ? C.burgundy : C.muted)}>{value.length}/{ASK_MAX}</span>
      </div>
      <p style={{ ...body(13, C.muted), marginTop: 4 }}>Brands, luxury bags, fit problems, or anything you know really well.</p>

      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 20, rowGap: 12, marginTop: 14 }}>
          {value.map((v) => (
            <span key={v} style={{ ...meta(11, C.ink), fontWeight: 700, letterSpacing: "0.08em", display: "inline-flex", alignItems: "center", gap: 8, paddingBottom: 4, borderBottom: `1px solid ${C.burgundy}` }}>
              {v}
              <button onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.muted, lineHeight: 0 }}>
                <X style={{ width: 12, height: 12 }} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!full && (
        <div style={{ position: "relative", marginTop: 12 }}>
          <input
            id="profile-ask"
            value={q}
            maxLength={ASK_LEN}
            onChange={(e) => { setQ(e.target.value); setHi(-1); }}
            onKeyDown={onKey}
            placeholder={value.length ? "Add another" : "e.g. Tall-girl denim"}
            autoComplete="off"
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="profile-ask-list"
            style={{ ...fieldStyle, paddingRight: q.trim() ? 64 : 13 }}
          />
          {q.trim() && (
            <button onClick={() => add(q)} style={{ ...textLink(C.burgundy), position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)" }}>Add</button>
          )}
          {matches.length > 0 && (
            <div id="profile-ask-list" role="listbox" style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: RADIUS, overflow: "hidden", zIndex: 10 }}>
              {matches.map((m, i) => (
                <button key={m} role="option" aria-selected={i === hi} onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)}
                  style={{ ...body(14, C.ink), width: "100%", textAlign: "left", padding: "10px 13px", background: i === hi ? C.well : "none", border: "none", borderTop: i ? `1px solid ${C.rule}` : "none", cursor: "pointer" }}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type Mirror = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  city: string | null;
  age?: number | null;
  height_range?: string | null;
  silhouette_preference: string[] | null;
  style_aesthetics?: string[] | null;
  score: number;
};

export function MirrorCard({ m, isMobile, onOpen }: { m: Mirror; isMobile: boolean; onOpen: () => void }) {
  const name = m.display_name?.trim() || "Anonymous";
  const sil = Array.isArray(m.silhouette_preference) ? m.silhouette_preference[0] : null;
  const line = [m.age, m.city?.split(",")[0]].filter(Boolean).join(" · ");
  const fit = [sil, m.height_range].filter(Boolean).join(" / ");
  return (
    <button
      onClick={onOpen}
      className="e11-tile"
      style={{
        background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", minWidth: 0, display: "block",
        ...(isMobile ? { flex: "0 0 62%", scrollSnapAlign: "start" } : {}),
      }}
    >
      <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "4 / 5", background: C.well, borderRadius: RADIUS, overflow: "hidden" }}>
        {m.avatar_url
          ? <img src={m.avatar_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <span style={display(64, C.faint)}>{getInitials(name)}</span>}
        <span style={{ position: "absolute", top: 10, left: 10, lineHeight: 0 }}>
          <MatchSeal score={m.score} size={isMobile ? 44 : 52} />
        </span>
      </span>
      <span style={{ ...strong(13), textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginTop: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      {line && <span style={{ ...body(12.5, C.muted), display: "block", marginTop: 3 }}>{line}</span>}
      {fit && <span style={{ ...meta(10, C.inkSoft), display: "block", marginTop: 8, lineHeight: 1.5 }}>{fit}</span>}
      <span style={{ ...textLink(C.ink), marginTop: 12 }}>See profile {arrow}</span>
    </button>
  );
}

/**
 * First run. She lands on her own profile from the last onboarding step, and
 * this is the whole nudge: a headline, a line of copy, and a close box. No CTA,
 * because she is already standing on the page one would send her to. Her city
 * comes from onboarding, so photos are the only thing it asks for.
 */
export function WelcomeNudge({ isMobile, onDismiss }: {
  isMobile: boolean; onDismiss: () => void;
}) {
  return (
    <div role="status" style={{
      // Above the page and the fixed header (40), below every sheet (60) and the
      // crop and lightbox overlays (70), so it never covers a modal she opened.
      position: "fixed", zIndex: 55,
      bottom: isMobile ? 12 : 24, right: isMobile ? 12 : 24, left: isMobile ? 12 : "auto",
      width: isMobile ? "auto" : 372,
      background: "#FFFFFF", border: `1px solid ${C.ink}`, borderRadius: RADIUS,
      boxShadow: "0 18px 44px rgba(20,18,16,0.20)",
      padding: isMobile ? "34px 22px 26px" : "36px 26px 28px",
      textAlign: "center",
    }}>
      <button onClick={onDismiss} aria-label="Close" style={{
        position: "absolute", top: 9, right: 9, background: "none", border: "none",
        padding: 6, cursor: "pointer", color: C.ink, lineHeight: 0,
      }}>
        <X style={{ width: 18, height: 18 }} strokeWidth={2} />
      </button>

      <h2 style={{ ...display(isMobile ? 32 : 34), textWrap: "balance" } as React.CSSProperties}>
        Your mirrors want to see you.
      </h2>
      {/* Broken by hand after the first sentence: text-wrap: balance is not on
          older iOS, and a lone trailing word looks wrong centred. */}
      <p style={{ ...body(isMobile ? 14 : 14.5, C.inkSoft), marginTop: 13 }}>
        Put a face to the name.<br />Add photos and finish your profile.
      </p>
    </div>
  );
}

const Profile = () => {
  const navigate = useNavigate();
  const { isMobile, isWide } = useViewport();
  const { user, signOut } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data
  const [profile, setProfile]             = useState<any>(null);
  const [loading, setLoading]             = useState(true);
  const [stats, setStats]                 = useState({ takes: 0, helpfulVotes: 0 });
  const [decisions, setDecisions]         = useState<ProfileTile[] | null>(null);
  const [savedDecisions, setSavedDecisions] = useState<ProfileTile[] | null>(null);
  const [decTab, setDecTab]               = useState<"decisions" | "saved">("decisions");
  const [menuOpen, setMenuOpen]           = useState(false);

  // Edit modes
  const [editMode, setEditMode]           = useState<null | "silhouette" | "style" | "sizes">(null);
  const [showFitModal, setShowFitModal]   = useState(false);
  const [editHeight, setEditHeight]       = useState<string | null>(null);
  const [editTop, setEditTop]             = useState<string | null>(null);
  const [editBottom, setEditBottom]       = useState<string | null>(null);
  const [editSilhouette, setEditSilhouette] = useState<string | null>(null);
  const [editStyle, setEditStyle]         = useState<string[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);

  // Inline name / info / bio editing
  const [editing, setEditing]             = useState(false);
  const [editName, setEditName]           = useState("");
  const [editAge, setEditAge]             = useState("");
  const [editCity, setEditCity]           = useState("");
  const [editBio, setEditBio]             = useState("");
  const [editAsk, setEditAsk]             = useState<string[]>([]);
  const [askPool, setAskPool]             = useState<string[]>(ASK_TOPICS);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const cityTyped                         = useRef(false);
  const [saving, setSaving]               = useState(false);

  // Tags expand
  const [showAllTags, setShowAllTags]     = useState(false);

  // Fit photos
  const [fitPhotos, setFitPhotos]             = useState<string[]>([]);
  const [fitPhotoModal, setFitPhotoModal]     = useState<"upload" | "manage" | null>(null);
  const [pendingFiles, setPendingFiles]       = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [uploadingFitPhotos, setUploadingFitPhotos] = useState(false);
  const [fitPhotoConfirm, setFitPhotoConfirm] = useState(false);
  const [draggingOver, setDraggingOver]       = useState(false);
  const fitPhotoInputRef                      = useRef<HTMLInputElement>(null);

  // Lightbox
  const [lightboxIdx, setLightboxIdx]     = useState<number | null>(null);

  // Crop
  const [cropSrc, setCropSrc]             = useState<string | null>(null);
  const [crop, setCrop]                   = useState({ x: 0, y: 0 });
  const [zoom, setZoom]                   = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Mirrors
  const [mirrors, setMirrors] = useState<Mirror[] | null>(null);

  // Which tab is open: ?tab=decisions etc. opens on that one.
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    return t && ["fit", "style", "mirrors", "decisions"].includes(t) ? t : "fit";
  });

  // ─── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { navigate("/signin?mode=signup"); return; }
    fetchProfile();
    fetchStats();
    fetchDecisions();
    fetchSavedDecisions();
  }, [user]);

  // City autocomplete. Only for what she types: not for the saved city, and not
  // again right after she picks a suggestion.
  useEffect(() => {
    if (!cityTyped.current || editCity.length < 2) { setCitySuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(editCity)}&limit=6&layer=city&layer=state`
        );
        const data = await res.json();
        const seen = new Set<string>();
        const results: string[] = [];
        for (const f of data.features ?? []) {
          const p = f.properties;
          const label = [p.name, p.state, p.country].filter(Boolean).join(", ");
          if (!seen.has(label)) { seen.add(label); results.push(label); }
          if (results.length >= 5) break;
        }
        setCitySuggestions(results);
      } catch { setCitySuggestions([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [editCity]);

  // Ask me about suggestions: what other women offer and the brands posted here,
  // on top of the seed topics. Fetched once, the first time she opens the editor.
  const askPoolLoaded = useRef(false);
  useEffect(() => {
    if (!editing || askPoolLoaded.current) return;
    askPoolLoaded.current = true;
    (async () => {
      const [askRes, brandRes] = await Promise.all([
        supabase.from("profiles").select("ask_me_about").not("ask_me_about", "is", null).limit(500),
        supabase.from("decisions").select("brand_name").not("brand_name", "is", null).is("deleted_at", null).limit(1000),
      ]);
      const seen = new Set<string>();
      const out: string[] = [];
      const push = (v: unknown) => {
        if (typeof v !== "string") return;
        const t = v.trim();
        if (!t || t.length > ASK_LEN || seen.has(t.toLowerCase())) return;
        seen.add(t.toLowerCase()); out.push(t);
      };
      ASK_TOPICS.forEach(push);
      ((askRes.data ?? []) as any[]).forEach((r) => (r.ask_me_about ?? []).forEach(push));
      ((brandRes.data ?? []) as any[]).forEach((r) => push(r.brand_name));
      setAskPool(out);
    })();
  }, [editing]);

  useEffect(() => {
    if (!profile || !user) return;
    const fetchMirrors = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, age, city, silhouette_preference, height_range, top_size, bottom_size, fit_preference, fit_details, style_aesthetics, purchase_frequency, risk_tolerance")
        .neq("id", user.id)
        .limit(120);
      if (!data) { setMirrors([]); return; }
      const scored = data
        .filter((p: any) => p != null)
        .map((p: any) => ({ ...p, score: Math.round(computeMatchScore(profile, p).total) }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 3);
      setMirrors(scored);
    };
    fetchMirrors();
  }, [profile, user]);

  // First run. She lands here straight from onboarding (?welcome=1). If she
  // skips, it comes back once on a later visit, then never again.
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeSettled = useRef(false);

  useEffect(() => {
    if (!user || !profile || welcomeSettled.current) return;
    const invited  = searchParams.get("welcome") === "1";
    // Onboarding already collects her city, so the nudge only ever asks for photos.
    const complete = Boolean(profile.avatar_url) && fitPhotosFor(profile).length > 0;
    if (complete && !invited) return;

    const key = `ee_welcome_shown_${user.id}`;
    let seen = 0;
    try { seen = Number(localStorage.getItem(key) ?? 0) || 0; } catch { seen = 0; }
    if (!invited && seen >= 2) return;

    welcomeSettled.current = true;
    setShowWelcome(true);
    try { localStorage.setItem(key, String(seen + 1)); } catch { /* private mode */ }
    // Drop ?welcome=1 so a refresh does not show it again and burn the second
    // showing. The ref above stops this re-entering the effect.
    if (invited) setSearchParams({}, { replace: true });
  }, [user, profile, searchParams, setSearchParams]);

  // ─── Data fetching ───────────────────────────────────────────────────────────
  const fetchProfile = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
    if (data) {
      setProfile(data);
      setEditName(data.display_name ?? "");
      setEditAge(data.age?.toString() ?? "");
      cityTyped.current = false;
      setEditCity(data.city ?? "");
      setEditBio(data.bio ?? "");
      setEditAsk(Array.isArray(data.ask_me_about) ? data.ask_me_about : []);
      setFitPhotos(fitPhotosFor(data));
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    const s = await helpfulStats(user!.id);
    setStats({ takes: s.responses, helpfulVotes: s.helpfulVotes });
  };

  const fetchDecisions = async () => {
    const { data } = await supabase
      .from("decisions")
      .select(TILE_FIELDS)
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setDecisions(await withTileExtras(data ?? []));
  };

  const fetchSavedDecisions = async () => {
    const { data: marks } = await supabase
      .from("saved_decisions")
      .select("decision_id, created_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    const savedAt: Record<string, string> = {};
    (marks ?? []).forEach((m: any) => { if (!savedAt[m.decision_id]) savedAt[m.decision_id] = m.created_at; });
    const ids = Object.keys(savedAt);
    if (!ids.length) { setSavedDecisions([]); return; }
    const { data } = await supabase
      .from("decisions")
      .select(TILE_FIELDS)
      .in("id", ids)
      .is("deleted_at", null);
    // "Most recent" on the Saved tab means most recently saved.
    setSavedDecisions(await withTileExtras((data ?? []).map((d: any) => ({ ...d, sortAt: savedAt[d.id] ?? d.created_at }))));
  };

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const openDecision = (id: string) => navigate("/feed", { state: { openDecisionId: id } });

  const saveBasicInfo = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: editName.trim(),
      age: editAge ? parseInt(editAge) : null,
      city: editCity || null,
      bio: editBio.trim().slice(0, BIO_MAX) || null,
      ask_me_about: editAsk.length ? editAsk.slice(0, ASK_MAX) : null,
    }).eq("id", user!.id);
    setSaving(false);
    if (error) { alert("Could not save: " + error.message); return; }
    setEditing(false); setCitySuggestions([]); fetchProfile();
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditName(profile?.display_name ?? "");
    setEditAge(profile?.age?.toString() ?? "");
    cityTyped.current = false;
    setEditCity(profile?.city ?? "");
    setEditBio(profile?.bio ?? "");
    setEditAsk(Array.isArray(profile?.ask_me_about) ? profile.ask_me_about : []);
    setCitySuggestions([]);
  };

  const pickPhoto = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setCrop({ x: 0, y: 0 }); setZoom(1); setCropSrc(reader.result as string); };
    reader.readAsDataURL(file); e.target.value = "";
  };

  const onCropComplete = useCallback((_: any, px: any) => setCroppedAreaPixels(px), []);

  const applyCrop = async () => {
    if (!cropSrc || !croppedAreaPixels || !user) return;
    setUploadingPhoto(true);
    try {
      const blob = await getCroppedBlob(cropSrc, croppedAreaPixels);
      const path = `avatars/${user.id}.jpg`;
      const { error: upErr } = await supabase.storage.from("product-images").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) { alert("Upload failed: " + upErr.message); return; }
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: upd } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user!.id);
      if (upd) { alert("Could not save: " + upd.message); return; }
      setProfile((p: any) => ({ ...p, avatar_url: url })); setCropSrc(null);
    } catch { alert("Something went wrong."); }
    finally { setUploadingPhoto(false); }
  };

  const openSizesEdit = () => {
    setEditHeight(profile?.height_range ?? null);
    setEditTop(profile?.top_size ?? null);
    setEditBottom(profile?.bottom_size ?? null);
    setEditMode("sizes");
  };
  const saveSizes = async () => {
    setSavingProfile(true);
    await supabase.from("profiles").update({
      height_range: editHeight,
      top_size: editTop,
      bottom_size: editBottom,
    }).eq("id", user!.id);
    setSavingProfile(false);
    setEditMode(null);
    fetchProfile();
  };

  const openSilhouetteEdit = () => { setEditSilhouette(silhouetteFor(profile)?.label ?? profile?.silhouette_preference?.[0] ?? null); setEditMode("silhouette"); };
  const saveSilhouette = async () => {
    if (!editSilhouette) return; setSavingProfile(true);
    await supabase.from("profiles").update({ silhouette_preference: [editSilhouette] }).eq("id", user!.id);
    setProfile((p: any) => ({ ...p, silhouette_preference: [editSilhouette] }));
    setSavingProfile(false); setEditMode(null);
  };

  // ─── Fit photo handlers ──────────────────────────────────────────────────────
  const openUpload = () => { setPendingFiles([]); setPendingPreviews([]); setFitPhotoModal("upload"); };
  const closeUpload = () => { setFitPhotoModal(null); setPendingFiles([]); setPendingPreviews([]); };

  const addPendingFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 3 - fitPhotos.length);
    const newFiles = [...pendingFiles, ...arr].slice(0, 3 - fitPhotos.length);
    setPendingFiles(newFiles);
    newFiles.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setPendingPreviews(prev => {
        const updated = [...prev];
        updated[newFiles.indexOf(f)] = reader.result as string;
        return updated;
      });
      reader.readAsDataURL(f);
    });
  };

  const saveFitPhotos = async () => {
    if (!pendingFiles.length || !user) return;
    setUploadingFitPhotos(true);
    const newUrls: string[] = [];
    for (const file of pendingFiles) {
      // Re-encode to JPEG so iPhone HEIC photos render in browsers; fall back to raw on failure
      let blob: Blob = file;
      try { blob = await imageToJpeg(file); } catch (e) { console.warn("fit photo convert failed, uploading raw:", e); }
      const path = `fit-photos/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { data: upData } = await supabase.storage.from("product-images").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upData) {
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(upData.path);
        newUrls.push(urlData.publicUrl);
      }
    }
    const combined = [...fitPhotos, ...newUrls].slice(0, 3);
    // Merge into fit_details: never overwrite her fit answers.
    const updatedFitDetails = { ...(profile?.fit_details ?? {}), _fit_photos: combined };
    await supabase.from("profiles").update({ fit_details: updatedFitDetails }).eq("id", user.id);
    setProfile((p: any) => ({ ...p, fit_details: updatedFitDetails }));
    setFitPhotos(combined);
    setPendingFiles([]); setPendingPreviews([]);
    setFitPhotoModal(null);
    setUploadingFitPhotos(false);
    setFitPhotoConfirm(true);
    setTimeout(() => setFitPhotoConfirm(false), 3000);
  };

  const removeFitPhoto = async (url: string) => {
    const updated = fitPhotos.filter(u => u !== url);
    const updatedFitDetails = { ...(profile?.fit_details ?? {}), _fit_photos: updated };
    await supabase.from("profiles").update({ fit_details: updatedFitDetails }).eq("id", user!.id);
    setProfile((p: any) => ({ ...p, fit_details: updatedFitDetails }));
    setFitPhotos(updated);
  };

  const openStyleEdit = () => { setEditStyle(profile?.style_aesthetics ?? []); setEditMode("style"); };
  const toggleStyle   = (l: string) => setEditStyle(p => p.includes(l) ? p.filter(s => s !== l) : p.length < 3 ? [...p, l] : p);
  const saveStyle     = async () => {
    if (!editStyle.length) return; setSavingProfile(true);
    await supabase.from("profiles").update({ style_aesthetics: editStyle }).eq("id", user!.id);
    setProfile((p: any) => ({ ...p, style_aesthetics: editStyle }));
    setSavingProfile(false); setEditMode(null);
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const displayName = profile?.display_name?.trim() || user?.email?.split("@")[0] || "You";
  const firstName   = nameParts(displayName)[0] ?? "You";
  const sil         = silhouetteFor(profile);
  const tier        = tierFor(stats.helpfulVotes)?.label ?? profile?.badge_tier ?? null;
  const styles: string[] = profile?.style_aesthetics ?? [];
  const pickerCols  = isMobile ? 3 : 5;
  const remaining   = 3 - fitPhotos.length;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={meta(11)}>Loading...</p>
    </div>
  );

  // ─── Pieces ──────────────────────────────────────────────────────────────────
  const sheetBackdrop: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 60, background: C.scrim,
    display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 24,
  };
  const sheet: React.CSSProperties = {
    background: C.paper, borderRadius: RADIUS, padding: isMobile ? "24px 20px 32px" : "30px 32px 32px",
    width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box",
  };
  const closeBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: C.ink, lineHeight: 0, padding: 4 };

  // Changing the photo lives in Edit profile. An empty portrait still opens the picker.
  const portrait = <Portrait url={profile?.avatar_url ?? null} name={displayName} onPick={profile?.avatar_url ? undefined : pickPhoto} />;

  const editForm = (
    <div style={{ maxWidth: 460 }}>
      <p style={{ ...meta(11, C.ink), fontWeight: 700, marginBottom: 16 }}>Edit profile</p>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
        <div style={{ width: 72, flexShrink: 0 }}>
          <Portrait url={profile?.avatar_url ?? null} name={displayName} onPick={pickPhoto} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <button onClick={pickPhoto} style={textLink(C.ink)}>
            <Camera style={{ width: 14, height: 14 }} strokeWidth={1.75} />
            {profile?.avatar_url ? "Change photo" : "Add photo"}
          </button>
          <button onClick={fitPhotos.length ? () => setFitPhotoModal("manage") : openUpload} style={textLink(C.ink)}>
            <Plus style={{ width: 14, height: 14 }} strokeWidth={1.75} />
            {fitPhotos.length ? "Manage IRL photos" : "Add IRL photos"}
          </button>
        </div>
      </div>
      <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name"
        style={{ ...fieldStyle, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input value={editAge} onChange={e => setEditAge(e.target.value.replace(/\D/g, ""))} placeholder="Age" maxLength={3} inputMode="numeric"
          style={{ ...fieldStyle, width: "28%", flexShrink: 0 }} />
        <div style={{ flex: 1, position: "relative" }}>
          <input value={editCity} onChange={e => { cityTyped.current = true; setEditCity(e.target.value); }} placeholder="City" style={fieldStyle} />
          {citySuggestions.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: RADIUS, overflow: "hidden", zIndex: 10 }}>
              {citySuggestions.map((c, i) => (
                <button key={c} onClick={() => { cityTyped.current = false; setEditCity(c.split(",")[0]); setCitySuggestions([]); }}
                  style={{ ...body(14, C.ink), width: "100%", textAlign: "left", padding: "10px 13px", background: "none", border: "none", borderTop: i ? `1px solid ${C.rule}` : "none", cursor: "pointer" }}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <label htmlFor="profile-bio" style={meta(10.5)}>Bio</label>
        <span style={meta(10.5, editBio.length >= BIO_MAX ? C.burgundy : C.muted)}>{editBio.length}/{BIO_MAX}</span>
      </div>
      <textarea id="profile-bio" value={editBio} onChange={e => setEditBio(e.target.value.slice(0, BIO_MAX))} maxLength={BIO_MAX} rows={3}
        placeholder="Add a short bio" style={fieldStyle} />
      <div style={{ marginTop: 22 }}>
        <AskAboutEditor value={editAsk} onChange={setEditAsk} pool={askPool} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
        <button onClick={saveBasicInfo} disabled={saving || !editName.trim()}
          style={{ ...squareBtn(true, C.burgundy), opacity: saving || !editName.trim() ? 0.5 : 1 }}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={cancelEdit} style={squareBtn(false)}>Cancel</button>
      </div>
    </div>
  );

  const menuItems: { label: string; on: () => void; tone?: string }[] = [
    { label: fitPhotos.length ? "Manage IRL photos" : "Add IRL photos", on: fitPhotos.length ? () => setFitPhotoModal("manage") : openUpload },
    { label: "Dial in your fit", on: () => setShowFitModal(true) },
    { label: "Sign out", on: handleSignOut, tone: C.burgundy },
  ];

  // Top right corner, beside her name: small enough to never crowd it.
  const actionBtn: React.CSSProperties = { ...squareBtn(true, C.burgundy), fontSize: 11, padding: isMobile ? "10px 16px" : "12px 20px" };
  const actionIcon: React.CSSProperties = { ...iconSquare, width: isMobile ? 38 : 42 };
  const actions = (
    <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
      <button onClick={() => setEditing(true)} style={actionBtn}>Edit</button>
      <div style={{ position: "relative", display: "flex" }}>
        <button onClick={() => setMenuOpen(v => !v)} aria-label="More" aria-haspopup="menu" aria-expanded={menuOpen} style={actionIcon}>
          <MoreHorizontal style={{ width: 18, height: 18 }} strokeWidth={1.75} />
        </button>
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
            <div role="menu" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 31, minWidth: 210, background: C.paper, border: `1px solid ${C.ink}`, borderRadius: RADIUS }}>
              {menuItems.map((it, i) => (
                <button key={it.label} role="menuitem" onClick={() => { setMenuOpen(false); it.on(); }}
                  style={{ ...textLink(it.tone ?? C.ink), width: "100%", padding: "13px 16px", justifyContent: "flex-start", borderTop: i ? `1px solid ${C.rule}` : "none" }}>
                  {it.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  const irl = (
    <IrlPhotos
      label="You, IRL"
      photos={fitPhotos}
      onOpen={setLightboxIdx}
      owner={{ onAdd: openUpload, confirm: fitPhotoConfirm }}
    />
  );

  const silhouettePicker = (
    <div>
      <p style={meta(10.5)}>Select your silhouette</p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${pickerCols}, minmax(0, 1fr))`, gap: isMobile ? 12 : 16, marginTop: 16 }}>
        {SILHOUETTE_OPTIONS.map(opt => (
          <ImageOption key={opt.label} image={opt.image} label={opt.label} selected={editSilhouette === opt.label} onClick={() => setEditSilhouette(opt.label)} />
        ))}
      </div>
      <SaveRow onSave={saveSilhouette} onCancel={() => setEditMode(null)} disabled={!editSilhouette || savingProfile} saving={savingProfile} />
    </div>
  );

  const sizesEditor = (
    <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 18 }}>
      {[
        { label: "Height", val: editHeight, set: setEditHeight, opts: HEIGHT_OPTIONS.map((h) => h.label) },
        { label: "Top size", val: editTop, set: setEditTop, opts: SIZE_OPTIONS },
        { label: "Bottom size", val: editBottom, set: setEditBottom, opts: SIZE_OPTIONS },
      ].map((row) => (
        <div key={row.label} style={{ marginBottom: 18 }}>
          <p style={meta(10.5)}>{row.label}</p>
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: 18, rowGap: 10, marginTop: 10 }}>
            {row.opts.map((opt) => {
              const on = row.val === opt;
              return (
                <button key={opt} onClick={() => row.set(on ? null : opt)} aria-pressed={on}
                  style={{
                    ...meta(11, on ? C.ink : C.muted), fontWeight: on ? 700 : 600, letterSpacing: "0.08em",
                    background: "none", border: "none", padding: "0 0 4px", cursor: "pointer",
                    borderBottom: `1px solid ${on ? C.burgundy : "transparent"}`,
                  }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <SaveRow onSave={saveSizes} onCancel={() => setEditMode(null)} disabled={savingProfile} saving={savingProfile} />
    </div>
  );

  const stylePicker = (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <p style={meta(10.5)}>Select up to 3 aesthetics</p>
        <p style={meta(10.5, C.ink)}>{editStyle.length} of 3</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${pickerCols}, minmax(0, 1fr))`, gap: isMobile ? 12 : 16, marginTop: 16 }}>
        {STYLE_OPTIONS.map(opt => {
          const sel = editStyle.includes(opt.label);
          return (
            <ImageOption key={opt.label} image={opt.image} label={opt.label} selected={sel} dim={!sel && editStyle.length >= 3} onClick={() => toggleStyle(opt.label)} />
          );
        })}
      </div>
      <SaveRow onSave={saveStyle} onCancel={() => setEditMode(null)} disabled={!editStyle.length || savingProfile} saving={savingProfile} />
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 overflow-hidden flex justify-center" style={{ background: C.paper, color: C.ink }}>

      <AnimatePresence>
        {/* ── Crop ─────────────────────────────────────────────────────────── */}
        {cropSrc && (
          <motion.div key="crop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(20,18,16,0.96)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px" }}>
              <button onClick={() => setCropSrc(null)} style={textLink("rgba(255,255,255,0.6)")}>Cancel</button>
              <p style={meta(11, "#FFFFFF")}>Position your photo</p>
              <button onClick={applyCrop} disabled={uploadingPhoto} style={textLink(uploadingPhoto ? "rgba(255,255,255,0.3)" : "#FFFFFF")}>
                {uploadingPhoto ? "Saving..." : "Apply"}
              </button>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <Cropper image={cropSrc} crop={crop} zoom={zoom} aspect={1} cropShape="rect" showGrid={false}
                onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
            </div>
            <div style={{ padding: "20px 32px 32px" }}>
              <p style={{ ...meta(10, "rgba(255,255,255,0.45)"), textAlign: "center", marginBottom: 12 }}>Pinch or scroll to zoom</p>
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ width: "100%", accentColor: "#FFFFFF" }} />
            </div>
          </motion.div>
        )}

        {/* ── Add fit photos ───────────────────────────────────────────────── */}
        {fitPhotoModal === "upload" && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={sheetBackdrop}
            onClick={e => { if (e.target === e.currentTarget) closeUpload(); }}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ type: "spring", damping: 28, stiffness: 280 }} style={sheet}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <p style={display(isMobile ? 28 : 34)}>Add photos</p>
                <button aria-label="Close" onClick={closeUpload} style={closeBtn}><X style={{ width: 20, height: 20 }} strokeWidth={1.5} /></button>
              </div>
              <p style={{ ...body(14), marginTop: 12 }}>
                Upload up to {remaining} photo{remaining !== 1 ? "s" : ""} that show how clothes fit on your body.
              </p>
              <p style={{ ...body(13.5, C.muted), marginTop: 4 }}>These help others make better decisions.</p>

              <div
                onDragOver={e => { e.preventDefault(); setDraggingOver(true); }}
                onDragLeave={() => setDraggingOver(false)}
                onDrop={e => { e.preventDefault(); setDraggingOver(false); addPendingFiles(e.dataTransfer.files); }}
                onClick={() => fitPhotoInputRef.current?.click()}
                style={{
                  marginTop: 20, border: `1px dashed ${draggingOver ? C.burgundy : "rgba(20,18,16,0.3)"}`, borderRadius: RADIUS,
                  padding: "30px 20px", textAlign: "center", cursor: "pointer", transition: "border-color .15s",
                }}>
                <input ref={fitPhotoInputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                  onChange={e => e.target.files && addPendingFiles(e.target.files)} />
                <p style={{ ...meta(11, C.ink), fontWeight: 700 }}>Drag & drop or click to upload</p>
                <p style={{ ...meta(10), marginTop: 8 }}>Max {remaining} image{remaining !== 1 ? "s" : ""}</p>
              </div>

              {pendingPreviews.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  {pendingPreviews.map((src, i) => src && (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={src} alt="" style={{ width: 76, height: 100, objectFit: "cover", borderRadius: RADIUS, display: "block" }} />
                      <button aria-label="Remove" onClick={() => { setPendingFiles(f => f.filter((_, fi) => fi !== i)); setPendingPreviews(p => p.filter((_, pi) => pi !== i)); }}
                        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: RADIUS, background: C.ink, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                        <X style={{ width: 11, height: 11, color: "#FFFFFF" }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 22 }}>
                <button onClick={saveFitPhotos} disabled={pendingFiles.length === 0 || uploadingFitPhotos}
                  style={{ ...squareBtn(true, C.burgundy), width: "100%", opacity: pendingFiles.length === 0 ? 0.4 : 1 }}>
                  {uploadingFitPhotos ? "Saving..." : "Save photos"}
                </button>
                <button onClick={closeUpload} style={{ ...squareBtn(false), width: "100%" }}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── Lightbox ─────────────────────────────────────────────────────── */}
        {lightboxIdx !== null && fitPhotos[lightboxIdx] && (
          <Lightbox key="lightbox" photos={fitPhotos} index={lightboxIdx} onIndex={setLightboxIdx} onClose={() => setLightboxIdx(null)} />
        )}

        {/* ── Manage fit photos ────────────────────────────────────────────── */}
        {fitPhotoModal === "manage" && (
          <motion.div key="manage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={sheetBackdrop}
            onClick={e => { if (e.target === e.currentTarget) setFitPhotoModal(null); }}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ type: "spring", damping: 28, stiffness: 280 }} style={sheet}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
                <p style={display(isMobile ? 28 : 34)}>Your photos</p>
                <button aria-label="Close" onClick={() => setFitPhotoModal(null)} style={closeBtn}><X style={{ width: 20, height: 20 }} strokeWidth={1.5} /></button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 24 }}>
                {fitPhotos.map((url) => (
                  <div key={url} style={{ position: "relative" }}>
                    <img src={url} alt="" style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", objectPosition: "top", borderRadius: RADIUS, display: "block", background: C.well }} />
                    <button aria-label="Remove photo" onClick={() => removeFitPhoto(url)}
                      style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: RADIUS, background: "rgba(20,18,16,0.72)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <X style={{ width: 12, height: 12, color: "#FFFFFF" }} />
                    </button>
                  </div>
                ))}
                {fitPhotos.length < 3 && (
                  <button onClick={openUpload}
                    style={{ aspectRatio: "3 / 4", borderRadius: RADIUS, border: `1px solid ${C.rule}`, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: C.muted, padding: 0 }}>
                    <Plus style={{ width: 18, height: 18 }} strokeWidth={1.5} />
                    <span style={meta(10, C.muted)}>Add photo</span>
                  </button>
                )}
              </div>

              <button onClick={() => setFitPhotoModal(null)} style={{ ...squareBtn(true, C.burgundy), width: "100%" }}>Done</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileSelect} />

      {/* The page scrolls inside this, the way the feed does. iOS leaves blank
          tiles behind when a document with a fixed header scrolls itself, which
          is the cream slab that covered the profile. */}
      <div className="w-full max-w-[1320px] no-scrollbar" style={{ overflowY: "scroll", overscrollBehavior: "contain" }}>
      <ProfileHeader
        isMobile={isMobile}
        right={
          <button onClick={handleSignOut} style={{ ...textLink(C.ink), fontSize: isMobile ? 10.5 : 12, whiteSpace: "nowrap" }}>
            <LogOut style={{ width: 13, height: 13 }} strokeWidth={1.75} />
            Sign out
          </button>
        }
      />

      <main style={wrap(isMobile)}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ marginTop: isMobile ? 18 : 44 }}>
          {editing ? editForm : (
            <ProfileTop
              isMobile={isMobile}
              isWide={isWide}
              name={displayName}
              facts={[profile?.age, profile?.city?.split(",")[0]].filter(Boolean)}
              since={profile?.created_at}
              bio={profile?.bio}
              portrait={portrait}
              status={<TierStatus tier={tier} helpful={stats.helpfulVotes} isMobile={isMobile} />}
              actions={actions}
              irl={irl}
              askAbout={<AskMeAbout items={profile?.ask_me_about ?? []} isMobile={isMobile} onAdd={() => setEditing(true)} />}
            />
          )}
        </div>

        {/* ── First run ────────────────────────────────────────────────────── */}
        {showWelcome && (
          <WelcomeNudge isMobile={isMobile} onDismiss={() => setShowWelcome(false)} />
        )}

        {/* ── Fit profile / Style / Mirrors / Decisions ────────────────────── */}
        <div style={{ marginTop: isMobile ? 32 : 56 }}>
          <ProfileTabs isMobile={isMobile} active={tab} onChange={setTab} tabs={[
            {
              key: "fit",
              label: "Fit profile",
              content: editMode === "silhouette" ? silhouettePicker : sil ? (
                <FitSummary
                  profile={profile}
                  isMobile={isMobile}
                  owner={{
                    onChangeSilhouette: openSilhouetteEdit,
                    onEditSizes: openSizesEdit,
                    onEditFit: () => setShowFitModal(true),
                    sizesEditor: editMode === "sizes" ? sizesEditor : null,
                    showAll: showAllTags,
                    onToggleAll: () => setShowAllTags(v => !v),
                  }}
                />
              ) : (
                <EmptyNote text="Your silhouette is the strongest signal in every match." action="Set your body type" onAction={openSilhouetteEdit} />
              ),
            },
            {
              key: "style",
              label: "Style",
              content: (
                <>
                  {editMode !== "style" && (
                    <PanelNote
                      isMobile={isMobile}
                      action={styles.length > 0 ? <button onClick={openStyleEdit} style={textLink(C.burgundy)}>Edit</button> : undefined}
                    />
                  )}
                  {editMode === "style" ? stylePicker : styles.length > 0 ? (
                    <StyleRow labels={styles} isMobile={isMobile} />
                  ) : (
                    <EmptyNote text="Pick up to three aesthetics that sound like you." action="Set your aesthetic" onAction={openStyleEdit} />
                  )}
                </>
              ),
            },
            {
              key: "mirrors",
              label: "Mirrors",
              content: !mirrors ? <p style={meta(10.5)}>Loading</p> : mirrors.length > 0 ? (
                <>
                  <div data-noswipe style={isMobile
                    ? { display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", margin: "0 -16px", padding: "0 16px 4px", scrollSnapType: "x mandatory" }
                    : { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: isWide ? 24 : 16 }}>
                    {mirrors.map((m) => <MirrorCard key={m.id} m={m} isMobile={isMobile} onOpen={() => navigate(`/profile/${m.id}`)} />)}
                  </div>
                </>
              ) : (
                <EmptyNote text="Your mirrors are women with a similar fit, taste, and way of shopping. Fill in your fit profile to find them." action="Your fit profile" onAction={() => setTab("fit")} />
              ),
            },
            {
              key: "decisions",
              label: "Decisions",
              content: (
                <>
                  <StatsRow decisions={decisions?.length ?? 0} takes={stats.takes} helpful={stats.helpfulVotes} isMobile={isMobile} progress />
                  <div style={{ marginTop: isMobile ? 26 : 36 }}>
                    <DecisionsBlock
                      bare
                      heading={`${firstName}'s decisions`}
                      decisions={decisions}
                      saved={savedDecisions}
                      tab={decTab}
                      onTab={setDecTab}
                      viewerId={user?.id ?? null}
                      isMobile={isMobile}
                      onOpen={openDecision}
                      empty={<EmptyNote text="No decisions yet." action="Post a decision" onAction={() => navigate("/feed")} />}
                      emptySaved={<EmptyNote text="Nothing saved yet. Bookmark posts in the feed to revisit them later." action="Go to feed" onAction={() => navigate("/feed")} />}
                    />
                  </div>
                </>
              ),
            },
          ]} />
        </div>

        <ProfileFooter isMobile={isMobile} />
      </main>
      </div>

      <DialInFitModal open={showFitModal} onClose={() => { setShowFitModal(false); fetchProfile(); }} />
    </div>
  );
};

export default Profile;
