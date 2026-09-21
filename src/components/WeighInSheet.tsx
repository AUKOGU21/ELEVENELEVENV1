// ── WeighInSheet ──────────────────────────────────────────────────────────────
// The weigh-in flow, lifted out of Feed so a shared decision opened from a
// message uses the same one. Same steps, same questions, same order: context,
// verdict, take.
//
// A guest answers all of it before being asked who she is. That order is the
// point: she contributes first, and identity is the last thing between her and
// the poster seeing it. Never a reduced form for outsiders.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Camera, ExternalLink, X } from "lucide-react";
import { C, SANS, body, display, meta, strong } from "@/lib/design";
import { normalizeProductUrl } from "@/lib/url";

/** Her relationship with the item or brand. The existing production vocabulary. */
export const CONTEXT_OPTIONS = [
  "I own this exact item",
  "I've bought from this brand before",
  "I haven't bought, but I'm familiar with the brand",
  "No experience with this brand",
];

export type WeighInPayload = {
  context: string | null;
  vote: "buy" | "do_not_buy" | "need_more_info";
  take: string;
  link: string | null;
  photo: File | null;
  /** Guest mode only. */
  firstName?: string;
  lastInitial?: string;
};

type Step = "context" | "vote" | "take" | "who";

export default function WeighInSheet({
  open, isMobile, decisionId, decision, mode, submitting, error, submitted, doneSlot,
  onCancel, onDismiss, onSubmit, onSignIn, resetKey = 0,
}: {
  open: boolean;
  isMobile: boolean;
  /** Which decision the draft belongs to. Changing it starts a new draft. */
  decisionId: string | null;
  /** Bumping this discards the draft, for a parent that closes the flow itself. */
  resetKey?: number;
  decision: { brand_name?: string | null; product_name?: string | null; uncertainty_text?: string | null } | null;
  mode: "member" | "guest";
  submitting: boolean;
  error?: string | null;
  /** Parent flips this once the response is safely stored. */
  submitted: boolean;
  /** What to show afterwards: a member sees a close, a guest is asked to join. */
  doneSlot: React.ReactNode;
  onCancel: () => void;
  onDismiss: () => void;
  onSubmit: (payload: WeighInPayload) => void;
  /** Offered to a guest who turns out to already have an account. */
  onSignIn?: () => void;
}) {
  const [step, setStep] = useState<Step>("context");
  const [context, setContext] = useState<string | null>(null);
  const [vote, setVote] = useState<"buy" | "do_not_buy" | "need_more_info" | null>(null);
  const [take, setTake] = useState("");
  const [link, setLink] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);

  // The draft survives being dismissed: tapping the scrim hides the sheet and
  // reopening the same decision picks up where she left off. It is only thrown
  // away for a different decision, or when the parent says so.
  useEffect(() => {
    setStep("context");
    setContext(null); setVote(null); setTake(""); setLink("");
    setPhoto(null); setPreview(null); setFirstName(""); setLastInitial("");
  }, [decisionId, resetKey]);

  // Deliberately not `if (!open) return null`: this component stays mounted so a
  // dismissed draft is still here when she comes back. The exit animation lives
  // inside instead, which is why the sheet owns its own AnimatePresence.
  const stepN = step === "context" ? 1 : step === "vote" ? 2 : 3;
  const heading = (t: string) => <h3 style={display(isMobile ? 30 : 38)}>{t}</h3>;
  const sub = (t: string) => <p style={{ ...body(15, C.inkSoft), marginTop: 8, marginBottom: 20 }}>{t}</p>;
  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", borderRadius: 2, border: `1px solid ${C.rule}`,
    background: "#FFFFFF", fontFamily: SANS, color: C.ink, outline: "none",
  };
  const primary = (enabled: boolean): React.CSSProperties => ({
    width: "100%", ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em",
    padding: "17px 0", borderRadius: 2, border: `1px solid ${C.burgundy}`, background: C.burgundy,
    cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.4,
  });

  const send = () => onSubmit({
    context, vote: vote as WeighInPayload["vote"], take: take.trim(),
    link: normalizeProductUrl(link), photo,
    ...(mode === "guest" ? { firstName: firstName.trim(), lastInitial: lastInitial.trim() } : {}),
  });

  const asks = (decision?.uncertainty_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <AnimatePresence>
      {open && (
      <>
      {/* Tapping outside hides the sheet and keeps the draft. */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80]" style={{ background: C.scrim }} onClick={onDismiss}
      />
      <motion.div
        initial={{ y: 360 }} animate={{ y: 0 }} exit={{ y: 360 }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="fixed bottom-0 left-0 right-0"
        style={{
          zIndex: 81, margin: "0 auto", width: "100%", maxWidth: 680, maxHeight: "90vh",
          overflowY: "auto", boxSizing: "border-box", background: C.paper,
          borderRadius: "2px 2px 0 0", borderTop: `1px solid ${C.rule}`,
          padding: isMobile ? "20px 18px 32px" : "28px 36px 40px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <p style={{ ...meta(11, C.burgundy), fontWeight: 700 }}>Weigh in</p>
          {!submitted && (
            <button
              // Explicit Cancel discards the draft, so ask when there's writing in it.
              onClick={() => { if (take.trim() && !confirm("Discard your draft?")) return; onCancel(); }}
              style={{ ...meta(11, C.muted), fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              Cancel
            </button>
          )}
        </div>

        {!submitted && (
          <div style={{ display: "flex", gap: 4, marginBottom: 24 }} aria-hidden>
            {[1, 2, 3].map((i) => <span key={i} style={{ flex: 1, height: 2, background: i <= stepN ? C.burgundy : C.rule }} />)}
          </div>
        )}

        {/* What she's asking, pinned so you can answer it while you write */}
        {!submitted && (step === "vote" || step === "take" || step === "who") && decision &&
          (asks.length > 0 || decision.brand_name || decision.product_name) && (
          <div style={{ paddingBottom: 18, marginBottom: 22, borderBottom: `1px solid ${C.rule}` }}>
            <p style={{ ...meta(10, C.muted), marginBottom: 8 }}>They're deciding about</p>
            {(decision.brand_name || decision.product_name) && (
              <p style={{ ...strong(13), textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {[decision.brand_name, decision.product_name].filter(Boolean).join(" · ")}
              </p>
            )}
            {asks.length > 0 && <p style={{ ...meta(10.5, C.ink), marginTop: 8, lineHeight: 1.7 }}>{asks.join("  /  ")}</p>}
          </div>
        )}

        {submitted ? doneSlot : (
          <>
            {step === "context" && (
              <div>
                {heading("Your context")}
                {sub("What's your relationship with this item or brand?")}
                <div style={{ borderTop: `1px solid ${C.rule}` }}>
                  {CONTEXT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setContext(opt); setStep("vote"); }}
                      style={{ ...body(15.5, C.ink), width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${C.rule}`, padding: "17px 2px", cursor: "pointer" }}
                    >
                      {opt}
                      <ArrowRight style={{ width: 16, height: 16, flexShrink: 0, color: C.muted }} strokeWidth={1.5} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === "vote" && (
              <div>
                {heading("Your verdict")}
                {sub("Would you buy this?")}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {(["buy", "do_not_buy", "need_more_info"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => { setVote(v); setStep("take"); }}
                      style={{ ...meta(12, vote === v ? "#FFFFFF" : C.ink), fontWeight: 700, letterSpacing: "0.16em", padding: "18px 0", borderRadius: 2, cursor: "pointer", background: vote === v ? C.ink : "transparent", border: `1px solid ${C.ink}` }}
                    >
                      {v === "buy" ? "Yes" : v === "do_not_buy" ? "No" : "Depends"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === "take" && (
              <div>
                {heading("Your take")}
                {sub("be the friend who tells her the truth.")}
                <textarea
                  value={take} onChange={(e) => setTake(e.target.value)}
                  placeholder="no bs…" rows={4}
                  style={{ ...field, padding: "13px 14px", fontSize: 15, lineHeight: 1.5, resize: "none" }}
                />
                <div style={{ position: "relative", marginTop: 10 }}>
                  <ExternalLink style={{ width: 14, height: 14, color: C.muted, position: "absolute", left: 13, top: 14, pointerEvents: "none" }} />
                  <input
                    value={link} onChange={(e) => setLink(e.target.value)}
                    placeholder="Link a product (optional)" type="url" inputMode="url"
                    autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    style={{ ...field, padding: "11px 14px 11px 36px", fontSize: 14 }}
                  />
                  {link.trim().length > 0 && !normalizeProductUrl(link) && (
                    <p style={{ ...body(12.5, C.burgundy), marginTop: 6 }}>That doesn't look like a valid link.</p>
                  )}
                </div>

                <div style={{ marginTop: 14, marginBottom: 20 }}>
                  <input ref={photoInput} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setPhoto(file);
                      const reader = new FileReader();
                      reader.onload = () => setPreview(reader.result as string);
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }} />
                  {preview ? (
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <img src={preview} alt="attachment" style={{ height: 96, width: 76, objectFit: "cover", borderRadius: 2, display: "block" }} />
                      <button
                        onClick={() => { setPhoto(null); setPreview(null); }} aria-label="Remove photo"
                        style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 2, background: C.ink, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <X style={{ width: 11, height: 11, color: "#FFFFFF" }} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => photoInput.current?.click()}
                      style={{ ...meta(11, C.ink), fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <Camera style={{ width: 14, height: 14 }} strokeWidth={1.75} /> Add a photo
                    </button>
                  )}
                </div>

                <button
                  onClick={() => (mode === "guest" ? setStep("who") : send())}
                  disabled={take.trim().length === 0 || submitting}
                  style={primary(take.trim().length > 0 && !submitting)}
                >
                  {submitting ? "Submitting..." : mode === "guest" ? "Continue" : "Submit"}
                </button>
              </div>
            )}

            {step === "who" && (
              <div>
                {heading("Who's weighing in?")}
                {sub("Your response will appear on her decision.")}
                <label style={{ ...meta(10.5, C.ink), fontWeight: 700, display: "block", marginBottom: 8 }}>First name</label>
                <input
                  value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Rachel" autoComplete="given-name" maxLength={40}
                  style={{ ...field, padding: "13px 14px", fontSize: 16 }}
                />
                <label style={{ ...meta(10.5, C.ink), fontWeight: 700, display: "block", margin: "16px 0 8px" }}>
                  Last initial
                </label>
                <input
                  value={lastInitial} onChange={(e) => setLastInitial(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 1))}
                  placeholder="M" maxLength={1}
                  style={{ ...field, padding: "13px 14px", fontSize: 16, width: 90 }}
                />
                {error && <p style={{ ...body(13, C.burgundy), marginTop: 14 }}>{error}</p>}
                {/* A member opening this from a message has no session in that
                    browser, and would otherwise answer as a guest beside her own
                    account. This is the way back to herself. */}
                {onSignIn && (
                  <p style={{ ...body(13.5, C.muted), marginTop: 16 }}>
                    Already on ElevenEleven?{" "}
                    <button onClick={onSignIn} style={{ ...body(13.5, C.ink), fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
                      Sign in
                    </button>
                  </p>
                )}
                <button
                  onClick={send}
                  disabled={firstName.trim().length === 0 || lastInitial.trim().length === 0 || submitting}
                  style={{ ...primary(firstName.trim().length > 0 && lastInitial.trim().length > 0 && !submitting), marginTop: 22 }}
                >
                  {submitting ? "Submitting..." : "Submit response"}
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
      </>
      )}
    </AnimatePresence>
  );
}
