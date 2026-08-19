// ── NotificationBell ──────────────────────────────────────────────────────────
// In-app notification center. Replaces the top-right "+ Post" (posting now lives
// in the feed banner). Reads the user's own rows from the existing `notifications`
// table, shows an unread dot, and marks everything read when the panel opens.
// Email notifications still fire separately — this is the in-app mirror.
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import { pushState, enablePush, type PushState } from "@/lib/push";

const INK = "#1C1712";
const MUTED = "#8C7A70";

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
  const who = d.actor_name || "Someone";
  const item = d.item || d.product_name || "your decision";
  switch (n.type) {
    case "weigh_in": return `${who} weighed in on ${item}`;
    case "recommendation": return `${who} recommended a product for “${item}”`;
    case "reply": return `${who} replied to your take on ${item}`;
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

  const dim = isMobile ? 30 : 32;

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="rounded-full flex items-center justify-center transition-all"
        style={{ width: dim, height: dim, background: open ? "#1C1712" : "rgba(28,23,18,0.08)", position: "relative" }}
      >
        <Bell style={{ width: 15, height: 15, color: open ? "#FDFAF6" : "rgba(28,23,18,0.55)" }} />
        {unread > 0 && (
          <span style={{ position: "absolute", top: -2, right: -2, minWidth: 15, height: 15, padding: "0 4px", borderRadius: 100, background: "#C0392B", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid #EBE6DE" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="no-scrollbar" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 60,
          width: isMobile ? "min(300px, 88vw)" : 340, maxHeight: 420, overflowY: "auto",
          background: "#FDFAF6", borderRadius: 16, border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 16px 44px rgba(28,23,18,0.20)",
        }}>
          <div style={{ padding: "13px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", position: "sticky", top: 0, background: "#FDFAF6" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: 0 }}>Notifications</p>
          </div>

          {push === "default" && (
            <button
              onClick={turnOnPush}
              disabled={pushBusy}
              style={{ width: "100%", textAlign: "left", padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(196,158,100,0.10)", cursor: "pointer" }}
            >
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: INK }}>
                {pushBusy ? "Turning on…" : "Turn on push notifications ✦"}
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                Get a ping when someone weighs in on your decision.
              </span>
            </button>
          )}
          {push === "needs-install" && (
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(196,158,100,0.10)" }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: INK }}>Add ElevenEleven to your Home Screen</span>
              <span style={{ display: "block", fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                On iPhone, push alerts turn on once the app is on your home screen.
              </span>
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ padding: "30px 20px", textAlign: "center" }}>
              <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>You're all caught up ✦</p>
              <p style={{ fontSize: 12.5, color: MUTED, margin: "6px 0 0", opacity: 0.8 }}>Weigh-ins, saves, and outcomes on your decisions show up here.</p>
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => { if (n.decision_id && onOpenDecision) onOpenDecision(n.decision_id, n.response_id); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left", cursor: n.decision_id ? "pointer" : "default",
                  display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "12px 16px", background: n.read_at ? "transparent" : "rgba(196,158,100,0.08)",
                  border: "none", borderBottom: "1px solid rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: n.read_at ? "transparent" : "#C49E64", marginTop: 6, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, color: "#3A3530", margin: 0, lineHeight: 1.4 }}>{messageFor(n)}</p>
                  <p style={{ fontSize: 12, color: MUTED, margin: "3px 0 0" }}>{timeAgo(n.created_at)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
