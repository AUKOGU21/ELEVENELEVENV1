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
}

export default function FollowButton({ targetUserId, user, following, onChange, onSignIn, size = "sm" }: Props) {
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
