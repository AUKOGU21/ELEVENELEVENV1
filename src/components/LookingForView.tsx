// ── LookingForView ────────────────────────────────────────────────────────────
// A Looking For post, opened. Where a decision asks "should I buy this?", this
// one asks "what should I buy?", so the page is the ask on one side and the picks
// women sent on the other. When she finds it, what she bought becomes the next
// chapter, credited to the woman whose pick got her there.
//
// It renders inside the decision view, whose bar (who, follow, menu, close)
// stays, so this only draws the body.
import { useRef, useState } from "react";
import { ArrowRight, Check, ExternalLink, ThumbsUp } from "lucide-react";
import { C, RADIUS, SANS, STATE_WORD, body, display, meta, strong } from "@/lib/design";
import { formatBudget, formatName, prettyHost, recommendationLabel, timeAgo } from "@/lib/format";
import { pullProduct, type PulledProduct } from "@/lib/productPull";
import { Avatar, isResolved } from "./DecisionTile";
import MatchSeal from "./MatchSeal";
import type { RecommendationData } from "./RecommendationCard";
import type { LookingForDecision, LookingForFoundPayload } from "./LookingForCard";

type FoundStep = "idle" | "pick" | "same_or_diff" | "link" | "why" | "confidence" | "thanks" | "snoozed";
type FuStage = "gate" | "returned" | "detail" | "keep" | "recommend" | "take";

interface Props {
  decision: LookingForDecision;
  user: { id: string } | null;
  isMobile: boolean;
  voteCounts: Record<string, { helpful: number; not_helpful: number }>;
  userVotes: Record<string, "helpful" | "not_helpful">;
  onRecHelpful: (recId: string) => void;
  onAddRecommendation: () => void;
  onSignIn: () => void;
  onFound: (id: string, payload: LookingForFoundPayload) => void;
  onProductPulled: (id: string, pulled: PulledProduct) => void;
  onStillLooking: (id: string) => void;
  updateOutcome: (id: string, patch: Record<string, any>) => void;
  submitReceived: (id: string, data: { primary: string; detailAnswer: string | null; kept: boolean | null; recommend: boolean | null; confidence: number | null; photoFile: File | null; take: string | null }) => void;
  submitReturned: (id: string, data: { note: string | null; photoFile: File | null }) => void;
  /** The decision view's follow-up prompt. Once she's closed it, it takes the recommend button's place. */
  followUp?: React.ReactNode;
}

// ── Small parts ───────────────────────────────────────────────────────────────

const money = (p: string | null | undefined) => (p ? (p.trim().startsWith("$") ? p.trim() : `$${p.trim()}`) : null);
// "Maya C.'s rec" reads badly: possessives use the first name only.
const firstNameOf = (n: string | null | undefined) => (n || "").trim().split(/\s+/)[0] || "She";

const squareBtn = (filled: boolean, colour: string = C.ink): React.CSSProperties => ({
  ...meta(12, filled ? "#FFFFFF" : colour),
  fontWeight: 700,
  letterSpacing: "0.16em",
  background: filled ? colour : "transparent",
  border: `1px solid ${colour}`,
  borderRadius: RADIUS,
  padding: "15px 18px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
});

const textLink = (colour: string = C.ink): React.CSSProperties => ({
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

const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: RADIUS,
  border: `1px solid ${C.rule}`,
  background: "#FFFFFF",
  padding: "12px 14px",
  fontFamily: SANS,
  fontSize: 14.5,
  lineHeight: 1.5,
  color: C.ink,
  outline: "none",
  resize: "none",
};

function Ticks({ value }: { value: number }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }} aria-hidden>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{ width: 4, height: 22, background: i < value ? C.burgundy : "rgba(20,18,16,0.12)" }} />
      ))}
    </div>
  );
}

function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "baseline", padding: "14px 0", borderBottom: `1px solid ${C.rule}` }}>
      <span style={meta(10.5, C.muted)}>{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** One pick, with the woman who sent it and why. No card around it. */
function RecItem({ rec, helpfulCount, myVote, canVote, onHelpful, isWinner, isMobile, innerRef }: {
  rec: RecommendationData;
  helpfulCount: number;
  myVote: "helpful" | "not_helpful" | undefined;
  canVote: boolean;
  onHelpful: (id: string) => void;
  isWinner: boolean;
  isMobile: boolean;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  const price = money(rec.price_note);
  return (
    <div ref={innerRef} style={{ paddingTop: isMobile ? 20 : 24, paddingBottom: isMobile ? 20 : 24, borderBottom: `1px solid ${C.rule}`, scrollMarginTop: 96 }}>
      <div style={{ display: "flex", gap: isMobile ? 12 : 16 }}>
        <Avatar url={rec.profiles?.avatar_url ?? null} name={rec.profiles?.display_name ?? null} tier={rec.profiles?.badge_tier} size={isMobile ? 36 : 42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 6, minWidth: 0 }}>
              <span style={{ ...strong(12.5), textTransform: "uppercase", letterSpacing: "0.05em" }}>{formatName(rec.profiles?.display_name)}</span>
              {rec.match_score != null && <MatchSeal score={rec.match_score} size={isMobile ? 28 : 30} />}
              <span style={{ ...meta(10, C.ink), fontWeight: 700 }}>{recommendationLabel(rec.recommendation)}</span>
              {isWinner && <span style={{ ...meta(10, C.burgundy), fontWeight: 700 }}>She bought this</span>}
            </div>
            <span style={{ ...body(12, C.muted), whiteSpace: "nowrap", flexShrink: 0 }}>{timeAgo(rec.created_at)}</span>
          </div>

          <p style={{ ...body(isMobile ? 14 : 15, C.ink), marginTop: 10 }}>{rec.reasoning}</p>

          {(rec.product_url || rec.brand_name || rec.product_name) && (
            <a
              href={rec.product_url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 14, alignItems: "center", marginTop: 14, textDecoration: "none", color: "inherit", maxWidth: 460 }}
            >
              <div style={{ background: C.well, aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {rec.product_image_url
                  ? <img src={rec.product_image_url} alt="" loading="lazy" style={{ maxWidth: "88%", maxHeight: "88%", objectFit: "contain", mixBlendMode: "multiply" }} />
                  : <span style={meta(9, C.faint)}>Link</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                {rec.brand_name && <p style={{ ...strong(12.5), textTransform: "uppercase", letterSpacing: "0.04em" }}>{rec.brand_name}</p>}
                {rec.product_name && <p style={{ ...body(12.5, C.inkSoft), textTransform: "uppercase", letterSpacing: "0.03em", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.product_name}</p>}
                <p style={{ ...meta(10, C.ink), marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {price && <span style={{ ...body(13, C.ink), textTransform: "none", letterSpacing: 0, marginRight: 8 }}>{price}</span>}
                  {rec.product_url && <><ExternalLink style={{ width: 11, height: 11 }} /> {prettyHost(rec.product_url)}</>}
                </p>
              </div>
            </a>
          )}

          {(rec.fit_note || rec.who_for) && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {rec.fit_note && <p style={body(13.5, C.inkSoft)}><span style={{ ...meta(10, C.muted), marginRight: 10 }}>Fit</span>{rec.fit_note}</p>}
              {rec.who_for && <p style={body(13.5, C.inkSoft)}><span style={{ ...meta(10, C.muted), marginRight: 10 }}>Best for</span>{rec.who_for}</p>}
            </div>
          )}

          <button
            onClick={() => canVote && onHelpful(rec.id)}
            disabled={!canVote}
            style={{ ...textLink(myVote === "helpful" ? C.burgundy : C.ink), marginTop: 14, cursor: canVote ? "pointer" : "default", opacity: canVote || helpfulCount > 0 ? 1 : 0.5 }}
          >
            {myVote === "helpful" ? <Check style={{ width: 13, height: 13 }} /> : <ThumbsUp style={{ width: 13, height: 13 }} strokeWidth={1.75} />}
            Helpful{helpfulCount > 0 ? ` (${helpfulCount})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── The view ──────────────────────────────────────────────────────────────────

export default function LookingForView({
  decision, user, isMobile, voteCounts, userVotes, onRecHelpful,
  onAddRecommendation, onSignIn, onFound, onProductPulled, onStillLooking,
  updateOutcome, submitReceived, submitReturned, followUp,
}: Props) {
  const isOwn = !!user && user.id === decision.user_id;
  const isClosed = isResolved({ status: decision.status ?? "" });
  const confidence = decision.confidence_score ?? 0;
  const recs = decision.recommendations ?? [];
  const priorities = decision.lf_priorities ?? [];

  const outcome = decision.outcomes?.[0] ?? null;
  // Buying lands a Looking For on "purchased" (the outcome trigger writes it),
  // not "closed". Both mean she found it.
  const isFound = (decision.status === "closed" || decision.status === "purchased") && !!outcome;
  const winnerId = outcome?.chosen_recommendation_id ?? null;
  const winner = winnerId ? recs.find((r) => r.id === winnerId) ?? null : null;
  const confAfter = outcome?.confidence_after ?? null;
  const takeQuotes = [...new Set([outcome?.alt_reason, outcome?.take].filter(Boolean) as string[])];

  const recRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [verdict, setVerdict] = useState<"all" | "buy" | "do_not_buy">("all");
  const counts = {
    buy: recs.filter((r) => r.recommendation === "buy").length,
    do_not_buy: recs.filter((r) => r.recommendation === "do_not_buy").length,
  };
  const sorted = [...recs]
    .filter((r) => verdict === "all" || r.recommendation === verdict)
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
  const helpfulOf = (id: string) => voteCounts[id]?.helpful ?? 0;

  // ── "Did you find it?" ───────────────────────────────────────────────────
  const [step, setStep] = useState<FoundStep>("idle");
  const [picked, setPicked] = useState<RecommendationData | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [pulled, setPulled] = useState<PulledProduct | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullFailed, setPullFailed] = useState(false);
  const pulledUrlRef = useRef<string | null>(null);
  const [differentPiece, setDifferentPiece] = useState(false);
  const [reason, setReason] = useState("");
  const submittedRef = useRef(false);

  // Read the pasted link the same way the Passed flow does. Never blocks her.
  const readLink = async (raw: string): Promise<PulledProduct | null> => {
    const key = raw.trim();
    if (!key) return null;
    if (pulledUrlRef.current === key) return pulled;
    pulledUrlRef.current = key;
    setPulling(true);
    setPullFailed(false);
    const got = await pullProduct(key);
    setPulling(false);
    if (!got) { setPullFailed(true); setPulled(null); return null; }
    setPulled(got);
    // She may have finished before this came back: patch the saved row.
    if (submittedRef.current) onProductPulled(decision.id, got);
    return got;
  };

  const submitFound = (after: number) => {
    submittedRef.current = true;
    const exact = !!picked && !differentPiece;
    onFound(decision.id, {
      chosenRecommendationId: picked?.id ?? null,
      boughtExact: exact,
      productUrl: exact ? picked?.product_url ?? null : (linkUrl.trim() || null),
      productName: exact ? picked?.product_name ?? null : (pulled?.name ?? null),
      productBrand: exact ? picked?.brand_name ?? null : (pulled?.brand ?? null),
      productPrice: exact ? picked?.price_note ?? null : (pulled?.price ?? null),
      productImageUrl: exact ? picked?.product_image_url ?? null : (pulled?.image_url ?? null),
      reason: reason.trim() || null,
      confidenceAfter: after,
    });
    setStep("thanks");
  };

  // ── Received it ──────────────────────────────────────────────────────────
  const [fuStage, setFuStage] = useState<FuStage>("gate");
  const [fuDismiss, setFuDismiss] = useState(false);
  const [fuThanks, setFuThanks] = useState(false);
  const [fuDetail, setFuDetail] = useState<string | null>(null);
  const [fuKept, setFuKept] = useState<boolean | null>(null);
  const [fuRec, setFuRec] = useState<boolean | null>(null);
  const [fuTake, setFuTake] = useState("");
  const [fuNote, setFuNote] = useState("");
  const [fuPhoto, setFuPhoto] = useState<File | null>(null);
  const fuPhotoRef = useRef<HTMLInputElement>(null);

  const q = (t: string) => <p style={{ ...strong(isMobile ? 16 : 17), lineHeight: 1.35, marginBottom: 12 }}>{t}</p>;
  const block = (label: string, inner: React.ReactNode) => (
    <div style={{ padding: "24px 0", borderBottom: `1px solid ${C.rule}` }}>
      <p style={{ ...meta(10.5, C.burgundy), marginBottom: 12 }}>{label}</p>
      {inner}
    </div>
  );

  const findFlow = (() => {
    if (!isOwn || isFound || recs.length === 0) return null;
    if (step === "snoozed") return block("Did you find it?", <p style={body(14.5, C.ink)}>Keep looking. We'll circle back. ✦</p>);
    if (step === "thanks") return block("Did you find it?", (
      <p style={body(14.5, C.ink)}>
        Logged. {picked ? `${firstNameOf(picked.profiles?.display_name)} will hear her rec landed.` : "Thanks for closing the loop."} ✦
      </p>
    ));
    if (step === "idle") return block("Did you find it?", (
      <>
        {q("Did you find it?")}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}>
          <button style={squareBtn(true)} onClick={() => setStep("pick")}>I bought one of these</button>
          <button style={squareBtn(false)} onClick={() => { setPicked(null); setDifferentPiece(false); setStep("link"); }}>I bought something else</button>
          <button style={squareBtn(false, C.muted)} onClick={() => { onStillLooking(decision.id); setStep("snoozed"); }}>Still looking</button>
        </div>
      </>
    ));
    if (step === "pick") return block("Did you find it?", (
      <>
        {q("Which one did you buy?")}
        <p style={{ ...body(13.5, C.muted), marginBottom: 12 }}>{isMobile ? "Tap it below." : "Tap it in the picks."}</p>
        <button style={textLink(C.muted)} onClick={() => setStep("idle")}>← Back</button>
      </>
    ));
    if (step === "same_or_diff" && picked) {
      const brand = picked.brand_name || "them";
      const who = firstNameOf(picked.profiles?.display_name);
      return block("Did you find it?", (
        <>
          {q(`Same one, or a different piece from ${brand}?`)}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            <button style={squareBtn(true)} onClick={() => { setDifferentPiece(false); setStep("why"); }}>The exact one {who} recommended</button>
            <button style={squareBtn(false)} onClick={() => { setDifferentPiece(true); setStep("link"); }}>A different piece from {brand}</button>
          </div>
          <button style={{ ...textLink(C.muted), marginTop: 14 }} onClick={() => setStep("pick")}>← Back</button>
        </>
      ));
    }
    const whyFields = (
      <>
        <p style={{ ...strong(14), marginTop: 18 }}>Why this one?</p>
        <p style={{ ...body(12.5, C.muted), marginTop: 3 }}>Optional, and the part women like you will actually read.</p>
        <textarea
          rows={3}
          placeholder="e.g. tried a few of these, the cut on this one was the only one that didn't gape"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ ...fieldStyle, marginTop: 10 }}
        />
      </>
    );
    if (step === "link") return block("Did you find it?", (
      <>
        {q(picked?.brand_name ? `Which ${picked.brand_name} piece did you get?` : "What did you buy?")}
        <input
          type="url"
          inputMode="url"
          autoCapitalize="none"
          placeholder="Paste the link to what you bought"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onBlur={(e) => readLink(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t) setTimeout(() => readLink(t), 0); }}
          style={fieldStyle}
        />
        {pulling && <p style={{ ...body(12.5, C.muted), marginTop: 8 }}>Reading that link...</p>}
        {!pulling && pulled && (
          <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "center", marginTop: 12 }}>
            <div style={{ background: C.well, aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {pulled.image_url && <img src={pulled.image_url} alt="" style={{ maxWidth: "88%", maxHeight: "88%", objectFit: "contain", mixBlendMode: "multiply" }} />}
            </div>
            <div style={{ minWidth: 0 }}>
              {pulled.brand && <p style={{ ...strong(13), textTransform: "uppercase", letterSpacing: "0.04em" }}>{pulled.brand}</p>}
              {pulled.name && <p style={{ ...body(12.5, C.inkSoft), marginTop: 2 }}>{pulled.name}</p>}
              {pulled.price && <p style={{ ...body(13, C.ink), marginTop: 4 }}>{money(pulled.price)}</p>}
            </div>
          </div>
        )}
        {!pulling && pullFailed && (
          <p style={{ ...body(12.5, C.muted), marginTop: 8 }}>Couldn't read that link, so there won't be an image. Your link still saves.</p>
        )}
        {whyFields}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
          <button
            style={{ ...squareBtn(true, C.burgundy), opacity: linkUrl.trim() ? 1 : 0.4, cursor: linkUrl.trim() ? "pointer" : "default" }}
            disabled={!linkUrl.trim()}
            onClick={() => { if (!pulled && !pulling) void readLink(linkUrl); setStep("confidence"); }}
          >
            Continue <ArrowRight style={{ width: 15, height: 15 }} />
          </button>
          <button style={textLink(C.muted)} onClick={() => setStep(picked ? "same_or_diff" : "idle")}>← Back</button>
        </div>
      </>
    ));
    if (step === "why") return block("Did you find it?", (
      <>
        {q("Why this one?")}
        <p style={{ ...body(12.5, C.muted), marginBottom: 10 }}>Optional, and the part women like you will actually read.</p>
        <textarea
          rows={3}
          placeholder="e.g. tried a few of these, the cut on this one was the only one that didn't gape"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={fieldStyle}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14 }}>
          <button style={squareBtn(true, C.burgundy)} onClick={() => setStep("confidence")}>Continue <ArrowRight style={{ width: 15, height: 15 }} /></button>
          <button style={textLink(C.muted)} onClick={() => setStep("same_or_diff")}>← Back</button>
        </div>
      </>
    ));
    if (step === "confidence") return block("Did you find it?", (
      <>
        {q("Now that you've heard from everyone, how confident do you feel about your decision?")}
        <p style={{ ...body(13.5, C.muted), marginBottom: 12 }}>You started at {confidence}/10.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4, maxWidth: 520 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <button key={i} onClick={() => submitFound(i + 1)} style={{ ...squareBtn(false), padding: "12px 0" }}>{i + 1}</button>
          ))}
        </div>
        <p style={{ ...body(12, C.muted), marginTop: 8 }}>1 = still unsure, 10 = this is the one</p>
        <button style={{ ...textLink(C.muted), marginTop: 12 }} onClick={() => setStep(picked && !differentPiece ? "why" : "link")}>← Back</button>
      </>
    ));
    return null;
  })();

  const receivedFlow = (() => {
    if (!isOwn || !isFound) return null;
    if (fuThanks) return block("Close the loop", <p style={body(14.5, C.ink)}>Thank you. That's exactly what the next woman needs. ✦</p>);
    const arrival = outcome?.arrival_status;
    if (arrival === "received" || arrival === "returned" || fuDismiss) return null;
    if (arrival === "waiting" && outcome?.next_prompt_at && Date.now() < new Date(outcome.next_prompt_at).getTime()) return null;
    const itemName = [outcome?.alt_brand_name, outcome?.alt_product_name].filter(Boolean).join(" ").trim() || "what you bought";
    const photoBtn = (
      <>
        <input ref={fuPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFuPhoto(e.target.files?.[0] ?? null)} />
        <button onClick={() => fuPhotoRef.current?.click()} style={{ ...textLink(C.ink), marginTop: 12 }}>{fuPhoto ? "Photo added. Change" : "+ Add a photo"}</button>
      </>
    );
    if (fuStage === "gate") return block("Close the loop", (
      <>
        {q(`Ready to tell us how the ${itemName} went?`)}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}>
          <button style={squareBtn(false)} onClick={() => { updateOutcome(decision.id, { arrival_status: "waiting", next_prompt_at: new Date(Date.now() + 3 * 86400000).toISOString() }); setFuDismiss(true); }}>Still waiting</button>
          <button style={squareBtn(false)} onClick={() => setFuStage("returned")}>Returned / canceled</button>
          <button style={squareBtn(true)} onClick={() => setFuStage("detail")}>Received it</button>
        </div>
      </>
    ));
    if (fuStage === "returned") return block("Close the loop", (
      <>
        {q("What went wrong? (optional)")}
        <textarea rows={2} value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="e.g. ran huge, fabric felt cheap, changed my mind" style={fieldStyle} />
        {photoBtn}
        <div style={{ marginTop: 14 }}>
          <button style={{ ...squareBtn(true), width: "100%" }} onClick={() => { submitReturned(decision.id, { note: fuNote.trim() || null, photoFile: fuPhoto }); setFuThanks(true); }}>Done</button>
        </div>
      </>
    ));
    if (fuStage === "detail") return block("Close the loop", (
      <>
        {q("How did it work out?")}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}>
          {["Better than expected", "As expected", "Nothing like I imagined"].map((opt) => (
            <button key={opt} style={squareBtn(false)} onClick={() => { setFuDetail(opt); setFuStage("keep"); }}>{opt}</button>
          ))}
        </div>
      </>
    ));
    if (fuStage === "keep") return block("Close the loop", (
      <>
        {q("Are you keeping it, or returning it?")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={squareBtn(true)} onClick={() => { setFuKept(true); setFuStage("recommend"); }}>Keeping it</button>
          <button style={squareBtn(false)} onClick={() => { setFuKept(false); setFuStage("recommend"); }}>Returning it</button>
        </div>
      </>
    ));
    if (fuStage === "recommend") return block("Close the loop", (
      <>
        {q("Would you recommend it to women like you?")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={squareBtn(true)} onClick={() => { setFuRec(true); setFuStage("take"); }}>Yes</button>
          <button style={squareBtn(false)} onClick={() => { setFuRec(false); setFuStage("take"); }}>No</button>
        </div>
      </>
    ));
    return block("Close the loop", (
      <>
        {q("Anything you'd tell a woman like you?")}
        <p style={{ ...body(12.5, C.muted), marginBottom: 10 }}>Optional. How it really fits, wears, or holds up (e.g. runs big, the band rides up by the afternoon).</p>
        <textarea rows={3} value={fuTake} onChange={(e) => setFuTake(e.target.value)} placeholder="Share what the photos can't show..." style={fieldStyle} />
        {photoBtn}
        <div style={{ marginTop: 14 }}>
          <button
            style={{ ...squareBtn(true), width: "100%" }}
            onClick={() => {
              submitReceived(decision.id, { primary: "Other", detailAnswer: fuDetail, kept: fuKept, recommend: fuRec, confidence: null, photoFile: fuPhoto, take: fuTake.trim() || null });
              setFuThanks(true);
            }}
          >
            Done
          </button>
        </div>
      </>
    ));
  })();

  // ── What she bought: the chapter that finding it adds.
  const foundChapter = isFound && (
    <div style={{ padding: "26px 0 24px", borderBottom: `1px solid ${C.rule}` }}>
      <p style={{ ...meta(11, C.ink), marginBottom: 12 }}>My decision</p>
      <p style={display(isMobile ? 54 : 72)}>{STATE_WORD.found}</p>
      {(outcome?.alt_brand_name || outcome?.alt_product_name || outcome?.alt_product_image_url) && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "104px 1fr" : "140px 1fr", gap: 18, alignItems: "center", marginTop: 20 }}>
          <div style={{ background: C.well, aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {outcome?.alt_product_image_url
              ? <img src={outcome.alt_product_image_url} alt="" style={{ maxWidth: "88%", maxHeight: "88%", objectFit: "contain", mixBlendMode: "multiply" }} />
              : <span style={meta(9, C.faint)}>No image</span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ ...meta(10, C.muted), marginBottom: 6 }}>She bought</p>
            {outcome?.alt_brand_name && <p style={{ ...strong(isMobile ? 15 : 17), textTransform: "uppercase", letterSpacing: "0.04em" }}>{outcome.alt_brand_name}</p>}
            {outcome?.alt_product_name && <p style={{ ...body(13.5, C.inkSoft), textTransform: "uppercase", letterSpacing: "0.03em", marginTop: 3 }}>{outcome.alt_product_name}</p>}
            {outcome?.alt_price_note && <p style={{ ...body(14, C.ink), marginTop: 6 }}>{money(outcome.alt_price_note)}</p>}
            {outcome?.alt_product_url && (
              <a href={outcome.alt_product_url} target="_blank" rel="noopener noreferrer" style={{ ...textLink(C.ink), marginTop: 10 }}>
                <ExternalLink style={{ width: 12, height: 12 }} /> View on {prettyHost(outcome.alt_product_url)}
              </a>
            )}
          </div>
        </div>
      )}
      {takeQuotes.map((t, i) => (
        <p key={i} style={{ ...body(isMobile ? 15 : 16.5, C.ink), marginTop: i === 0 ? 18 : 10, maxWidth: "58ch" }}>&ldquo;{t}&rdquo;</p>
      ))}
      {winner && (
        <p style={{ ...meta(10.5, C.burgundy), fontWeight: 700, marginTop: 16 }}>
          Found through {firstNameOf(winner.profiles?.display_name)}'s rec{outcome?.bought_alternative ? " (different piece, same brand)" : ""}
        </p>
      )}
      {confAfter != null && (
        <div style={{ marginTop: 20 }}>
          <p style={{ ...meta(11, C.ink), marginBottom: 10 }}>Confidence</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <span style={display(isMobile ? 40 : 52, C.muted)}>{confidence}/10</span>
            <ArrowRight style={{ width: 26, height: 26, color: C.ink, alignSelf: "center" }} strokeWidth={1.5} />
            <span style={display(isMobile ? 40 : 52)}>{confAfter}/10</span>
          </div>
        </div>
      )}
    </div>
  );

  const pickTile = (rec: RecommendationData) => {
    const choosing = step === "pick";
    const isWinner = winnerId === rec.id;
    const price = money(rec.price_note);
    return (
      <button
        key={rec.id}
        onClick={() => {
          if (choosing) { setPicked(rec); setStep("same_or_diff"); return; }
          recRefs.current[rec.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        style={{
          display: "block", textAlign: "left", background: "none", cursor: "pointer", minWidth: 0,
          border: `1px solid ${choosing ? C.burgundy : "transparent"}`, padding: choosing ? 8 : 0,
          borderRadius: RADIUS, transition: "border-color .2s",
        }}
      >
        <div style={{ position: "relative", background: C.well, aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {rec.product_image_url
            ? <img src={rec.product_image_url} alt="" loading="lazy" style={{ maxWidth: "86%", maxHeight: "86%", objectFit: "contain", mixBlendMode: "multiply" }} />
            : <span style={meta(9.5, C.faint)}>No image</span>}
          {isWinner && (
            <span style={{ position: "absolute", top: 10, left: 10, ...meta(9.5, "#FFFFFF"), fontWeight: 700, background: C.burgundy, padding: "5px 8px" }}>She bought this</span>
          )}
        </div>
        <p style={{ ...strong(12), textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.brand_name || "Recommended"}</p>
        {rec.product_name && <p style={{ ...body(12, C.inkSoft), textTransform: "uppercase", letterSpacing: "0.03em", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.product_name}</p>}
        {price && <p style={{ ...body(12.5, C.ink), marginTop: 4 }}>{price}</p>}
        <p style={{ ...meta(9.5, C.muted), marginTop: 6 }}>Rec. by {formatName(rec.profiles?.display_name)}</p>
      </button>
    );
  };

  const recommendCta = !isOwn && !isClosed && (
    <div style={{ paddingTop: 22 }}>
      <button onClick={() => (user ? onAddRecommendation() : onSignIn())} style={{ ...squareBtn(true, C.burgundy), width: "100%" }}>
        {user ? "Recommend a product" : "Sign in to recommend"} <ArrowRight style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );

  return (
    <div>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)",
        columnGap: isMobile ? 0 : 48,
        rowGap: 32,
        alignItems: "start",
      }}>
        {/* The ask */}
        <section style={{ minWidth: 0 }}>
          <p style={{ ...meta(11, C.burgundy), marginBottom: 14 }}>Looking for</p>
          <h1 style={{ ...display(isMobile ? 44 : "clamp(44px, 4.4vw, 64px)"), lineHeight: 0.95, overflowWrap: "anywhere" }}>
            {decision.lf_title || "Recommendations"}
          </h1>
          {decision.lf_context && <p style={{ ...body(isMobile ? 15 : 16, C.inkSoft), marginTop: 18, maxWidth: "56ch" }}>{decision.lf_context}</p>}

          <div style={{ marginTop: 22, borderTop: `1px solid ${C.rule}` }}>
            {decision.lf_budget && <SpecRow label="Budget"><span style={body(15, C.ink)}>{formatBudget(decision.lf_budget)}</span></SpecRow>}
            {decision.lf_occasion && <SpecRow label="Occasion"><span style={body(15, C.ink)}>{decision.lf_occasion}</span></SpecRow>}
            {priorities.length > 0 && (
              <SpecRow label="Priorities">
                <span style={{ ...meta(11, C.ink), lineHeight: 1.8 }}>{priorities.join("  /  ")}</span>
              </SpecRow>
            )}
            {!(isFound && confAfter != null) && (
              <SpecRow label="Confidence">
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={display(isMobile ? 34 : 40)}>{confidence}/10</span>
                  <Ticks value={confidence} />
                </div>
              </SpecRow>
            )}
          </div>

          {foundChapter}
          {isClosed ? followUp : recommendCta}
          {findFlow}
          {receivedFlow}
        </section>

        {/* The picks */}
        <section style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 12, borderBottom: `1px solid ${C.rule}`, marginBottom: 18 }}>
            <p style={meta(11, C.ink)}>Recommended{recs.length > 0 ? ` (${recs.length})` : ""}</p>
            {step === "pick" && <p style={{ ...meta(10, C.burgundy), fontWeight: 700 }}>Tap the one you bought</p>}
          </div>
          {recs.length === 0 ? (
            <div style={{ padding: "8px 0 4px" }}>
              <p style={display(isMobile ? 28 : 34, C.faint)}>No recommendations yet.</p>
              <p style={{ ...body(14, C.muted), marginTop: 10 }}>
                {isClosed ? "She closed this before anyone recommended something." : isOwn ? "Your mirrors will start filling this in." : user ? "Be the first to recommend something." : "Sign in to recommend something."}
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: isMobile ? 14 : 22 }}>
              {recs.map(pickTile)}
            </div>
          )}
        </section>
      </div>

      {/* Why each pick was sent */}
      {recs.length > 0 && (
        <section style={{ marginTop: isMobile ? 36 : 52 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${C.rule}` }}>
            <p style={{ ...meta(12, C.ink), fontWeight: 700, paddingBottom: 12, borderBottom: `2px solid ${C.burgundy}`, marginBottom: -1 }}>
              Recommendations ({recs.length})
            </p>
          </div>
          {recs.length > 1 && (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "16px 0 4px" }}>
              {([
                ["all", `All (${recs.length})`],
                ["buy", `Would buy (${counts.buy})`],
                ["do_not_buy", `Wouldn't buy (${counts.do_not_buy})`],
              ] as const).filter(([k]) => k === "all" || counts[k as "buy" | "do_not_buy"] > 0).map(([k, label]) => (
                <button key={k} onClick={() => setVerdict(k)}
                  style={{ ...meta(10.5, verdict === k ? C.ink : C.muted), fontWeight: verdict === k ? 700 : 600, background: "none", border: "none", padding: "0 0 4px", cursor: "pointer", borderBottom: `1px solid ${verdict === k ? C.ink : "transparent"}` }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {sorted.length === 0 && <p style={{ ...body(14, C.muted), padding: "22px 0" }}>None in this filter.</p>}
          {sorted.map((rec) => (
            <RecItem
              key={rec.id}
              rec={rec}
              helpfulCount={helpfulOf(rec.id)}
              myVote={userVotes[rec.id]}
              canVote={!!user && user.id !== rec.user_id}
              onHelpful={onRecHelpful}
              isWinner={winnerId === rec.id}
              isMobile={isMobile}
              innerRef={(el) => { recRefs.current[rec.id] = el; }}
            />
          ))}
          {!isOwn && !isClosed && user && (
            <button onClick={onAddRecommendation} style={{ ...textLink(C.burgundy), marginTop: 20, fontSize: 12 }}>
              + Add a recommendation <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          )}
        </section>
      )}
    </div>
  );
}
