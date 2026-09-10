// ── CommentThread ─────────────────────────────────────────────────────────────
// Comments on the decision itself, separate from weigh-ins. A weigh-in is a
// structured buy / don't-buy call; a comment is just a question or a reaction —
// "what went wrong?", "what size did you try?". It's the only way to reach the
// poster on a decided post, where weighing in no longer makes sense.
import { useState, useEffect, useRef } from "react";
import { ringStyle } from "@/lib/tiers";
import { MoreHorizontal } from "lucide-react";
import { getInitials, timeAgo } from "@/lib/format";

const INK = "#1C1712";
const MUTED = "#8C7A70";

export interface CommentData {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
  profiles?: { display_name: string | null; avatar_url: string | null; badge_tier?: string | null } | null;
}

interface Props {
  comments: CommentData[];
  user: { id: string } | null;
  posterId: string;
  isClosed: boolean;
  onSubmit: (body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onSignIn: () => void;
}

export default function CommentThread({ comments, user, posterId, isClosed, onSubmit, onDelete, onEdit, onSignIn }: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Editing her own comment, the same way she can already edit a reply.
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click anywhere else and the little menu closes.
  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuId]);

  const saveEdit = async (commentId: string) => {
    const body = editDraft.trim();
    if (!body || savingEdit) return;
    setSavingEdit(true);
    try {
      await onEdit(commentId, body);
      setEditingId(null);
      setEditDraft("");
    } catch { /* the handler logs; leave her text on screen so nothing is lost */ }
    setSavingEdit(false);
  };

  const ordered = [...comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onSubmit(body);
      setDraft("");
    } catch { /* the handler logs; keep her text so nothing is lost */ }
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ height: 1, background: "rgba(0,0,0,0.08)", marginBottom: 16 }} />
      <p style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, margin: "0 0 12px" }}>
        {ordered.length > 0 ? `Comments (${ordered.length})` : "Comments"}
      </p>

      {ordered.length === 0 && (
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: "0 0 14px" }}>
          {isClosed
            ? "Ask her how it turned out, or why she passed."
            : "Ask her anything you need to know before you can weigh in."}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {ordered.map((c) => {
          const name = c.profiles?.display_name ?? null;
          const isPoster = c.user_id === posterId;
          const isMine = !!user && c.user_id === user.id;
          const editing = editingId === c.id;
          // A second of slack, so the row a save writes doesn't read as "edited".
          const edited = !!c.updated_at
            && new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 1000;
          return (
            <div key={c.id} style={{ display: "flex", gap: 9 }}>
              <div style={{ ...ringStyle(c.profiles?.badge_tier, 1.5), width: 26, height: 26, borderRadius: "50%", background: "#3A3530", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>
                {c.profiles?.avatar_url
                  ? <img src={c.profiles.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : getInitials(name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{name ?? "Someone"}</span>
                  {isPoster && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#A07848", background: "rgba(160,120,72,0.12)", borderRadius: 100, padding: "2px 7px" }}>
                      Her
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: MUTED }}>{timeAgo(c.created_at)}</span>
                  {edited && <span style={{ fontSize: 10.5, color: MUTED }}>edited</span>}
                  {isMine && !editing && (
                    <div style={{ marginLeft: "auto", position: "relative", flexShrink: 0 }} ref={menuId === c.id ? menuRef : undefined}>
                      <button
                        onClick={() => setMenuId(menuId === c.id ? null : c.id)}
                        aria-label="Comment options"
                        style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2, lineHeight: 0 }}
                      >
                        <MoreHorizontal style={{ width: 15, height: 15 }} />
                      </button>
                      {menuId === c.id && (
                        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#FDFAF6", borderRadius: 10, border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 8px 22px rgba(0,0,0,0.14)", minWidth: 110, zIndex: 5, overflow: "hidden" }}>
                          <button
                            onClick={() => { setEditingId(c.id); setEditDraft(c.body); setMenuId(null); }}
                            style={{ width: "100%", textAlign: "left", padding: "9px 13px", background: "none", border: "none", fontSize: 11, color: INK, cursor: "pointer" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setMenuId(null); if (confirm("Delete this comment?")) onDelete(c.id); }}
                            style={{ width: "100%", textAlign: "left", padding: "9px 13px", background: "none", border: "none", fontSize: 11, color: "#c0392b", cursor: "pointer", borderTop: "1px solid rgba(0,0,0,0.06)" }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {editing ? (
                  <div style={{ marginTop: 5 }}>
                    <textarea
                      autoFocus
                      value={editDraft}
                      maxLength={2000}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "9px 11px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", background: "#fff", fontSize: 13, lineHeight: 1.45, color: INK, fontFamily: "inherit", outline: "none" }}
                    />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                      <button
                        onClick={() => { setEditingId(null); setEditDraft(""); }}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: MUTED, padding: "6px 8px" }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(c.id)}
                        disabled={!editDraft.trim() || savingEdit}
                        style={{ background: editDraft.trim() && !savingEdit ? INK : "rgba(0,0,0,0.25)", color: "#FDFAF6", border: "none", borderRadius: 100, padding: "7px 16px", fontSize: 11, fontWeight: 600, cursor: editDraft.trim() && !savingEdit ? "pointer" : "default" }}
                      >
                        {savingEdit ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: "#3A3530", margin: "3px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {c.body}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {user ? (
        <div style={{ marginTop: ordered.length > 0 ? 16 : 0 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={isClosed ? "Ask her what happened..." : "Ask a question..."}
            style={{ width: "100%", resize: "vertical", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", fontSize: 13, lineHeight: 1.45, color: INK, fontFamily: "inherit", outline: "none" }}
          />
          <button
            onClick={send}
            disabled={!draft.trim() || busy}
            style={{
              marginTop: 8, width: "100%", padding: "10px 0", borderRadius: 100, border: "none",
              background: draft.trim() && !busy ? INK : "rgba(0,0,0,0.10)",
              color: draft.trim() && !busy ? "#FDFAF6" : MUTED,
              fontSize: 12.5, fontWeight: 600, cursor: draft.trim() && !busy ? "pointer" : "default",
            }}
          >
            {busy ? "Posting..." : "Post comment"}
          </button>
        </div>
      ) : (
        <button
          onClick={onSignIn}
          style={{ marginTop: 14, width: "100%", padding: "11px 0", borderRadius: 100, border: "1px solid rgba(0,0,0,0.12)", background: "transparent", color: INK, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          Sign in to comment
        </button>
      )}
    </div>
  );
}
