// ── Index ─────────────────────────────────────────────────────────────────────
// The public landing page: the first thing an invited woman sees. Signed in, she
// is sent to the feed instead, so everything here is written for someone who has
// never used it.
//
// Set as a fashion cover rather than a SaaS page. Six sections: a hero where the
// women walk across the wordmark, the problem and the idea on burgundy leather,
// how it works on white, why it works back on leather, and the sign-up on white
// leather. The leather is photographed (public/home), never faked in CSS.
// Scale, type, whitespace and one slow horizontal movement carry it. No cards,
// no pills, no icons, no serifs.
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/lib/supabase";
import { getInitials } from "@/lib/format";
import { C, RADIUS, SANS, body, display, meta, strong } from "@/lib/design";
import logoSymbol from "@/assets/logo-symbol.png";

const BURGUNDY_LEATHER = "/home/leather-burgundy.png";
const WHITE_LEATHER    = "/home/leather-white.png";
const MODELS_STRIP     = "/home/models-strip.png";
const MODEL_PORTRAIT   = "/home/model-leather-pants.png";

// Cream, for type on the leather.
const CREAM = "#F2EDE6";
const CREAM_SOFT = "rgba(242,237,230,0.74)";
const CREAM_RULE = "rgba(242,237,230,0.42)";

const PAGE_CSS = `
.e11-cta { transition: background 0.18s, border-color 0.18s, opacity 0.18s; }
.e11-cta:hover { background: #5E1414; border-color: #5E1414; }
.e11-link { transition: opacity 0.18s; }
.e11-link:hover { opacity: 0.6; }
/* The walk: two copies of the same strip, sliding one full copy then resetting. */
@keyframes e11-walk { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-50%, 0, 0); } }
.e11-walk { animation: e11-walk 64s linear infinite; will-change: transform; }
@media (prefers-reduced-motion: reduce) { .e11-walk { animation: none; } }
`;

const MAX = 1320;

const cta = (mobile: boolean): React.CSSProperties => ({
  ...meta(12, "#FFFFFF"),
  fontWeight: 700,
  letterSpacing: "0.16em",
  background: C.burgundy,
  border: `1px solid ${C.burgundy}`,
  borderRadius: RADIUS,
  padding: mobile ? "16px 28px" : "18px 40px",
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

/** Section label and the long rule that runs off beside it. */
function Head({ label, onDark, isMobile }: { label: string; onDark: boolean; isMobile: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 16 : 28 }}>
      <p style={{ ...display(isMobile ? 20 : 26, onDark ? CREAM : C.ink), whiteSpace: "nowrap" }}>{label}</p>
      <div style={{ flex: 1, height: 1, background: onDark ? CREAM_RULE : C.rule }} />
    </div>
  );
}

/** A statement set on leather: Anton, intentional line breaks, room around it. */
function Statement({ lines, mobileLines, isMobile }: { lines: string[][]; mobileLines?: string[][]; isMobile: boolean }) {
  const blocks = isMobile ? (mobileLines ?? lines) : lines;
  return (
    <motion.div>
      {blocks.map((block, bi) => (
        <p key={bi} style={{ ...display(isMobile ? "clamp(19px, 6vw, 30px)" : "clamp(32px, 5vw, 72px)", CREAM), lineHeight: 1.1, marginTop: bi === 0 ? 0 : isMobile ? 26 : 48 }}>
          {block.map((l, i) => <span key={i} style={{ display: "block", whiteSpace: "nowrap" }}>{l}</span>)}
        </p>
      ))}
    </motion.div>
  );
}

const PROBLEM_WORDS = ["Reviews", "Size charts", "Models"];

const PROBLEM_NOTES = [
  ["01", "Thousands of opinions.", "Which ones matter to you?"],
  ["02", "Brand to brand.", "Style to style. Nothing is standard."],
  ["03", "One product. One body.", "One frame of reference."],
];

const STEPS = [
  ["01", "Post", "Share what you're considering and what you're unsure about."],
  ["02", "Get matched", "We find women with the experience and context most relevant to your decision."],
  ["03", "Decide", "Get their input, decide confidently, close the loop."],
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

  // Browsers restore the scroll position they remember for this URL, which was
  // dropping people at the footer of the cover page with the walk out of sight.
  // The homepage always opens at the top.
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    return () => { if ("scrollRestoration" in history) history.scrollRestoration = "auto"; };
  }, []);

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

  const leather = (src: string): React.CSSProperties => ({
    backgroundImage: `url(${src})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  });

  const pad = isMobile ? "56px 18px 64px" : "110px 40px 120px";
  const inner: React.CSSProperties = { maxWidth: MAX, margin: "0 auto", boxSizing: "border-box", padding: pad };

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, overflowX: "hidden" }}>
      <style>{PAGE_CSS}</style>

      {/* ═══ 01 HERO ════════════════════════════════════════════════════════ */}
      <section style={{ position: "relative", background: C.paper, overflow: "hidden" }}>
        <div style={{
          position: "relative", zIndex: 2,
          maxWidth: MAX, margin: "0 auto", boxSizing: "border-box",
          padding: isMobile ? "16px 18px 0" : "26px 40px 0",
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: isMobile ? 12 : 22,
        }}>
          <button onClick={() => navigate("/feed")} className="e11-link" style={navLink(C.ink)}>
            Feed <ArrowUpRight style={{ width: 14, height: 14 }} strokeWidth={2} />
          </button>
          {user ? avatarChip(isMobile ? 30 : 34) : (
            <>
              <button
                onClick={() => navigate("/signin?mode=signup")}
                className="e11-cta"
                style={{
                  ...meta(isMobile ? 10.5 : 11, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.14em",
                  background: C.burgundy, border: `1px solid ${C.burgundy}`, borderRadius: RADIUS,
                  padding: isMobile ? "9px 13px" : "11px 20px", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 7,
                }}
              >
                Join <ArrowUpRight style={{ width: 14, height: 14 }} strokeWidth={2} />
              </button>
              <button onClick={() => navigate("/signin")} className="e11-link" style={navLink(C.ink)}>
                Sign in <ArrowUpRight style={{ width: 14, height: 14 }} strokeWidth={2} />
              </button>
            </>
          )}
        </div>

        {/* The wordmark, and the women walking across it. The type never waits on
            JavaScript: it is the first thing she sees. */}
        <div style={{
          position: "relative",
          height: isMobile ? "min(62svh, 520px)" : "min(74svh, 760px)",
          marginTop: isMobile ? 18 : 10,
        }}>
          <h1 aria-label="ElevenEleven" style={{
            position: "absolute", left: 0, right: 0, top: isMobile ? "16%" : "10%",
            margin: 0, textAlign: "center", whiteSpace: "nowrap", pointerEvents: "none",
            ...display(isMobile ? "19.9vw" : "19.8vw", C.ink),
            letterSpacing: "-0.02em",
            lineHeight: 1,
            transform: `scaleY(${isMobile ? 1.5 : 1.7})`,
            transformOrigin: "top center",
          }}>
            ELEVENELEVEN
          </h1>

          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
            <div className="e11-walk" style={{ display: "flex", width: "max-content" }}>
              {[0, 1].map((i) => (
                <img
                  key={i}
                  src={MODELS_STRIP}
                  alt={i === 0 ? "Women walking" : ""}
                  aria-hidden={i === 1}
                  style={{
                    height: isMobile ? "min(44svh, 380px)" : "min(58svh, 600px)",
                    width: "auto", maxWidth: "none", display: "block", flexShrink: 0,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 02 THE PROBLEM ═════════════════════════════════════════════════ */}
      <section style={{ ...leather(BURGUNDY_LEATHER), color: CREAM }}>
        <div style={inner}>
          <Head label="The problem" onDark isMobile={isMobile} />

          {isMobile ? (
            <div style={{ marginTop: 34 }}>
              <motion.div>
                {PROBLEM_WORDS.map((w) => (
                  <p key={w} style={{ ...display("clamp(42px, 13.5vw, 62px)", CREAM), lineHeight: 1.02 }}>{w}</p>
                ))}
              </motion.div>
              <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 22 }}>
                {PROBLEM_NOTES.map(([n, a, b]) => (
                  <div key={n} style={{ display: "grid", gridTemplateColumns: "42px 1fr", gap: 10 }}>
                    <span style={{ ...display(20, CREAM_SOFT) }}>{n} /</span>
                    <span style={{ ...meta(12, CREAM), lineHeight: 1.6, letterSpacing: "0.06em" }}>
                      <span style={{ display: "block" }}>{a}</span>
                      <span style={{ display: "block" }}>{b}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.05fr)", columnGap: 48, marginTop: 64, minHeight: 440 }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 30, paddingBottom: 12 }}>
                {PROBLEM_NOTES.map(([n, a, b], i) => (
                  <motion.div key={n} style={{ display: "grid", gridTemplateColumns: "66px 1fr", gap: 16, alignItems: "baseline" }}>
                    <span style={{ ...display(30, CREAM_SOFT) }}>{n} /</span>
                    <span style={{ ...meta(13, CREAM), lineHeight: 1.7, letterSpacing: "0.06em" }}>
                      <span style={{ display: "block" }}>{a}</span>
                      <span style={{ display: "block" }}>{b}</span>
                    </span>
                  </motion.div>
                ))}
              </div>

              <motion.div style={{ textAlign: "right" }}>
                {PROBLEM_WORDS.map((w) => (
                  <p key={w} style={{ ...display("clamp(60px, 7.6vw, 122px)", CREAM), lineHeight: 0.98, letterSpacing: "-0.01em" }}>{w}</p>
                ))}
              </motion.div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ 03 THE IDEA ════════════════════════════════════════════════════ */}
      <section style={{ ...leather(BURGUNDY_LEATHER), color: CREAM, borderTop: `1px solid ${CREAM_RULE}` }}>
        <div style={{ ...inner, padding: isMobile ? "56px 18px 72px" : "110px 40px 140px" }}>
          <Head label="The idea" onDark isMobile={isMobile} />
          <div style={{ marginTop: isMobile ? 46 : 96 }}>
            <Statement
              isMobile={isMobile}
              lines={[
                ["Somewhere, someone already", "has the experience that could", "help you decide confidently."],
                ["ElevenEleven finds her."],
              ]}
            />
          </div>
        </div>
      </section>

      {/* ═══ 04 HOW IT WORKS ════════════════════════════════════════════════ */}
      <section style={{ background: "#FFFFFF", color: C.ink }}>
        <div style={inner}>
          <Head label="How it works" onDark={false} isMobile={isMobile} />

          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 0.9fr) minmax(0, 1fr)",
            columnGap: 72, rowGap: isMobile ? 40 : 0,
            marginTop: isMobile ? 36 : 72,
            alignItems: "center",
          }}>
            {/* The photograph, outlined rather than boxed. */}
            <motion.div style={{ order: isMobile ? 1 : 0 }}>
              <div style={{ border: `1px solid ${C.burgundy}`, borderRadius: RADIUS, padding: isMobile ? 12 : 18 }}>
                <img
                  src={MODEL_PORTRAIT}
                  alt=""
                  aria-hidden
                  style={{ width: "100%", height: "auto", display: "block", aspectRatio: "2 / 3", objectFit: "contain" }}
                />
              </div>
            </motion.div>

            <div style={{ order: isMobile ? 2 : 1, display: "flex", flexDirection: "column", gap: isMobile ? 40 : 64 }}>
              {STEPS.map(([n, title, copy], i) => (
                <motion.div key={n} style={{ display: "grid", gridTemplateColumns: isMobile ? "56px 1fr" : "82px 1fr", columnGap: isMobile ? 14 : 22, alignItems: "start" }}>
                  <span style={{ ...display(isMobile ? 34 : 52, C.burgundy), lineHeight: 0.9 }}>{n}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ ...display(isMobile ? 26 : 36, C.ink), lineHeight: 1 }}>{title}</p>
                    <p style={{ ...body(isMobile ? 14.5 : 16, C.inkSoft), marginTop: 12, maxWidth: "34ch" }}>{copy}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 05 WHY IT WORKS ════════════════════════════════════════════════ */}
      <section style={{ ...leather(BURGUNDY_LEATHER), color: CREAM }}>
        <div style={{ ...inner, padding: isMobile ? "56px 18px 72px" : "110px 40px 140px" }}>
          <Head label="Why it works" onDark isMobile={isMobile} />
          <div style={{ marginTop: isMobile ? 46 : 96 }}>
            <Statement
              isMobile={isMobile}
              lines={[[
                "Someone else's experience helped you decide.",
                "Yours helps whoever comes next.",
              ]]}
              mobileLines={[[
                "Someone else's experience",
                "helped you decide.",
                "Yours helps",
                "whoever comes next.",
              ]]}
            />
          </div>
        </div>
      </section>

      {/* ═══ 06 SIGN UP ═════════════════════════════════════════════════════ */}
      <section style={{ ...leather(WHITE_LEATHER), color: C.ink }}>
        <div style={{
          maxWidth: MAX, margin: "0 auto", boxSizing: "border-box",
          padding: isMobile ? "44px 18px 26px" : "56px 40px 40px",
        }}>
          <motion.div style={{ textAlign: "center", padding: isMobile ? "56px 0 0" : "96px 0 0" }}>
            <h2 style={{ ...display(isMobile ? "clamp(46px, 15vw, 72px)" : "clamp(72px, 9.4vw, 148px)", C.burgundy), lineHeight: 0.92 }}>
              <span style={{ display: "block" }}>What are you</span>
              <span style={{ display: "block" }}>deciding on?</span>
            </h2>
            <button
              onClick={() => navigate("/signin?mode=signup")}
              className="e11-cta"
              style={{ ...cta(isMobile), marginTop: isMobile ? 30 : 42 }}
            >
              Sign up <ArrowRight style={{ width: 16, height: 16 }} strokeWidth={2} />
            </button>
          </motion.div>

          {/* The footer sits on the same leather, kept to what it always was. */}
          <div style={{
            marginTop: isMobile ? 56 : 92,
            display: isMobile ? "flex" : "grid",
            flexDirection: "column",
            gridTemplateColumns: isMobile ? undefined : "1fr auto 1fr",
            alignItems: isMobile ? "flex-start" : "center",
            gap: isMobile ? 14 : 16,
          }}>
            <img
              src={logoSymbol}
              alt="ElevenEleven"
              style={{ height: isMobile ? 30 : 36, width: "auto", display: "block", justifySelf: "start" }}
            />

            <a
              href="mailto:hello@geteleveneleven.com"
              className="e11-link"
              style={{ ...strong(13, C.inkSoft), textDecoration: "none", justifySelf: "center", textAlign: isMobile ? "left" : "center" }}
            >
              Questions? hello@geteleveneleven.com
            </a>

            <span style={{
              ...meta(10, C.muted),
              letterSpacing: "0.16em", fontWeight: 500, justifySelf: "end", textAlign: isMobile ? "left" : "right",
            }}>
              © 2026 ELEVENELEVEN. All rights reserved.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
