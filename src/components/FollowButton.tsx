// ── FollowButton ──────────────────────────────────────────────────────────────
// Sits next to a poster's name on her cards and on her profile. Following her
// makes you eligible for a notification when she posts a new decision. No
// follower counts anywhere yet, on purpose.
import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

const INK = "#1C1712";
const MUTED = "#8C7A70";

interface Props {
  targetUserId: string;
  user: { id: string } | null;
  following: boolean;
  onChange: (targetUserId: string, following: boolean) => void;
  onSignIn?: () => void;
  size?: "sm" | "md";
  /** "editorial" is the redesign's square button; "pill" is the original. */
  variant?: "pill" | "editorial";
}

export default function FollowButton({ targetUserId, user, following, onChange, onSignIn, size = "sm", variant = "pill" }: Props) {
  const [busy, setBusy] = useState(false);

  // Never offer to follow yourself.
  if (user && user.id === targetUserId) return null;

  const small = size === "sm";

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { onSignIn?.(); return; }
    if (busy) return;
    setBusy(true);
    const next = !following;
    onChange(targetUserId, next);            // optimistic: the tap should feel instant
    try {
      if (next) {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
        // Tell her someone followed her. Email always, push if she has it on.
        supabase.functions
          .invoke("notify", {
            body: {
              type: "follow",
              user_id: targetUserId,
              // notify resolves the follower's name from actor_id, so the copy
              // can't be spoofed or go stale.
              data: { actor_id: user.id },
            },
          })
          .catch((e) => console.warn("follow notify failed:", e));
      } else {
        await supabase.from("follows").delete()
          .eq("follower_id", user.id).eq("following_id", targetUserId);
      }
    } catch (err) {
      console.error("follow toggle failed:", err);
      onChange(targetUserId, !next);         // put it back
    }
    setBusy(false);
  };

  if (variant === "editorial") {
    // The redesign's version: a small square button with a plus, filled so it
    // can't be missed. Following turns it quiet.
    return (
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, whiteSpace: "nowrap",
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: small ? 9 : 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
          padding: small ? "4px 7px" : "8px 13px", borderRadius: 2, cursor: busy ? "default" : "pointer", lineHeight: 1.2,
          ...(following
            ? { background: "transparent", border: "1px solid rgba(20,18,16,0.22)", color: "#8A8178" }
            : { background: "#141210", border: "1px solid #141210", color: "#F7F4EF" }),
        }}
      >
        {following
          ? <><Check style={{ width: small ? 9 : 11, height: small ? 9 : 11 }} strokeWidth={2.5} /> Following</>
          : <><Plus style={{ width: small ? 9 : 11, height: small ? 9 : 11 }} strokeWidth={2.5} /> Follow</>}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
        fontSize: small ? 10 : 12,
        fontWeight: 700,
        letterSpacing: "0.02em",
        padding: small ? "3px 9px" : "5px 13px",
        borderRadius: 100,
        cursor: busy ? "default" : "pointer",
        whiteSpace: "nowrap",
        transition: "all .15s",
        ...(following
          ? { background: "transparent", border: `1px solid rgba(28,23,18,0.16)`, color: MUTED }
          : { background: INK, border: `1px solid ${INK}`, color: "#FDFAF6" }),
      }}
    >
      {following
        ? <><Check style={{ width: small ? 10 : 12, height: small ? 10 : 12 }} /> Following</>
        : <><Plus style={{ width: small ? 10 : 12, height: small ? 10 : 12 }} /> Follow</>}
    </button>
  );
}
