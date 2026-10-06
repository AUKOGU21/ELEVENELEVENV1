// ── AskMeAboutPrompt ──────────────────────────────────────────────────────────
// "Tell us what you're good at." Asks a returning member to fill in Ask me about,
// right there in the dialog, so she never has to go find it in Edit profile.
//
// Who sees it: signed in, Ask me about still empty, and not on her first day
// (onboarding has asked enough). It waits for the feed to settle and stands
// down if another dialog (the invite, notifications) is already up.
// "Maybe later" snoozes it for a week; after three of those it stops asking.
// Once she saves anything, her profile has it and it never shows again.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/track";
import { C, RADIUS, SANS, body, display, meta } from "@/lib/design";
import AskAboutEditor, { ASK_MAX, useAskPool } from "./AskAboutEditor";

const SNOOZE_DAYS = 7;
const MAX_DISMISSALS = 3;
const MIN_ACCOUNT_AGE_MS = 24 * 3600 * 1000;
const DELAY_MS = 3500;

/** `hold`: another prompt on the page is open (the fit modal doesn't announce itself as a dialog). */
export default function AskMeAboutPrompt({ userId, hold = false }: { userId: string; hold?: boolean }) {
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const key = `ee_ask_prompt_${userId}`;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const pool = useAskPool(open);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const s = JSON.parse(localStorage.getItem(key) ?? "{}");
      if ((s.dismissals ?? 0) >= MAX_DISMISSALS) return;
      if (s.until && s.until > Date.now()) return;
    } catch { /* private mode: fall through */ }

    (async () => {
      const { data } = await supabase.from("profiles").select("ask_me_about, created_at").eq("id", userId).maybeSingle();
      if (cancelled || !data) return;
      if (Array.isArray(data.ask_me_about) && data.ask_me_about.length) return;
      const age = Date.now() - new Date(data.created_at).getTime();
      if (!(age >= MIN_ACCOUNT_AGE_MS)) return;
      timer = setTimeout(() => {
        // Never on top of another dialog. She'll get it on a later visit.
        if (holdRef.current || document.querySelector('[role="dialog"]')) return;
        setOpen(true);
        track("ask_prompt_shown", { userId });
      }, DELAY_MS);
    })();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [key, userId]);

  const later = () => {
    setOpen(false);
    try {
      const s = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(key, JSON.stringify({ dismissals: (s.dismissals ?? 0) + 1, until: Date.now() + SNOOZE_DAYS * 86400000 }));
    } catch { /* private mode */ }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) later(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  const save = async () => {
    if (!value.length || saving) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ ask_me_about: value.slice(0, ASK_MAX) }).eq("id", userId);
    setSaving(false);
    if (error) { alert("Could not save: " + error.message); return; }
    track("ask_prompt_saved", { userId, meta: { count: value.length } });
    setSaved(true);
    setTimeout(() => setOpen(false), 1400);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => !saving && later()}
          style={{ position: "fixed", inset: 0, zIndex: 340, background: C.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, boxSizing: "border-box" }}>
          <motion.div key="card" onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="e11-ask-title"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
            style={{
              position: "relative", width: "min(440px, 100%)", minHeight: "min(660px, 90vh)", maxHeight: "92vh",
              overflowY: "auto", boxSizing: "border-box", borderRadius: RADIUS,
              // The photograph, washed back all over so it reads as a backdrop,
              // and the lower half carried into the paper for the words and field.
              background: "linear-gradient(rgba(247,244,239,0.30), rgba(247,244,239,0.30)), #EDECEA url(/prompts/ask-expert.jpg) center 18% / cover no-repeat",
              boxShadow: "0 30px 70px rgba(20,18,16,0.35)",
              display: "flex", flexDirection: "column", fontFamily: SANS,
            }}>
            <button onClick={later} aria-label="Close" className="e11-close"
              style={{ position: "absolute", top: 12, right: 12, zIndex: 2, background: "none", border: "none", padding: 6, cursor: "pointer", color: C.ink, lineHeight: 0 }}>
              <X style={{ width: 22, height: 22 }} strokeWidth={1.5} />
            </button>

            <p style={{ textAlign: "center", fontFamily: SANS, textTransform: "uppercase", letterSpacing: "0.32em", fontSize: 11, color: C.ink, margin: 0, padding: "36px 30px 0" }}>
              <span style={{ fontWeight: 700 }}>ELEVEN</span><span style={{ fontWeight: 300 }}>ELEVEN</span>
            </p>

            <div style={{
              marginTop: "auto", padding: "120px 26px 22px", textAlign: "center",
              background: "linear-gradient(to top, rgba(247,244,239,0.98) 62%, rgba(247,244,239,0.85) 80%, rgba(247,244,239,0))",
            }}>
              <h2 id="e11-ask-title" style={{ ...display("clamp(40px, 11vw, 54px)"), lineHeight: 0.92 }}>
                Tell us what you're good at.
              </h2>
              <p style={{ ...body(15, C.inkSoft), margin: "14px auto 0", maxWidth: "32ch" }}>
                We heard you're an expert. Tell us your categories so the women who need you know to ask.
              </p>

              {saved ? (
                <p style={{ ...meta(12, C.ink), fontWeight: 700, marginTop: 30, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Check style={{ width: 16, height: 16 }} strokeWidth={2} /> On your profile
                </p>
              ) : (
                <>
                  <div style={{ marginTop: 24, textAlign: "left" }}>
                    <AskAboutEditor bare placeholder="e.g. Vintage" value={value} onChange={setValue} pool={pool} />
                  </div>
                  <button onClick={save} disabled={!value.length || saving} style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    background: C.burgundy, border: "none", borderRadius: RADIUS, padding: "17px 0",
                    cursor: value.length && !saving ? "pointer" : "default", opacity: value.length ? 1 : 0.45,
                    ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em", marginTop: 16,
                  }}>
                    {saving ? "Saving..." : "Add to my profile"}
                  </button>
                  <button onClick={later} style={{ ...meta(11, C.muted), fontWeight: 700, marginTop: 16, background: "none", border: "none", padding: 4, cursor: "pointer" }}>
                    Maybe later
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
