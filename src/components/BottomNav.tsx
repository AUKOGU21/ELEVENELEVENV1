// ── BottomNav ─────────────────────────────────────────────────────────────────
// Phones only: Feed, Mine and Profile along the bottom, where a thumb reaches.
// The top bar keeps the wordmark and the bell; the floating + (and the Post a
// decision / Ask for recs buttons under the headline) stay as they are.
// Desktop keeps Feed / Mine in the top bar.
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { C, SANS, meta } from "@/lib/design";
import { ringStyle } from "@/lib/tiers";
import { getInitials } from "@/lib/format";

/** The bar's height above the safe area. Pages pad their bottom by this plus the safe area. */
export const BOTTOM_NAV_H = 58;
export const BOTTOM_NAV_PAD = `calc(${BOTTOM_NAV_H}px + env(safe-area-inset-bottom))`;

export type BottomTab = "feed" | "mine" | "profile" | null;

export default function BottomNav({ active, onFeed, onMine, mineCount, avatarUrl, displayName, badgeTier }: {
  active: BottomTab;
  /** On the feed page itself, switch tabs in place instead of navigating. */
  onFeed?: () => void;
  onMine?: () => void;
  mineCount?: number;
  avatarUrl?: string | null;
  displayName?: string | null;
  badgeTier?: string | null;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Type, not icons: the same small caps as the old top tabs, a burgundy rule
  // under the one you're on. Profile is her own photo.
  const item = (on: boolean): React.CSSProperties => ({
    ...meta(11, on ? C.ink : C.muted), fontWeight: 700, letterSpacing: "0.14em",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7,
    background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS,
    WebkitTapHighlightColor: "transparent",
  });
  const mark = (on: boolean) => (
    <span aria-hidden style={{ width: 18, height: 2, background: on ? C.burgundy : "transparent" }} />
  );
  // Signed out, Sign in stays in the top bar; the bar is just Feed and Mine.
  const cols = user ? 3 : 2;

  return (
    <nav aria-label="Main" style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 45, background: C.paper,
      borderTop: `1px solid ${C.rule}`, paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, height: BOTTOM_NAV_H, alignItems: "stretch" }}>
        <button style={item(active === "feed")} aria-current={active === "feed" ? "page" : undefined}
          onClick={() => (onFeed ? onFeed() : navigate("/feed"))}>
          <span style={{ height: 2 }} />
          Feed
          {mark(active === "feed")}
        </button>
        <button style={item(active === "mine")} aria-current={active === "mine" ? "page" : undefined}
          onClick={() => (onMine ? onMine() : navigate("/feed", { state: { tab: "mine" } }))}>
          <span style={{ height: 2 }} />
          {mineCount ? `Mine (${mineCount})` : "Mine"}
          {mark(active === "mine")}
        </button>
        {user && (
          <button style={item(active === "profile")} aria-current={active === "profile" ? "page" : undefined} aria-label="Your profile"
            onClick={() => navigate("/profile")}>
            <span style={{ height: 2 }} />
            <span style={{
              width: 28, height: 28, borderRadius: "50%", overflow: "hidden", background: "#3A3530", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, letterSpacing: 0,
              ...ringStyle(badgeTier, 1.5),
            }}>
              {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(displayName ?? null)}
            </span>
            {mark(active === "profile")}
          </button>
        )}
      </div>
    </nav>
  );
}
