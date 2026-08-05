// ── ResponseCard ──────────────────────────────────────────────────────────────
// One weigh-in, rendered identically wherever it appears (the responses drawer).
// Supports lightweight clarifying Replies: a subtle "Reply" text button opens an
// inline composer; replies render nested beneath, one level deep only. Replies are
// a KNOWLEDGE feature (Q → clarification), not a conversation thread.
import { useState, useRef, useEffect } from "react";
import { ThumbsUp, Check, ExternalLink, CornerDownRight, MoreHorizontal } from "lucide-react";
import MatchBadge from "./MatchBadge";
import { formatName, getInitials, recommendationLabel, prettyHost, timeAgo } from "@/lib/format";

export interface ReplyData {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: { display_name: string | null; avatar_url?: string | null } | null;
}

export interface ResponseCardData {
  id: string;
  recommendation: "buy" | "do_not_buy" | "need_more_info" | string;
  reasoning: string;
  photo_url: string | null;
  product_url: string | null;
  match_score: number | null;
  user_id: string;
  created_at: string;
  profiles: { display_name: string | null; avatar_url?: string | null } | null;
  replies?: ReplyData[];
}

interface Props {
  resp: ResponseCardData;
  counts: { helpful: number; not_helpful: number };
  myVote: "helpful" | "not_helpful" | undefined;
  canVote: boolean;
  onHelpful: (responseId: string) => void;
  user: { id: string } | null;
  onSubmitReply: (responseId: string, body: string) => Promise<void>;
  onDeleteReply: (replyId: string) => Promise<void>;
  onEditReply: (replyId: string, body: string) => Promise<void>;
  onSignIn: () => void;
  focused?: boolean;
}

const MUTED = "#8C7A70";
const MAXLEN = 250;

export default function ResponseCard({ resp, counts, myVote, canVote, onHelpful, user, onSubmitReply, onDeleteReply, onEditReply, onSignIn, focused }: Props) {
  const isBuy = resp.recommendation === "buy";
  const isNoBuy = resp.recommendation === "do_not_buy";
  const replies = resp.replies ?? [];
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Per-reply edit/delete menu + inline edit state.
  const [menuReplyId, setMenuReplyId] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuReplyId) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuReplyId(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuReplyId]);

  const saveEdit = async (replyId: string) => {
    const body = editText.trim();
    if (!body || savingEdit) return;
    setSavingEdit(true);
    try { await onEditReply(replyId, body.slice(0, MAXLEN)); setEditingReplyId(null); }
    catch (e) { console.error("edit reply failed:", e); }
    setSavingEdit(false);
  };

  // Deep-link from a reply notification: scroll to + briefly highlight the thread.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!focused) return;
    wrapRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
  }, [focused]);

  const openComposer = () => {
    if (!user) { onSignIn(); return; }
    setComposerOpen(true);
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      await onSubmitReply(resp.id, body.slice(0, MAXLEN));
      setText("");
      setComposerOpen(false);
    } catch (e) { console.error("reply failed:", e); }
    setPosting(false);
  };

  return (
    <div ref={wrapRef} style={{ background: "rgba(0,0,0,0.035)", borderRadius: 14, padding: "13px 15px", border: `1px solid ${flash ? "rgba(196,158,100,0.7)" : "rgba(0,0,0,0.06)"}`, boxShadow: flash ? "0 0 0 3px rgba(196,158,100,0.18)" : "none", transition: "box-shadow 0.4s, border-color 0.4s" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#3A3530", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "white", fontWeight: 700 }}>
            {resp.profiles?.avatar_url
              ? <img src={resp.profiles.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : getInitials(resp.profiles?.display_name ?? null)}
          </div>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#1A1A1A" }}>{formatName(resp.profiles?.display_name ?? null)}</span>
            <MatchBadge score={resp.match_score} />
          </div>
        </div>
        <div style={{ flexShrink: 0, borderRadius: 100, padding: "3px 10px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", background: isBuy ? "rgba(22,163,74,0.10)" : isNoBuy ? "rgba(192,57,43,0.10)" : "rgba(217,119,6,0.10)", color: isBuy ? "#16a34a" : isNoBuy ? "#c0392b" : "#d97706" }}>
          {recommendationLabel(resp.recommendation)}
        </div>
      </div>

      {/* Reasoning */}
      <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "#5A4A42", margin: "0 0 10px" }}>{resp.reasoning}</p>

      {/* Product link */}
      {resp.product_url && (
        <a href={resp.product_url} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, maxWidth: "100%", padding: "7px 13px", marginBottom: 10, borderRadius: 100, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(0,0,0,0.02)", color: "#3A3530", fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}>
          <ExternalLink style={{ width: 14, height: 14, flexShrink: 0, color: "#8C7A70" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prettyHost(resp.product_url)}</span>
        </a>
      )}

      {/* Photo */}
      {resp.photo_url && (
        <img src={resp.photo_url} alt="response" onClick={() => window.open(resp.photo_url!, "_blank")}
          style={{ height: 120, width: 96, objectFit: "cover", objectPosition: "top", borderRadius: 10, display: "block", marginBottom: 10, cursor: "zoom-in" }} />
      )}

      {/* Footer: helpful + reply + date */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => canVote && onHelpful(resp.id)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 13px", borderRadius: 100,
            border: `1.5px solid ${myVote === "helpful" ? "rgba(58,53,48,0.35)" : "rgba(0,0,0,0.15)"}`,
            background: myVote === "helpful" ? "rgba(58,53,48,0.08)" : "white",
            color: myVote === "helpful" ? "#1A1A1A" : "#5A4A42",
            cursor: canVote ? "pointer" : "default", fontSize: 13, fontWeight: 600, opacity: canVote ? 1 : 0.55,
          }}
        >
          {myVote === "helpful" ? <Check style={{ width: 12, height: 12 }} /> : <ThumbsUp style={{ width: 12, height: 12 }} />}
          <span>Helpful{counts.helpful > 0 ? ` (${counts.helpful})` : ""}</span>
        </button>
        {/* Reply — deliberately a quiet text button, never dominant */}
        <button onClick={openComposer} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 600, color: MUTED }}>
          Reply
        </button>
        <span style={{ marginLeft: "auto", fontSize: 13, color: MUTED }}>{timeAgo(resp.created_at)}</span>
      </div>

      {/* Replies — nested, one level, quieter than the response (annotations) */}
      {replies.length > 0 && (
        <div style={{ marginTop: 12, marginLeft: 4, paddingLeft: 12, borderLeft: "2px solid rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 12 }}>
          {replies.map((rp) => {
            const isMine = !!user && rp.user_id === user.id;
            const editing = editingReplyId === rp.id;
            return (
              <div key={rp.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#8C7A70", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "white", fontWeight: 700 }}>
                  {rp.profiles?.avatar_url ? <img src={rp.profiles.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(rp.profiles?.display_name ?? null)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#3A3530" }}>{formatName(rp.profiles?.display_name ?? null)}</span>
                    <span style={{ fontSize: 11, color: MUTED }}>{timeAgo(rp.created_at)}</span>
                  </div>
                  {editing ? (
                    <div style={{ marginTop: 4 }}>
                      <textarea autoFocus value={editText} maxLength={MAXLEN} onChange={(e) => setEditText(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid rgba(0,0,0,0.14)", background: "#fff", padding: "7px 9px", fontSize: 13, color: "#1A1A1A", resize: "none", fontFamily: "inherit" }} />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 5 }}>
                        <button onClick={() => setEditingReplyId(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: MUTED }}>Cancel</button>
                        <button onClick={() => saveEdit(rp.id)} disabled={!editText.trim() || savingEdit} style={{ background: editText.trim() && !savingEdit ? "#1C1712" : "rgba(0,0,0,0.25)", color: "#FDFAF6", border: "none", borderRadius: 100, padding: "5px 13px", fontSize: 12.5, fontWeight: 600, cursor: editText.trim() && !savingEdit ? "pointer" : "default" }}>{savingEdit ? "Saving…" : "Save"}</button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, lineHeight: 1.5, color: "#5A4A42", margin: "1px 0 0" }}>{rp.body}</p>
                  )}
                </div>
                {isMine && !editing && (
                  <div style={{ position: "relative", flexShrink: 0 }} ref={menuReplyId === rp.id ? menuRef : undefined}>
                    <button onClick={() => setMenuReplyId(menuReplyId === rp.id ? null : rp.id)} aria-label="Reply options" style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2, lineHeight: 0 }}>
                      <MoreHorizontal style={{ width: 15, height: 15 }} />
                    </button>
                    {menuReplyId === rp.id && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#FDFAF6", borderRadius: 10, border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 8px 22px rgba(0,0,0,0.14)", minWidth: 110, zIndex: 5, overflow: "hidden" }}>
                        <button onClick={() => { setEditingReplyId(rp.id); setEditText(rp.body); setMenuReplyId(null); }} style={{ width: "100%", textAlign: "left", padding: "9px 13px", background: "none", border: "none", fontSize: 13, color: "#1A1A1A", cursor: "pointer" }}>Edit</button>
                        <button onClick={() => { setMenuReplyId(null); onDeleteReply(rp.id); }} style={{ width: "100%", textAlign: "left", padding: "9px 13px", background: "none", border: "none", fontSize: 13, color: "#c0392b", cursor: "pointer", borderTop: "1px solid rgba(0,0,0,0.06)" }}>Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline composer */}
      {composerOpen && (
        <div style={{ marginTop: 12, marginLeft: 4, paddingLeft: 12, borderLeft: "2px solid rgba(196,158,100,0.4)" }}>
          <textarea
            autoFocus
            value={text}
            maxLength={MAXLEN}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask a follow-up..."
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1px solid rgba(0,0,0,0.14)", background: "#fff", padding: "9px 11px", fontSize: 13.5, color: "#1A1A1A", resize: "none", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 11, color: MUTED }}>{text.length}/{MAXLEN}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setComposerOpen(false); setText(""); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: MUTED, padding: "6px 8px" }}>Cancel</button>
              <button onClick={submit} disabled={!text.trim() || posting} style={{ background: text.trim() && !posting ? "#1C1712" : "rgba(0,0,0,0.25)", color: "#FDFAF6", border: "none", borderRadius: 100, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: text.trim() && !posting ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <CornerDownRight style={{ width: 13, height: 13 }} /> {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
