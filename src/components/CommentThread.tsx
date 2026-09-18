// ── CommentThread ─────────────────────────────────────────────────────────────
// Questions on a decision, as opposed to weigh-ins. In the decision view this
// renders twice: under Responses, for what was asked while she was deciding, and
// as the whole Follow-ups tab, for what gets asked after she decided. A woman who
// finds this decision months from now can still ask how it held up.
//
// Type and rules, no bubbles. The original poster is named as such whenever she
// answers, so a reader can tell her voice from everyone else's.
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { C, RADIUS, SANS, body, meta, strong } from "@/lib/design";
import { timeAgo } from "@/lib/format";
import { Avatar } from "./DecisionTile";
import { PersonName } from "./PersonLink";

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
  /** Section label above the list. Null hides it. */
  heading?: string | null;
  placeholder?: string;
  emptyHint?: string | null;
  submitLabel?: string;
  /** Show the list only, with no way to add to it. */
  hideComposer?: boolean;
}

const textBtn = (color: string): React.CSSProperties => ({
  ...meta(10.5, color),
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
});

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: RADIUS,
  border: `1px solid ${C.rule}`,
  background: "#FFFFFF",
  padding: "12px 14px",
  fontFamily: SANS,
  fontSize: 14,
  lineHeight: 1.5,
  color: C.ink,
  resize: "vertical",
  outline: "none",
};

export default function CommentThread({
  comments, user, posterId, isClosed, onSubmit, onDelete, onEdit, onSignIn,
  heading, placeholder, emptyHint, submitLabel = "Post", hideComposer = false,
}: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuId]);

  const ordered = [...comments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const send = async () => {
    const b = draft.trim();
    if (!b || busy) return;
    setBusy(true);
    try { await onSubmit(b); setDraft(""); }
    catch { /* the handler logs; keep her text so nothing is lost */ }
    setBusy(false);
  };

  const saveEdit = async (commentId: string) => {
    const b = editDraft.trim();
    if (!b || savingEdit) return;
    setSavingEdit(true);
    try { await onEdit(commentId, b); setEditingId(null); setEditDraft(""); }
    catch { /* the handler logs; leave her text on screen */ }
    setSavingEdit(false);
  };

  const hint = emptyHint !== undefined
    ? emptyHint
    : isClosed ? "Ask her how it turned out, or why she passed." : "Ask her anything you need to know before you can weigh in.";

  return (
    <div>
      {heading && <p style={{ ...meta(11, C.ink), marginBottom: 4 }}>{heading}</p>}

      {ordered.length === 0 && hint && (
        <p style={{ ...body(13.5, C.muted), padding: "14px 0 18px" }}>{hint}</p>
      )}

      {ordered.map((c) => {
        const isPoster = c.user_id === posterId;
        const isMine = !!user && c.user_id === user.id;
        const editing = editingId === c.id;
        // A second of slack, so the row a save writes doesn't read as "edited".
        const edited = !!c.updated_at && new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 1000;
        return (
          <div key={c.id} style={{ display: "flex", gap: 14, padding: "20px 0", borderBottom: `1px solid ${C.rule}` }}>
            <Avatar url={c.profiles?.avatar_url ?? null} name={c.profiles?.display_name ?? null} tier={c.profiles?.badge_tier} size={34} userId={c.user_id} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 12, rowGap: 4 }}>
                <PersonName userId={c.user_id} name={c.profiles?.display_name} />
                {isPoster && <span style={{ ...meta(10, C.burgundy), fontWeight: 700 }}>Original poster</span>}
                <span style={body(12, C.muted)}>{timeAgo(c.created_at)}{edited ? "  ·  edited" : ""}</span>
                {isMine && !editing && (
                  <div style={{ marginLeft: "auto", position: "relative" }} ref={menuId === c.id ? menuRef : undefined}>
                    <button onClick={() => setMenuId(menuId === c.id ? null : c.id)} aria-label="Comment options" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 2, lineHeight: 0 }}>
                      <MoreHorizontal style={{ width: 15, height: 15 }} />
                    </button>
                    {menuId === c.id && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: RADIUS, minWidth: 120, zIndex: 5 }}>
                        <button onClick={() => { setEditingId(c.id); setEditDraft(c.body); setMenuId(null); }} style={{ ...textBtn(C.ink), display: "block", width: "100%", textAlign: "left", padding: "10px 14px" }}>Edit</button>
                        <button onClick={() => { setMenuId(null); if (confirm("Delete this comment?")) onDelete(c.id); }} style={{ ...textBtn(C.burgundy), display: "block", width: "100%", textAlign: "left", padding: "10px 14px", borderTop: `1px solid ${C.rule}` }}>Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {editing ? (
                <div style={{ marginTop: 8 }}>
                  <textarea autoFocus rows={2} maxLength={2000} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} style={field} />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 18, marginTop: 8 }}>
                    <button onClick={() => { setEditingId(null); setEditDraft(""); }} style={textBtn(C.muted)}>Cancel</button>
                    <button onClick={() => saveEdit(c.id)} disabled={!editDraft.trim() || savingEdit} style={textBtn(C.burgundy)}>{savingEdit ? "Saving..." : "Save"}</button>
                  </div>
                </div>
              ) : (
                <p style={{ ...body(14.5, C.ink), marginTop: 6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.body}</p>
              )}
            </div>
          </div>
        );
      })}

      {!hideComposer && (user ? (
        <div style={{ marginTop: 18 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={placeholder ?? (isClosed ? "Ask her what happened..." : "Ask a question...")}
            style={field}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              onClick={send}
              disabled={!draft.trim() || busy}
              style={{
                ...meta(11, draft.trim() && !busy ? "#FFFFFF" : C.muted),
                fontWeight: 700,
                background: draft.trim() && !busy ? C.ink : "transparent",
                border: `1px solid ${draft.trim() && !busy ? C.ink : C.rule}`,
                borderRadius: RADIUS,
                padding: "11px 20px",
                cursor: draft.trim() && !busy ? "pointer" : "default",
              }}
            >
              {busy ? "Posting..." : submitLabel}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onSignIn} style={{ ...textBtn(C.burgundy), fontWeight: 700, marginTop: 18 }}>
          Sign in to comment
        </button>
      ))}
    </div>
  );
}
