import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import logoSymbol from "@/assets/logo-symbol.png";
import heroImage from "@/assets/hero-editorial.png";

const INK          = "#1C1712";
const INK_MID      = "rgba(28,23,18,0.52)";
const INK_FAINT    = "rgba(28,23,18,0.22)";
const DIVIDER      = "rgba(28,23,18,0.10)";

// Base colour sampled directly from the hero image wall — warm white, not beige
const SECTION_BASE = "#ECE7DF";

// Stark light-beam background — high opacity beams, radial glow source
const BEAM_BG = [
  // Bright light-source glow upper-right
  "radial-gradient(ellipse 55% 70% at 94% 5%,  rgba(255,255,250,1.0)  0%, rgba(255,254,248,0.75) 25%, transparent 55%)",
  // Wide soft fill across the right half
  "radial-gradient(ellipse 50% 80% at 85% 55%, rgba(255,253,245,0.55) 0%, transparent 60%)",
  // Stark narrow beams
  "linear-gradient(112deg, transparent 28%, rgba(255,255,252,0.88) 32%, rgba(255,255,252,0.60) 34%, transparent 37%)",
  "linear-gradient(118deg, transparent 48%, rgba(255,255,252,0.72) 51%, rgba(255,255,252,0.42) 53%, transparent 56%)",
  "linear-gradient(108deg, transparent 65%, rgba(255,255,252,0.60) 68%, rgba(255,255,252,0.30) 70%, transparent 73%)",
  SECTION_BASE,
].join(", ");

// Alternate: beams from lower-right for visual variety
const BEAM_BG_ALT = [
  "radial-gradient(ellipse 55% 65% at 96% 90%,  rgba(255,255,250,1.0)  0%, rgba(255,254,248,0.70) 25%, transparent 52%)",
  "radial-gradient(ellipse 45% 70% at 80% 40%,  rgba(255,253,245,0.50) 0%, transparent 58%)",
  "linear-gradient(115deg, transparent 20%, rgba(255,255,252,0.82) 24%, rgba(255,255,252,0.50) 26%, transparent 30%)",
  "linear-gradient(120deg, transparent 44%, rgba(255,255,252,0.68) 47%, rgba(255,255,252,0.38) 49%, transparent 53%)",
  "linear-gradient(110deg, transparent 68%, rgba(255,255,252,0.55) 71%, rgba(255,255,252,0.25) 73%, transparent 77%)",
  "#EAE4DC",
].join(", ");

// Truly frosted glass — very transparent so beams show through
const GLASS_BG     = "rgba(255, 255, 255, 0.18)";
const GLASS_BORDER = "1px solid rgba(255, 255, 255, 0.90)";
const GLASS_SHADOW = "0 8px 40px rgba(160,140,110,0.10), inset 0 1.5px 0 rgba(255,255,255,1.0), inset 0 -1px 0 rgba(255,255,255,0.4)";


// ─── SVG Icons (outline, thin) ────────────────────────────────────────────────
const IconPerson = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="13" cy="9.5" r="4.5" stroke={INK} strokeWidth="1.4"/>
    <path d="M3.5 23C3.5 18.306 7.806 14.5 13 14.5C18.194 14.5 22.5 18.306 22.5 23" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconChat = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 5.5C4 4.672 4.672 4 5.5 4H20.5C21.328 4 22 4.672 22 5.5V16.5C22 17.328 21.328 18 20.5 18H8L4 22V5.5Z" stroke={INK} strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M9 10.5H17M9 13.5H14" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconGroup = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="10" r="3.5" stroke={INK} strokeWidth="1.4"/>
    <circle cx="17" cy="10" r="3.5" stroke={INK} strokeWidth="1.4"/>
    <path d="M1.5 22C1.5 18.41 4.91 15.5 9 15.5C13.09 15.5 16.5 18.41 16.5 22" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M17 15.5C21.09 15.5 24.5 18.41 24.5 22" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────
const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Manrope', sans-serif" }}>

      {/* ═══ HERO ═══════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden"
        style={{ height: "100svh", minHeight: 620 }}
      >
        {/* Full-bleed image — swap heroImage import for your new editorial photo */}
        <img
          src={heroImage}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "80% center" }}
        />

        {/* Gradient overlay — left-side darken so white text is legible */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(6,4,2,0.78) 0%, rgba(6,4,2,0.42) 38%, rgba(6,4,2,0.06) 72%, transparent 100%)," +
              "linear-gradient(to top,   rgba(6,4,2,0.55) 0%, rgba(6,4,2,0.0) 55%)",
          }}
        />

        {/* ── Nav ── */}
        <nav className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-8 md:px-14 py-7">
          {/* Wordmark */}
          <span className="select-none uppercase" style={{ letterSpacing: "0.32em", fontSize: 18, color: "rgba(255,255,255,0.92)" }}>
            <span style={{ fontWeight: 700 }}>ELEVEN</span>
            <span style={{ fontWeight: 300 }}>ELEVEN</span>
          </span>

          {/* Links */}
          <div className="hidden md:flex items-center gap-8">
            <button
              onClick={() => navigate("/feed")}
              className="uppercase transition-opacity hover:opacity-60"
              style={{ color: "rgba(255,255,255,0.72)", fontSize: 14, letterSpacing: "0.18em" }}
            >
              Feed
            </button>
            <button
              onClick={() => navigate("/signin")}
              className="uppercase transition-opacity hover:opacity-60"
              style={{ color: "rgba(255,255,255,0.92)", fontWeight: 600, fontSize: 14, letterSpacing: "0.2em" }}
            >
              Sign in →
            </button>
          </div>

          {/* Mobile nav */}
          <div className="flex md:hidden items-center gap-4">
            <button
              onClick={() => navigate("/feed")}
              className="text-xs tracking-widest uppercase"
              style={{ color: "rgba(255,255,255,0.72)" }}
            >
              Feed
            </button>
            <button
              onClick={() => navigate("/signin")}
              className="text-xs tracking-widest uppercase"
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              Sign in
            </button>
          </div>
        </nav>

        {/* ── Hero text — left zone, woman pushed to 80% right ── */}
        <div
          className="absolute left-0 z-10 px-6 md:px-14 w-[88vw] md:w-[56vw]"
          style={{ top: "40%" }}
        >
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontFamily: "'Bodoni Moda', serif",
              fontOpticalSizing: "auto",
              fontSize: "clamp(1.85rem, 5.2vw, 5.8rem)",
              lineHeight: 1.04,
              fontWeight: 400,
              color: "#FFFFFF",
              letterSpacing: "-0.01em",
              marginBottom: "1.4rem",
            }}
          >
            stop guessing.<br />
            shop with context.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontSize: 18,
              lineHeight: 1.65,
              color: "rgba(255,255,255,0.78)",
              marginBottom: "2.25rem",
              maxWidth: 420,
            }}
          >
            Get input from women who share your fit, style, and preferences — before you buy.
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
            onClick={() => navigate("/signin?mode=signup")}
            style={{
              display: "inline-block",
              padding: "16px 44px",
              fontSize: 11,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "#FFFFFF",
              background: "rgba(255,255,255,0.06)",
              border: "1.5px solid rgba(255,255,255,0.95)",
              cursor: "pointer",
              boxShadow:
                "0 0 32px rgba(255,255,255,0.45), 0 0 80px rgba(255,255,255,0.2), 0 0 140px rgba(255,255,255,0.08), inset 0 0 28px rgba(255,255,255,0.08)",
              transition: "all 0.25s ease",
            }}
            whileHover={{
              boxShadow:
                "0 0 48px rgba(255,255,255,0.6), 0 0 100px rgba(255,255,255,0.28), 0 0 180px rgba(255,255,255,0.12), inset 0 0 36px rgba(255,255,255,0.12)",
            }}
          >
            GET MATCHED
          </motion.button>
        </div>
      </section>

      {/* ═══ THE PROBLEM ═════════════════════════════════════════════════════════ */}
      <section className="relative px-8 md:px-14 pt-24 pb-28 overflow-hidden" style={{ background: BEAM_BG }}>
        <div className="max-w-7xl mx-auto relative z-10">

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            style={{ fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: INK_MID, marginBottom: 32 }}
          >
            The problem
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            style={{ borderTop: `1px solid ${DIVIDER}`, paddingTop: 40, marginBottom: 48 }}
          >
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(2.8rem, 5.2vw, 5.2rem)", fontWeight: 300, lineHeight: 1.04, color: INK, maxWidth: "14em" }}>
              Finding it is easy.<br />Trusting it is <em style={{ fontStyle: "italic" }}>hard.</em>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: "Reviews",       heading: "Written by strangers with different bodies, different standards.", desc: "Volume isn't relevance. Thousands of reviews and none of them are from someone like you." },
              { label: "Size charts",   heading: "Static measurements with no context for how things actually fit.", desc: "Numbers without nuance. Your body doesn't live in a chart." },
              { label: "Model imagery", heading: "One body, styled to sell — not to inform.",                        desc: "You were never the reference point. The model was." },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.12 }}
                style={{ background: GLASS_BG, border: GLASS_BORDER, borderRadius: 16, padding: "28px 28px 32px", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", boxShadow: GLASS_SHADOW }}>
                <p style={{ fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: INK_MID, marginBottom: 20 }}>{item.label}</p>
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.25rem, 2vw, 1.55rem)", fontWeight: 400, lineHeight: 1.35, color: INK, marginBottom: 14 }}>{item.heading}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: INK_MID }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ════════════════════════════════════════════════════════ */}
      <section
        className="relative px-8 md:px-14 pt-24 pb-28 overflow-hidden"
        style={{ background: BEAM_BG_ALT }}
      >
        <div className="max-w-7xl mx-auto relative z-10">

          {/* Label */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            style={{
              fontSize: 10,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: INK_MID,
              marginBottom: 32,
            }}
          >
            How it works
          </motion.p>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            style={{ borderTop: `1px solid ${DIVIDER}`, paddingTop: 40, marginBottom: 48 }}
          >
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "clamp(3rem, 5.5vw, 5.5rem)",
                fontWeight: 300,
                lineHeight: 1.04,
                letterSpacing: "-0.01em",
                color: INK,
                maxWidth: "10em",
              }}
            >
              From uncertainty<br />to confidence.
            </h2>
          </motion.div>

          {/* Numbered steps row */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-3 mb-5"
          >
            {["01", "02", "03"].map((n, i) => (
              <div
                key={n}
                className="flex items-center gap-5"
                style={{ paddingRight: i < 2 ? 24 : 0, paddingLeft: i > 0 ? 24 : 0 }}
              >
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: "clamp(2rem, 3vw, 3rem)",
                    fontWeight: 300,
                    color: INK_MID,
                    letterSpacing: "0.02em",
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {n}
                </span>
                <div style={{ flex: 1, height: 1, background: DIVIDER }} />
              </div>
            ))}
          </motion.div>

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: <IconPerson />, label: "Build your profile",        heading: "Tell us your fit, style preferences, and what you're looking for.",    desc: "Your silhouette, sizing, fit preferences, and style sensibility. This is how we find your mirrors." },
              { icon: <IconChat />,   label: "Post what you're considering", heading: "Share the pieces you're thinking about — we'll take it from there.", desc: "Link a product. Set your confidence score. Tell us exactly what's making you hesitate." },
              { icon: <IconGroup />,  label: "Get tailored feedback",     heading: "Get real feedback from women who match your profile and style.",        desc: "Matched input from women who share your shape, taste, and fit reality — before you commit." },
            ].map((step, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.55, delay: i * 0.12 }}
                style={{ background: GLASS_BG, border: GLASS_BORDER, borderRadius: 16, padding: "32px 28px 36px", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", boxShadow: GLASS_SHADOW }}>
                <div style={{ marginBottom: 20 }}>{step.icon}</div>
                <p style={{ fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: INK_MID, marginBottom: 16 }}>{step.label}</p>
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.35rem, 2.2vw, 1.65rem)", fontWeight: 400, lineHeight: 1.3, color: INK, marginBottom: 16 }}>{step.heading}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: INK_MID }}>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHY IT WORKS ════════════════════════════════════════════════════════ */}
      <section className="relative px-8 md:px-14 pt-24 pb-28 overflow-hidden" style={{ background: BEAM_BG }}>
        <div className="max-w-7xl mx-auto relative z-10">

          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
            style={{ fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: INK_MID, marginBottom: 32 }}>
            Why it works
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
            style={{ borderTop: `1px solid ${DIVIDER}`, paddingTop: 40, marginBottom: 40 }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(2.6rem, 5vw, 5rem)", fontWeight: 300, lineHeight: 1.04, color: INK }}>
              No measurements.<br />No body scans.<br />No <em style={{ fontStyle: "italic" }}>guessing.</em>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-4">
            {[
              { tag: "Signal",     heading: "Trusted human input",    desc: "You're not plugging numbers into an algorithm. You're seeing what actually happened — what fit, what didn't, and why — from women who match your profile." },
              { tag: "Clarity",    heading: "Save time",              desc: "Stop scrolling through hundreds of irrelevant reviews. ELEVENELEVEN surfaces what matters to you, fast." },
              { tag: "Confidence", heading: "Decide with certainty",  desc: "Real outcomes from women who share your shape and your standards. That's what turns a hesitation into a clear answer." },
              { tag: "Community",  heading: "You're not deciding alone", desc: "Shopping is a solo decision. ELEVENELEVEN makes it a shared one — real women, matched to you, who understand your body and your preferences." },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                style={{ background: GLASS_BG, border: GLASS_BORDER, borderRadius: 16, padding: "28px 28px 32px", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", boxShadow: GLASS_SHADOW }}>
                <p style={{ fontSize: 9, letterSpacing: "0.26em", textTransform: "uppercase", color: INK_MID, marginBottom: 16 }}>{item.tag}</p>
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(1.25rem, 2vw, 1.5rem)", fontWeight: 400, lineHeight: 1.35, color: INK, marginBottom: 14 }}>{item.heading}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: INK_MID }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ BOTTOM CTA ══════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden flex flex-col items-center justify-center text-center py-36"
        style={{ background: "#3A3530" }}
      >
        {/* Faint watermark */}
        <img
          src={logoSymbol}
          alt=""
          aria-hidden
          className="absolute left-1/2 top-1/2 pointer-events-none select-none"
          style={{
            height: "130%",
            width: "auto",
            transform: "translate(-50%, -50%)",
            opacity: 0.04,
            filter: "invert(1)",
          }}
        />

        <div className="relative z-10 px-6 max-w-2xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(2.4rem, 5vw, 4.5rem)",
              fontWeight: 300,
              lineHeight: 1.04,
              color: "#FDFAF6",
              marginBottom: 20,
            }}
          >
            Cart full.<br />Confidence low?
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(253,250,246,0.55)", marginBottom: 40 }}
          >
            Shop smarter. Powered by people like you.
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.35 }}
            onClick={() => navigate("/signin?mode=signup")}
            style={{
              display: "inline-block",
              padding: "14px 40px",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "#FFFFFF",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.6)",
              cursor: "pointer",
              boxShadow: "0 0 20px rgba(255,255,255,0.1), 0 0 60px rgba(255,255,255,0.05)",
              transition: "all 0.25s ease",
            }}
            whileHover={{
              boxShadow: "0 0 32px rgba(255,255,255,0.2), 0 0 80px rgba(255,255,255,0.08)",
              borderColor: "rgba(255,255,255,0.9)",
            }}
          >
            Sign up — it's free
          </motion.button>
        </div>
      </section>

      {/* ═══ FOOTER ══════════════════════════════════════════════════════════════ */}
      <footer
        className="py-10 px-8 md:px-14 flex flex-col md:flex-row items-center justify-between gap-4"
        style={{ background: "#3A3530", borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <span style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(253,250,246,0.28)" }}>
          <span style={{ fontWeight: 700 }}>ELEVEN</span>
          <span style={{ fontWeight: 300 }}>ELEVEN</span>
        </span>
        <span style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(253,250,246,0.22)" }}>
          © 2026 ELEVENELEVEN — All rights reserved
        </span>
      </footer>

    </div>
  );
};

export default Index;
