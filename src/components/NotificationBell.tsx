// ── NotificationBell ──────────────────────────────────────────────────────────
// In-app notification center. Replaces the top-right "+ Post" (posting now lives
// in the feed banner). Reads the user's own rows from the existing `notifications`
// table, shows an unread count, and marks everything read when the panel opens.
// Email notifications still fire separately — this is the in-app mirror.
// Drawn like the rest of the header: a bare line icon, a square count, a flat
// panel with hairlines. No circles, no glow.
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import { pushState, enablePush, type PushState } from "@/lib/push";
import { C, RADIUS, SANS, body, display, meta } from "@/lib/design";

interface NotificationRow {
  id: string;
  created_at: string;
  read_at: string | null;
  type: string | null;
  decision_id: string | null;
  response_id: string | null;
  data: Record<string, any> | null;
}

interface Props {
  user: { id: string } | null;
  isMobile: boolean;
  onOpenDecision?: (decisionId: string, responseId?: string | null) => void;
}

function messageFor(n: NotificationRow): string {
  const d = n.data ?? {};
  // The notify function writes push_body from the shared copy map, so the bell,
  // the push and the email all say the same sentence. Everything below is the
  // fallback for rows written before that existed.
  if (typeof d.push_body === "string" && d.push_body.trim()) {
    return d.push_body.replace(/\s*Tap to [^.]*\.?$/i, "").trim();
  }
  const who = d.actor_name || "Someone";
  const item = d.item || d.product_name || "your decision";
  switch (n.type) {
    case "weigh_in": return `${who} weighed in on ${item}`;
    case "recommendation": return `${who} recommended a product for “${item}”`;
    case "reply": return `${who} replied to your take on ${item}`;
    case "relevant": return `${who} needs your take on ${item}`;
    case "follow": return `${who} followed you`;
    case "tier": return `You're now a ${d.tier || "Contributor"}`;
    case "follow_post": return `${who} posted ${item}`;
    case "comment": return `${who} commented on ${item}`;
    case "comment_thread": return `${who} also commented on ${item}`;
    case "outcome": return `${who} shared how it turned out`;
    case "save": return `${who} saved your decision`;
    case "helpful": return `${who} found your take helpful`;
    default: return d.message || "New activity on your profile";
  }
}

export default function NotificationBell({ user, isMobile, onOpenDecision }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [push, setPush] = useState<PushState>("granted"); // assume granted until checked, so we don't flash the prompt
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => { if (open) setPush(pushState()); }, [open]);

  const turnOnPush = async () => {
    setPushBusy(true);
    await enablePush(user.id);
    setPush(pushState());
    setPushBusy(false);
  };
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("notifications")
        .select("id, created_at, read_at, type, decision_id, response_id, data")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      const rows = (data ?? []) as NotificationRow[];
      setItems(rows);
      setUnread(rows.filter((r) => !r.read_at).length);
    } catch { /* table/policy issues shouldn't break the header */ }
  }, [user]);

  // Initial load + realtime badge updates.
  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0 && user) {
      // Optimistically clear, then persist.
      setUnread(0);
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((r) => (r.read_at ? r : { ...r, read_at: nowIso })));
      try {
        await supabase.from("notifications").update({ read_at: nowIso }).eq("user_id", user.id).is("read_at", null);
      } catch { /* ignore */ }
    }
  };

  const icon = isMobile ? 20 : 22;
  const row: React.CSSProperties = { padding: "14px 18px", borderBottom: `1px solid ${C.rule}` };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        style={{ position: "relative", background: "none", border: "none", padding: 4, cursor: "pointer", lineHeight: 0, color: open ? C.burgundy : C.ink }}
      >
        <Bell style={{ width: icon, height: icon }} strokeWidth={1.5} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -1, right: -4, minWidth: 16, height: 16, padding: "0 4px", boxSizing: "border-box",
            borderRadius: RADIUS, background: C.burgundy, color: C.paper,
            fontFamily: SANS, fontSize: 9.5, fontWeight: 700, lineHeight: "16px", textAlign: "center",
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="no-scrollbar" style={{
          position: "absolute", top: "calc(100% + 14px)", right: 0, zIndex: 60,
          width: isMobile ? "min(320px, 88vw)" : 360, maxHeight: 440, overflowY: "auto",
          background: C.paper, borderRadius: RADIUS, border: `1px solid ${C.ruleStrong}`,
          boxShadow: "0 18px 40px rgba(20,18,16,0.14)",
        }}>
          <div style={{ ...row, position: "sticky", top: 0, zIndex: 1, background: C.paper }}>
            <p style={{ ...meta(11, C.ink), fontWeight: 700 }}>Notifications</p>
          </div>

          {push === "default" && (
            <button
              onClick={turnOnPush}
              disabled={pushBusy}
              style={{ ...row, display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${C.rule}`, background: C.well, cursor: "pointer" }}
            >
              <span style={{ display: "block", ...meta(10.5, C.burgundy), fontWeight: 700 }}>
                {pushBusy ? "Turning on..." : "Turn on push notifications"}
              </span>
              <span style={{ display: "block", ...body(12.5, C.inkSoft), marginTop: 5 }}>
                Get a ping when someone weighs in on your decision.
              </span>
            </button>
          )}
          {push === "needs-install" && (
            <div style={{ ...row, background: C.well }}>
              <span style={{ display: "block", ...meta(10.5, C.ink), fontWeight: 700 }}>Add ElevenEleven to your Home Screen</span>
              <span style={{ display: "block", ...body(12.5, C.inkSoft), marginTop: 5 }}>
                On iPhone, push alerts turn on once the app is on your home screen.
              </span>
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ padding: "28px 18px 30px" }}>
              <p style={display(26)}>All caught up.</p>
              <p style={{ ...body(13, C.muted), marginTop: 8 }}>Weigh-ins, saves, and outcomes on your decisions show up here.</p>
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => { if (n.decision_id && onOpenDecision) onOpenDecision(n.decision_id, n.response_id); setOpen(false); }}
                style={{
                  ...row, width: "100%", textAlign: "left", cursor: n.decision_id ? "pointer" : "default",
                  display: "flex", gap: 12, alignItems: "flex-start",
                  background: "transparent", border: "none", borderBottom: `1px solid ${C.rule}`,
                }}
              >
                <span aria-hidden style={{ width: 6, height: 6, background: n.read_at ? "transparent" : C.burgundy, marginTop: 7, flexShrink: 0 }} />
                <span style={{ display: "block", minWidth: 0 }}>
                  <span style={{ display: "block", ...body(13.5, n.read_at ? C.inkSoft : C.ink), lineHeight: 1.4 }}>{messageFor(n)}</span>
                  <span style={{ display: "block", ...meta(9.5, C.muted), marginTop: 6 }}>{timeAgo(n.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
