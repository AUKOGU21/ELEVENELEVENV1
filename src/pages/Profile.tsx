import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Bookmark, Camera, Check, ChevronDown, LogOut, MoreHorizontal, Plus, X } from "lucide-react";
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

// ── Hero ──────────────────────────────────────────────────────────────────────

/** Portrait, name block, and her in real outfits. Three columns on desktop, stacked on a phone. */
export function Hero({ isMobile, isWide, portrait, identity, irl }: {
  isMobile: boolean;
  isWide: boolean;
  portrait: React.ReactNode;
  identity: React.ReactNode;
  irl: React.ReactNode | null;
}) {
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Capped, so her name and her decisions are on the first screen. */}
        <div style={{ width: "min(62%, 220px)" }}>{portrait}</div>
        {identity}
        {irl}
      </div>
    );
  }
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isWide ? (irl ? "300px minmax(0, 1fr) minmax(0, 0.9fr)" : "300px minmax(0, 1fr)") : "240px minmax(0, 1fr)",
      columnGap: isWide ? 48 : 36,
      rowGap: 40,
      alignItems: "start",
    }}>
      <div>{portrait}</div>
      <div style={{ minWidth: 0, paddingTop: 4 }}>{identity}</div>
      {irl && <div style={isWide ? { minWidth: 0 } : { gridColumn: "1 / -1", maxWidth: 560 }}>{irl}</div>}
    </div>
  );
}

export function Portrait({ url, name, onPick }: { url: string | null; name: string; onPick?: () => void }) {
  const box: React.CSSProperties = {
    width: "100%", aspectRatio: "1 / 1", height: "auto", background: C.well, borderRadius: RADIUS, overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0, border: "none",
  };
  const inner = url
    ? <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    : <span style={display("clamp(64px, 9vw, 120px)", C.faint)}>{getInitials(name)}</span>;
  return onPick
    ? <button onClick={onPick} aria-label="Add a photo" style={{ ...box, cursor: "pointer" }}>{inner}</button>
    : <div style={box}>{inner}</div>;
}

/** Her tier in burgundy, underlined. Below the first rung, when she joined. */
export function HeroEyebrow({ tier, since }: { tier: string | null; since?: string | null }) {
  if (tier) {
    return (
      <p style={{ margin: 0 }}>
        <span style={{ ...meta(11, C.burgundy), fontWeight: 700, borderBottom: `1px solid ${C.burgundy}`, paddingBottom: 3 }}>{tier}</span>
      </p>
    );
  }
  const d = since ? new Date(since) : null;
  if (!d || isNaN(d.getTime())) return null;
  return <p style={meta(11, C.muted)}>Member since {d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p>;
}

export function BigName({ name, isMobile }: { name: string; isMobile: boolean }) {
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

/** "You, IRL": up to three photos of her in real outfits. The owner gets add slots. */
export function IrlPhotos({ label, photos, onOpen, owner }: {
  label: string;
  photos: string[];
  onOpen: (i: number) => void;
  owner?: { onAdd: () => void; onManage: () => void; confirm: boolean };
}) {
  const empties = owner ? Math.max(0, 3 - photos.length) : 0;
  return (
    <div>
      <p style={{ ...meta(11, C.ink), fontWeight: 700 }}>{label}</p>
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
      {owner && photos.length > 0 && (
        <button onClick={owner.onManage} style={{ ...textLink(C.muted), marginTop: 12 }}>Manage photos</button>
      )}
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

/** Three big numbers and where she stands on the tier ladder, split by thin rules. */
export function StatsRow({ decisions, takes, helpful, isMobile }: { decisions: number; takes: number; helpful: number; isMobile: boolean }) {
  const earned = tierFor(helpful);
  const next = nextTier(helpful);
  const threshold = next?.min ?? earned?.min ?? 5;
  const pct = next ? Math.min(100, Math.round((helpful / threshold) * 100)) : 100;
  const pad = (n: number) => String(n).padStart(2, "0");
  const rule = `1px solid ${C.rule}`;

  const numbers = [
    { value: decisions, label: "Decisions posted" },
    { value: takes, label: "Takes given" },
    { value: helpful, label: "Marked helpful" },
  ].map((s, i) => (
    <div key={s.label} style={{
      padding: isMobile ? "18px 10px" : "28px 28px",
      paddingLeft: i === 0 ? 0 : isMobile ? 12 : 28,
      borderLeft: i ? rule : "none",
      minWidth: 0,
    }}>
      <p style={display(isMobile ? 40 : "clamp(48px, 4.6vw, 68px)")}>{s.value}</p>
      <p style={{ ...meta(isMobile ? 9.5 : 10.5), marginTop: isMobile ? 10 : 14, lineHeight: 1.45 }}>{s.label}</p>
    </div>
  ));

  const standing = (
    <div style={{
      padding: isMobile ? "20px 0 22px" : "28px 0 28px 32px",
      borderLeft: isMobile ? "none" : rule,
      borderTop: isMobile ? rule : "none",
      minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center",
    }}>
      <p style={{ ...meta(11, C.burgundy), fontWeight: 700 }}>{earned?.label ?? "Building trust"}</p>
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 12, rowGap: 6, marginTop: 12 }}>
        <span style={display(isMobile ? 30 : 38)}>{next ? `${pad(helpful)} / ${pad(threshold)}` : helpful}</span>
        <span style={meta(10.5)}>Helpful responses</span>
      </div>
      <div
        role="progressbar"
        aria-label="Progress to the next tier"
        aria-valuemin={0}
        aria-valuemax={threshold}
        aria-valuenow={Math.min(helpful, threshold)}
        style={{ height: 8, background: "rgba(20,18,16,0.10)", marginTop: 14 }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: C.burgundy, transition: "width .6s ease" }} />
      </div>
      <p style={{ ...meta(10.5, C.ink), marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        {next ? <>Next <ArrowRight style={{ width: 13, height: 13 }} strokeWidth={2} /> {next.label}</> : "Highest tier"}
      </p>
    </div>
  );

  return isMobile ? (
    <div style={{ borderTop: rule, borderBottom: rule }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>{numbers}</div>
      {standing}
    </div>
  ) : (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr)) minmax(0, 1.7fr)", borderTop: rule, borderBottom: rule }}>
      {numbers}
      {standing}
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

/**
 * One full-width section under a rule. On desktop the heading sits in a rail
 * that lines up with the portrait; on smaller screens it sits on top.
 */
export function Section({ title, aside, action, rail, isMobile, children }: {
  title: string;
  aside?: string;
  action?: React.ReactNode;
  rail: boolean;
  isMobile: boolean;
  children: React.ReactNode;
}) {
  return (
    <section style={{ borderTop: `1px solid ${C.rule}`, marginTop: isMobile ? 44 : 64, paddingTop: isMobile ? 22 : 32 }}>
      {rail ? (
        <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", columnGap: 48 }}>
          <div>
            <h2 style={display("clamp(30px, 2.8vw, 42px)")}>{title}</h2>
            {aside && <p style={{ ...body(14), marginTop: 14, maxWidth: "30ch" }}>{aside}</p>}
            {action && <div style={{ marginTop: 18 }}>{action}</div>}
          </div>
          <div style={{ minWidth: 0 }}>{children}</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <h2 style={display(isMobile ? 30 : 38)}>{title}</h2>
            {action}
          </div>
          {aside && <p style={{ ...body(isMobile ? 13.5 : 14), marginTop: 10 }}>{aside}</p>}
          <div style={{ marginTop: isMobile ? 20 : 26 }}>{children}</div>
        </>
      )}
    </section>
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
export function DecisionsBlock({ heading, decisions, saved, tab = "decisions", onTab, viewerId, isMobile, onOpen, empty, emptySaved, sectionRef }: {
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
    <section ref={sectionRef} style={{ borderTop: `1px solid ${C.rule}`, marginTop: isMobile ? 44 : 64, paddingTop: isMobile ? 22 : 32, scrollMarginTop: 90 }}>
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
  const decisionsRef = useRef<HTMLElement>(null);

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
  const [mirrors, setMirrors] = useState<Mirror[]>([]);

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

  useEffect(() => {
    if (!profile || !user) return;
    const fetchMirrors = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, age, city, silhouette_preference, height_range, top_size, bottom_size, fit_preference, fit_details, style_aesthetics, purchase_frequency, risk_tolerance")
        .neq("id", user.id)
        .limit(120);
      if (!data) return;
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
  const [searchParams, setSearchParams] = useSearchParams();
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

  const showSaved = () => {
    setDecTab("saved");
    requestAnimationFrame(() => decisionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const saveBasicInfo = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: editName.trim(),
      age: editAge ? parseInt(editAge) : null,
      city: editCity || null,
      bio: editBio.trim().slice(0, BIO_MAX) || null,
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

  const portrait = (
    <div>
      <Portrait url={profile?.avatar_url ?? null} name={displayName} onPick={profile?.avatar_url ? undefined : pickPhoto} />
      <button onClick={pickPhoto} style={{ ...textLink(C.muted), marginTop: 12 }}>
        <Camera style={{ width: 14, height: 14 }} strokeWidth={1.75} />
        {profile?.avatar_url ? "Change photo" : "Add photo"}
      </button>
    </div>
  );

  const editForm = (
    <div style={{ maxWidth: 460 }}>
      <p style={{ ...meta(11, C.ink), fontWeight: 700, marginBottom: 16 }}>Edit profile</p>
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
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={saveBasicInfo} disabled={saving || !editName.trim()}
          style={{ ...squareBtn(true, C.burgundy), opacity: saving || !editName.trim() ? 0.5 : 1 }}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={cancelEdit} style={squareBtn(false)}>Cancel</button>
      </div>
    </div>
  );

  const menuItems: { label: string; on: () => void; tone?: string }[] = [
    { label: profile?.avatar_url ? "Change photo" : "Add photo", on: pickPhoto },
    { label: fitPhotos.length ? "Manage IRL photos" : "Add IRL photos", on: fitPhotos.length ? () => setFitPhotoModal("manage") : openUpload },
    { label: "Dial in your fit", on: () => setShowFitModal(true) },
    { label: "Sign out", on: handleSignOut, tone: C.burgundy },
  ];

  const identity = editing ? editForm : (
    <div>
      <HeroEyebrow tier={tier} since={profile?.created_at} />
      <div style={{ marginTop: 16 }}><BigName name={displayName} isMobile={isMobile} /></div>
      {(profile?.age || profile?.city) && (
        <p style={{ ...meta(12, C.inkSoft), marginTop: 16 }}>
          {[profile?.age, profile?.city?.split(",")[0]].filter(Boolean).join(" · ")}
        </p>
      )}
      {profile?.bio && (
        <p style={{ ...body(isMobile ? 14.5 : 15.5), marginTop: 14, maxWidth: "42ch", whiteSpace: "pre-line" }}>{profile.bio}</p>
      )}
      <div style={{ display: "flex", alignItems: "stretch", gap: 8, marginTop: 24 }}>
        <button onClick={() => setEditing(true)} style={squareBtn(true, C.burgundy)}>Edit profile</button>
        <button onClick={showSaved} aria-label="Saved decisions" title="Saved" style={iconSquare}>
          <Bookmark style={{ width: 18, height: 18 }} strokeWidth={1.75} />
        </button>
        <div style={{ position: "relative", display: "flex" }}>
          <button onClick={() => setMenuOpen(v => !v)} aria-label="More" aria-haspopup="menu" aria-expanded={menuOpen} style={iconSquare}>
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
    </div>
  );

  const irl = (
    <IrlPhotos
      label="You, IRL"
      photos={fitPhotos}
      onOpen={setLightboxIdx}
      owner={{ onAdd: openUpload, onManage: () => setFitPhotoModal("manage"), confirm: fitPhotoConfirm }}
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

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div style={{ marginTop: isMobile ? 16 : 44 }}>
          <Hero isMobile={isMobile} isWide={isWide} portrait={portrait} identity={identity} irl={irl} />
        </div>

        {/* ── First run ────────────────────────────────────────────────────── */}
        {showWelcome && (
          <WelcomeNudge isMobile={isMobile} onDismiss={() => setShowWelcome(false)} />
        )}

        {/* ── Stats and standing ───────────────────────────────────────────── */}
        <div style={{ marginTop: isMobile ? 36 : 56 }}>
          <StatsRow decisions={decisions?.length ?? 0} takes={stats.takes} helpful={stats.helpfulVotes} isMobile={isMobile} />
        </div>

        {/* ── Fit profile ──────────────────────────────────────────────────── */}
        <Section title="Your fit profile" rail={isWide} isMobile={isMobile}>
          {editMode === "silhouette" ? silhouettePicker : sil ? (
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
          )}
        </Section>

        {/* ── Style ────────────────────────────────────────────────────────── */}
        <Section
          title="Your style"
          aside="The aesthetics you shop for."
          rail={isWide}
          isMobile={isMobile}
          action={editMode !== "style" && styles.length > 0
            ? <button onClick={openStyleEdit} style={textLink(C.burgundy)}>Edit</button>
            : undefined}
        >
          {editMode === "style" ? stylePicker : styles.length > 0 ? (
            <StyleRow labels={styles} isMobile={isMobile} />
          ) : (
            <EmptyNote text="Pick up to three aesthetics that sound like you." action="Set your aesthetic" onAction={openStyleEdit} />
          )}
        </Section>

        {/* ── Mirrors ──────────────────────────────────────────────────────── */}
        {mirrors.length > 0 && (
          <Section title="Your mirrors" aside="Women with similar fit, taste, and how they shop." rail={isWide} isMobile={isMobile}>
            <div style={isMobile
              ? { display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", margin: "0 -16px", padding: "0 16px 4px", scrollSnapType: "x mandatory" }
              : { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: isWide ? 24 : 16 }}>
              {mirrors.map((m) => <MirrorCard key={m.id} m={m} isMobile={isMobile} onOpen={() => navigate(`/profile/${m.id}`)} />)}
            </div>
          </Section>
        )}

        {/* ── Decisions and saved ──────────────────────────────────────────── */}
        <DecisionsBlock
          sectionRef={decisionsRef}
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

        <ProfileFooter isMobile={isMobile} />
      </main>
      </div>

      <DialInFitModal open={showFitModal} onClose={() => { setShowFitModal(false); fetchProfile(); }} />
    </div>
  );
};

export default Profile;
