// ── ResponseItem ──────────────────────────────────────────────────────────────
// One weigh-in inside the decision view. No card around it: type, spacing and a
// rule underneath.
//
// Beside her name goes only what she told us herself when she weighed in: how
// closely she matches the poster, her experience with this item or brand, and
// her verdict. That's why her take is worth reading. Nothing inferred, so never
// "similar body" or "similar height".
import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, MoreHorizontal, ThumbsUp } from "lucide-react";
import { C, RADIUS, SANS, body, meta, strong } from "@/lib/design";
import { experienceLabel, formatName, prettyHost, recommendationLabel, timeAgo } from "@/lib/format";
import { Avatar } from "./DecisionTile";
import { PersonName } from "./PersonLink";
import MatchSeal from "./MatchSeal";
import type { ReplyData } from "./ResponseCard";

export interface ResponseItemData {
  id: string;
  recommendation: string;
  reasoning: string;
  photo_url: string | null;
  product_url: string | null;
  match_score: number | null;
  helpfulness_votes?: number;
  user_id: string;
  created_at: string;
  personal_experience?: string | null;
  profiles: { display_name: string | null; avatar_url?: string | null; badge_tier?: string | null } | null;
  replies?: ReplyData[];
}

interface Props {
  resp: ResponseItemData;
  helpfulCount: number;
  myVote: "helpful" | "not_helpful" | undefined;
  canVote: boolean;
  onHelpful: (responseId: string) => void;
  user: { id: string } | null;
  onSubmitReply: (responseId: string, body: string) => Promise<void>;
  onDeleteReply: (replyId: string) => Promise<void>;
  onEditReply: (replyId: string, body: string) => Promise<void>;
  onSignIn: () => void;
  focused?: boolean;
  isMobile: boolean;
}

const MAXLEN = 250;

const textBtn = (color: string = C.ink): React.CSSProperties => ({
  ...meta(10.5, color),
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: RADIUS,
  border: `1px solid ${C.rule}`,
  background: "#FFFFFF",
  padding: "10px 12px",
  fontFamily: SANS,
  fontSize: 13.5,
  lineHeight: 1.5,
  color: C.ink,
  resize: "none",
  outline: "none",
};

export default function ResponseItem({
  resp, helpfulCount, myVote, canVote, onHelpful, user,
  onSubmitReply, onDeleteReply, onEditReply, onSignIn, focused, isMobile,
}: Props) {
  const replies = resp.replies ?? [];
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [menuReplyId, setMenuReplyId] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuReplyId) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuReplyId(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuReplyId]);

  // Opened from a notification about this response: bring it into view and mark
  // it for a moment, so she can see which one it was.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!focused) return;
    wrapRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1800);
    return () => clearTimeout(t);
  }, [focused]);

  const submit = async () => {
    const b = text.trim();
    if (!b || posting) return;
    setPosting(true);
    try {
      await onSubmitReply(resp.id, b.slice(0, MAXLEN));
      setText("");
      setComposerOpen(false);
    } catch (e) { console.error("reply failed:", e); }
    setPosting(false);
  };

  const saveEdit = async (replyId: string) => {
    const b = editText.trim();
    if (!b || savingEdit) return;
    setSavingEdit(true);
    try { await onEditReply(replyId, b.slice(0, MAXLEN)); setEditingReplyId(null); }
    catch (e) { console.error("edit reply failed:", e); }
    setSavingEdit(false);
  };

  const facts = [experienceLabel(resp.personal_experience)].filter(Boolean) as string[];

  return (
    <div
      ref={wrapRef}
      style={{
        // Top and bottom only: the highlight animates paddingLeft, and React
        // warns when a shorthand and one of its longhands change together.
        paddingTop: isMobile ? 20 : 24,
        paddingBottom: isMobile ? 20 : 24,
        borderBottom: `1px solid ${C.rule}`,
        boxShadow: flash ? `inset 3px 0 0 ${C.burgundy}` : "inset 0 0 0 transparent",
        paddingLeft: flash ? 14 : 0,
        transition: "box-shadow .4s ease, padding-left .4s ease",
      }}
    >
      <div style={{ display: "flex", gap: isMobile ? 12 : 16 }}>
        <Avatar url={resp.profiles?.avatar_url ?? null} name={resp.profiles?.display_name ?? null} tier={resp.profiles?.badge_tier} size={isMobile ? 36 : 42} userId={resp.user_id} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 6, minWidth: 0 }}>
              <PersonName userId={resp.user_id} name={resp.profiles?.display_name} />
              {resp.match_score != null && <MatchSeal score={resp.match_score} size={isMobile ? 28 : 30} />}
              {facts.map((f) => <span key={f} style={meta(10, C.muted)}>{f}</span>)}
              <span style={{ ...meta(10, C.ink), fontWeight: 700 }}>{recommendationLabel(resp.recommendation)}</span>
            </div>
            <span style={{ ...body(12, C.muted), whiteSpace: "nowrap", flexShrink: 0 }}>{timeAgo(resp.created_at)}</span>
          </div>

          <p style={{ ...body(isMobile ? 14 : 15, C.ink), marginTop: 10 }}>{resp.reasoning}</p>

          {(resp.product_url || resp.photo_url) && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              {resp.photo_url && (
                <img
                  src={resp.photo_url}
                  alt="Her photo"
                  onClick={() => window.open(resp.photo_url!, "_blank")}
                  style={{ height: 132, width: 104, objectFit: "cover", objectPosition: "top", borderRadius: RADIUS, cursor: "zoom-in", display: "block" }}
                />
              )}
              {resp.product_url && (
                <a href={resp.product_url} target="_blank" rel="noopener noreferrer" style={{ ...textBtn(C.ink), textDecoration: "none" }}>
                  <ExternalLink style={{ width: 12, height: 12 }} /> {prettyHost(resp.product_url)}
                </a>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 14 }}>
            <button
              onClick={() => canVote && onHelpful(resp.id)}
              disabled={!canVote}
              style={{ ...textBtn(myVote === "helpful" ? C.burgundy : C.ink), cursor: canVote ? "pointer" : "default", opacity: canVote || helpfulCount > 0 ? 1 : 0.5 }}
            >
              {myVote === "helpful" ? <Check style={{ width: 13, height: 13 }} /> : <ThumbsUp style={{ width: 13, height: 13 }} strokeWidth={1.75} />}
              Helpful{helpfulCount > 0 ? ` (${helpfulCount})` : ""}
            </button>
            <button onClick={() => (user ? setComposerOpen(true) : onSignIn())} style={textBtn(C.ink)}>Reply</button>
          </div>

          {/* Replies: one level, quieter than the take they answer. */}
          {replies.length > 0 && (
            <div style={{ marginTop: 16, paddingLeft: 16, borderLeft: `1px solid ${C.rule}`, display: "flex", flexDirection: "column", gap: 14 }}>
              {replies.map((rp) => {
                const isMine = !!user && rp.user_id === user.id;
                const editing = editingReplyId === rp.id;
                return (
                  <div key={rp.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <Avatar url={rp.profiles?.avatar_url ?? null} name={rp.profiles?.display_name ?? null} tier={rp.profiles?.badge_tier} size={26} userId={rp.user_id} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                        <span style={{ ...strong(11.5), textTransform: "uppercase", letterSpacing: "0.05em" }}>{formatName(rp.profiles?.display_name)}</span>
                        <span style={body(11.5, C.muted)}>{timeAgo(rp.created_at)}</span>
                      </div>
                      {editing ? (
                        <div style={{ marginTop: 6 }}>
                          <textarea autoFocus rows={2} maxLength={MAXLEN} value={editText} onChange={(e) => setEditText(e.target.value)} style={field} />
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 18, marginTop: 8 }}>
                            <button onClick={() => setEditingReplyId(null)} style={textBtn(C.muted)}>Cancel</button>
                            <button onClick={() => saveEdit(rp.id)} disabled={!editText.trim() || savingEdit} style={textBtn(C.burgundy)}>{savingEdit ? "Saving..." : "Save"}</button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ ...body(13.5, C.inkSoft), marginTop: 3 }}>{rp.body}</p>
                      )}
                    </div>
                    {isMine && !editing && (
                      <div style={{ position: "relative", flexShrink: 0 }} ref={menuReplyId === rp.id ? menuRef : undefined}>
                        <button onClick={() => setMenuReplyId(menuReplyId === rp.id ? null : rp.id)} aria-label="Reply options" style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: C.muted, lineHeight: 0 }}>
                          <MoreHorizontal style={{ width: 15, height: 15 }} />
                        </button>
                        {menuReplyId === rp.id && (
                          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: RADIUS, minWidth: 120, zIndex: 5 }}>
                            <button onClick={() => { setEditingReplyId(rp.id); setEditText(rp.body); setMenuReplyId(null); }} style={{ ...textBtn(C.ink), width: "100%", padding: "10px 14px" }}>Edit</button>
                            <button onClick={() => { setMenuReplyId(null); if (confirm("Delete this reply?")) onDeleteReply(rp.id); }} style={{ ...textBtn(C.burgundy), width: "100%", padding: "10px 14px", borderTop: `1px solid ${C.rule}` }}>Delete</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {composerOpen && (
            <div style={{ marginTop: 14, paddingLeft: 16, borderLeft: `1px solid ${C.burgundy}` }}>
              <textarea autoFocus rows={2} maxLength={MAXLEN} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a follow-up..." style={field} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <span style={body(11, C.muted)}>{text.length}/{MAXLEN}</span>
                <div style={{ display: "flex", gap: 18 }}>
                  <button onClick={() => { setComposerOpen(false); setText(""); }} style={textBtn(C.muted)}>Cancel</button>
                  <button onClick={submit} disabled={!text.trim() || posting} style={textBtn(text.trim() ? C.burgundy : C.faint)}>{posting ? "Posting..." : "Post"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
