// ── Index ─────────────────────────────────────────────────────────────────────
// The public landing page: the first thing an invited woman sees. Signed in, she
// is sent to the feed instead, so everything here is written for someone who has
// never used it.
//
// Set as a magazine cover rather than a SaaS page, per src/lib/design.ts. The
// hero photograph (a woman beside her own reflections, which is the product's
// whole idea) is left light and the type sits on paper next to it, so nothing
// needs a dark scrim to be legible. Hierarchy comes from Anton, scale and
// hairline rules. No cards, no glass, no shadows, no serifs.
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/lib/supabase";
import { getInitials } from "@/lib/format";
import { C, RADIUS, SANS, body, display, meta, strong } from "@/lib/design";
import logoSymbol from "@/assets/logo-symbol.png";
import heroImage from "@/assets/hero-editorial.png";

const PAGE_CSS = `
.e11-cta { transition: background 0.18s, border-color 0.18s, opacity 0.18s; }
.e11-cta:hover { background: #5E1414; border-color: #5E1414; }
.e11-link { transition: opacity 0.18s; }
.e11-link:hover { opacity: 0.6; }
`;

const MAX = 1320;

const cta = (mobile: boolean): React.CSSProperties => ({
  ...meta(12, "#FFFFFF"),
  fontWeight: 700,
  letterSpacing: "0.16em",
  background: C.burgundy,
  border: `1px solid ${C.burgundy}`,
  borderRadius: RADIUS,
  padding: mobile ? "16px 24px" : "18px 32px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
});

const navLink = (colour: string = C.ink): React.CSSProperties => ({
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

const rise = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
};

/** An eyebrow, a rule, and an oversized Anton headline. Opens every section. */
function SectionHead({ eyebrow, lines, isMobile, onDark = false }: {
  eyebrow: string;
  lines: string[];
  isMobile: boolean;
  onDark?: boolean;
}) {
  const rule = onDark ? "rgba(247,244,239,0.22)" : C.rule;
  return (
    <motion.div {...rise} transition={{ duration: 0.6 }}>
      <p style={meta(11, onDark ? "rgba(247,244,239,0.62)" : C.ink)}>{eyebrow}</p>
      <div style={{ height: 1, background: rule, margin: isMobile ? "16px 0 22px" : "20px 0 30px" }} />
      <h2 style={display(isMobile ? 34 : "clamp(42px, 5.6vw, 78px)", onDark ? C.paper : C.ink)}>
        {lines.map((l, i) => (
          <span key={i} style={{ display: "block" }}>{l}</span>
        ))}
      </h2>
    </motion.div>
  );
}

/** One item in a section: a number, a short Anton title, and what it means.
 *  Separated from its neighbours by a rule, never boxed. */
function Item({ n, title, lead, note, isMobile, index }: {
  n: string;
  title: string;
  lead: string;
  note: string;
  isMobile: boolean;
  index: number;
}) {
  return (
    <motion.div
      {...rise}
      transition={{ duration: 0.5, delay: Math.min(index, 3) * 0.08 }}
      style={{
        minWidth: 0,
        paddingTop: isMobile ? 20 : 0,
        paddingBottom: isMobile ? 20 : 0,
        paddingLeft: isMobile ? 0 : index === 0 ? 0 : 28,
        paddingRight: isMobile ? 0 : 28,
        borderTop: isMobile ? `1px solid ${C.rule}` : "none",
        borderLeft: isMobile || index === 0 ? "none" : `1px solid ${C.rule}`,
      }}
    >
      <p style={meta(11, C.muted)}>{n}</p>
      <h3 style={{ ...display(isMobile ? 24 : "clamp(22px, 2.2vw, 30px)"), marginTop: 12 }}>{title}</h3>
      <p style={{ ...body(isMobile ? 15 : 15.5, C.ink), marginTop: 14, maxWidth: "38ch" }}>{lead}</p>
      <p style={{ ...body(isMobile ? 13.5 : 14, C.muted), marginTop: 8, maxWidth: "38ch" }}>{note}</p>
    </motion.div>
  );
}

const PROBLEM = [
  {
    n: "01",
    title: "Reviews",
    lead: "Written by strangers with different bodies and different standards.",
    note: "Volume is not relevance. Thousands of reviews and none of them are from someone like you.",
  },
  {
    n: "02",
    title: "Size charts",
    lead: "Static measurements with no context for how things actually fit.",
    note: "Numbers without nuance. Your body does not live in a chart.",
  },
  {
    n: "03",
    title: "Model imagery",
    lead: "One body, styled to sell, not to inform.",
    note: "You were never the reference point. The model was.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Build your profile",
    lead: "Tell us your fit, your style preferences, and what you are looking for.",
    note: "Your silhouette, sizing, fit preferences, and style sensibility. This is how we find your mirrors.",
  },
  {
    n: "02",
    title: "Post what you are considering",
    lead: "Share the pieces you are thinking about and we will take it from there.",
    note: "Link a product. Set your confidence score. Tell us exactly what is making you hesitate.",
  },
  {
    n: "03",
    title: "Get tailored feedback",
    lead: "Real feedback from women who match your profile and your style.",
    note: "Matched input from women who share your shape, taste, and fit reality, before you commit.",
  },
];

const WHY = [
  {
    n: "Signal",
    title: "Trusted human input",
    lead: "You are not plugging numbers into an algorithm.",
    note: "You are seeing what actually happened (what fit, what did not, and why) from women who match your profile.",
  },
  {
    n: "Clarity",
    title: "Save time",
    lead: "Stop scrolling through hundreds of irrelevant reviews.",
    note: "ELEVENELEVEN surfaces what matters to you, fast.",
  },
  {
    n: "Confidence",
    title: "Decide with certainty",
    lead: "Real outcomes from women who share your shape and your standards.",
    note: "That is what turns a hesitation into a clear answer.",
  },
  {
    n: "Community",
    title: "You are not deciding alone",
    lead: "Shopping is a solo decision. ELEVENELEVEN makes it a shared one.",
    note: "Real women, matched to you, who understand your body and your preferences.",
  },
];

// ── Component ────────────────────────────────────────────────────────────────
const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  // The wordmark sends { home: true } — she asked for the landing page, so the
  // redirect below has to stay out of the way.
  const wantsHome = (location.state as { home?: boolean } | null)?.home;

  // Someone already signed in landing here was being shown a "Sign in" button and
  // typing her password again, session intact. Send her straight to the feed.
  useEffect(() => {
    if (wantsHome) return;
    if (!loading && user) navigate("/feed", { replace: true });
  }, [loading, user, navigate, wantsHome]);

  // Signed in, the nav shows her avatar instead of a sign-in button. Only worth
  // fetching when she is actually staying on this page.
  const [myProfile, setMyProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  useEffect(() => {
    if (!user || !wantsHome) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setMyProfile(data); });
    return () => { cancelled = true; };
  }, [user, wantsHome]);

  // Her initials chip, squared off like everything else.
  const avatarChip = (size: number) => (
    <button
      onClick={() => navigate("/feed")}
      aria-label="Go to your feed"
      className="e11-link"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        padding: 0,
        overflow: "hidden",
        background: C.well,
        border: `1px solid ${C.rule}`,
        borderRadius: RADIUS,
        color: C.ink,
        fontFamily: SANS,
        fontSize: size * 0.34,
        fontWeight: 700,
        letterSpacing: "0.02em",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {myProfile?.avatar_url
        ? <img src={myProfile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <span>{getInitials(myProfile?.display_name)}</span>}
    </button>
  );

  // The cover line is deliberately not animated in. It is the first thing an
  // invited woman sees, so it must never depend on JavaScript having run: a
  // throttled or slow tab was leaving it faded to nothing. The scroll reveals
  // further down are a different matter, since the page is already legible by
  // the time she gets to them.
  const heroType = (
    <div style={{ maxWidth: 620 }}>
      <h1 style={display(isMobile ? 40 : "clamp(52px, 6.2vw, 92px)")}>
        <span style={{ display: "block" }}>Stop guessing.</span>
        <span style={{ display: "block" }}>Shop with context.</span>
      </h1>

      <p style={{ ...body(isMobile ? 15.5 : 17, C.inkSoft), marginTop: isMobile ? 20 : 26, maxWidth: "40ch" }}>
        Get input from women who share your fit, style, and preferences, before you buy.
      </p>

      <button
        onClick={() => navigate("/signin?mode=signup")}
        className="e11-cta"
        style={{ ...cta(isMobile), marginTop: isMobile ? 26 : 34 }}
      >
        Get matched <ArrowRight style={{ width: 16, height: 16 }} strokeWidth={2} />
      </button>
    </div>
  );

  const heroPhoto = (
    <img
      src={heroImage}
      alt=""
      aria-hidden
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "62% center",
        display: "block",
        background: C.well,
      }}
    />
  );

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, overflowX: "hidden" }}>
      <style>{PAGE_CSS}</style>

      {/* ═══ MASTHEAD ═══════════════════════════════════════════════════════ */}
      <header style={{ background: C.paper, borderBottom: `1px solid ${C.rule}` }}>
        <div style={{
          maxWidth: MAX, margin: "0 auto", boxSizing: "border-box",
          padding: isMobile ? "14px 18px" : "20px 40px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <span
            className="select-none"
            style={{
              fontFamily: SANS, textTransform: "uppercase", color: C.ink, whiteSpace: "nowrap",
              letterSpacing: isMobile ? "0.22em" : "0.32em", fontSize: isMobile ? 12 : 15,
            }}
          >
            <span style={{ fontWeight: 700 }}>ELEVEN</span>
            <span style={{ fontWeight: 300 }}>ELEVEN</span>
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 16 : 28 }}>
            <button onClick={() => navigate("/feed")} className="e11-link" style={navLink(C.ink)}>
              Feed
            </button>
            {user ? avatarChip(isMobile ? 30 : 34) : (
              <button onClick={() => navigate("/signin")} className="e11-link" style={navLink(C.ink)}>
                Sign in <ArrowRight style={{ width: 13, height: 13 }} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ═══ HERO ═══════════════════════════════════════════════════════════ */}
      {isMobile ? (
        <section>
          <div style={{ padding: "34px 18px 32px" }}>{heroType}</div>
          <div style={{ width: "100%", aspectRatio: "4 / 5", overflow: "hidden" }}>{heroPhoto}</div>
        </section>
      ) : (
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.92fr) minmax(0, 1fr)", alignItems: "stretch", minHeight: "min(88svh, 820px)" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "72px 40px 72px max(40px, calc((100vw - 1320px) / 2 + 40px))" }}>
            {heroType}
          </div>
          <div style={{ overflow: "hidden" }}>{heroPhoto}</div>
        </section>
      )}

      {/* ═══ THE PROBLEM ════════════════════════════════════════════════════ */}
      <section style={{ background: C.paper, borderTop: `1px solid ${C.rule}` }}>
        <div style={{ maxWidth: MAX, margin: "0 auto", boxSizing: "border-box", padding: isMobile ? "48px 18px 52px" : "100px 40px 110px" }}>
          <SectionHead eyebrow="The problem" lines={["Finding it is easy.", "Trusting it is hard."]} isMobile={isMobile} />
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            marginTop: isMobile ? 26 : 56,
          }}>
            {PROBLEM.map((it, i) => (
              <Item key={it.n} n={it.n} title={it.title} lead={it.lead} note={it.note} isMobile={isMobile} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══════════════════════════════════════════════════ */}
      <section style={{ background: C.well, borderTop: `1px solid ${C.rule}` }}>
        <div style={{ maxWidth: MAX, margin: "0 auto", boxSizing: "border-box", padding: isMobile ? "48px 18px 52px" : "100px 40px 110px" }}>
          <SectionHead eyebrow="How it works" lines={["From uncertainty", "to confidence."]} isMobile={isMobile} />
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            marginTop: isMobile ? 26 : 56,
          }}>
            {STEPS.map((it, i) => (
              <Item key={it.n} n={it.n} title={it.title} lead={it.lead} note={it.note} isMobile={isMobile} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHY IT WORKS ═══════════════════════════════════════════════════ */}
      <section style={{ background: C.paper, borderTop: `1px solid ${C.rule}` }}>
        <div style={{ maxWidth: MAX, margin: "0 auto", boxSizing: "border-box", padding: isMobile ? "48px 18px 52px" : "100px 40px 110px" }}>
          <SectionHead eyebrow="Why it works" lines={["No measurements.", "No body scans.", "No guessing."]} isMobile={isMobile} />
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            rowGap: isMobile ? 0 : 44,
            marginTop: isMobile ? 26 : 56,
          }}>
            {WHY.map((it, i) => (
              <Item
                key={it.n}
                n={it.n}
                title={it.title}
                lead={it.lead}
                note={it.note}
                isMobile={isMobile}
                index={i % 2}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CLOSING ════════════════════════════════════════════════════════ */}
      <section style={{ position: "relative", background: C.ink, overflow: "hidden" }}>
        {/* Faint watermark */}
        <img
          src={logoSymbol}
          alt=""
          aria-hidden
          style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            height: "130%", width: "auto", maxWidth: "none",
            opacity: 0.05, filter: "invert(1)", pointerEvents: "none", userSelect: "none",
          }}
        />
        <div style={{
          position: "relative", zIndex: 1,
          maxWidth: MAX, margin: "0 auto", boxSizing: "border-box",
          padding: isMobile ? "56px 18px 60px" : "120px 40px 130px",
        }}>
          <motion.div {...rise} transition={{ duration: 0.7 }}>
            <p style={meta(11, "rgba(247,244,239,0.62)")}>Start now</p>
            <div style={{ height: 1, background: "rgba(247,244,239,0.22)", margin: isMobile ? "16px 0 22px" : "20px 0 30px" }} />
            <h2 style={display(isMobile ? 40 : "clamp(48px, 6.4vw, 96px)", C.paper)}>
              <span style={{ display: "block" }}>Cart full.</span>
              <span style={{ display: "block" }}>Confidence low?</span>
            </h2>
            <p style={{ ...body(isMobile ? 15 : 16.5, "rgba(247,244,239,0.62)"), marginTop: isMobile ? 20 : 26, maxWidth: "38ch" }}>
              Shop smarter. Powered by people like you.
            </p>
            <button
              onClick={() => navigate("/signin?mode=signup")}
              className="e11-cta"
              style={{ ...cta(isMobile), marginTop: isMobile ? 26 : 34 }}
            >
              Sign up, it's free <ArrowRight style={{ width: 16, height: 16 }} strokeWidth={2} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ═══ FOOTER ═════════════════════════════════════════════════════════ */}
      <footer style={{ background: C.ink, borderTop: "1px solid rgba(247,244,239,0.14)" }}>
        <div style={{
          maxWidth: MAX, margin: "0 auto", boxSizing: "border-box",
          padding: isMobile ? "26px 18px 34px" : "34px 40px",
          display: isMobile ? "flex" : "grid",
          flexDirection: "column",
          gridTemplateColumns: isMobile ? undefined : "1fr auto 1fr",
          alignItems: isMobile ? "flex-start" : "center",
          gap: isMobile ? 14 : 16,
        }}>
          <span style={{
            fontFamily: SANS, textTransform: "uppercase", whiteSpace: "nowrap",
            fontSize: 11, letterSpacing: "0.22em", color: "rgba(247,244,239,0.42)",
            justifySelf: "start",
          }}>
            <span style={{ fontWeight: 700 }}>ELEVEN</span>
            <span style={{ fontWeight: 300 }}>ELEVEN</span>
          </span>

          <a
            href="mailto:hello@geteleveneleven.com"
            className="e11-link"
            style={{ ...strong(13, "rgba(247,244,239,0.72)"), textDecoration: "none", justifySelf: "center", textAlign: isMobile ? "left" : "center" }}
          >
            Questions? hello@geteleveneleven.com
          </a>

          <span style={{
            ...meta(10, "rgba(247,244,239,0.34)"),
            letterSpacing: "0.16em", fontWeight: 500, justifySelf: "end", textAlign: isMobile ? "left" : "right",
          }}>
            © 2026 ELEVENELEVEN. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
