import { useState, useEffect, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Lock } from "lucide-react";
import { STEPS, SIZE_OPTIONS, FIT_CATEGORIES } from "@/components/onboarding/OnboardingData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { computeMatchScore } from "@/lib/matching";
import { ensureReferral, pendingReferrer } from "@/lib/referral";
import { useIsMobile } from "@/hooks/use-mobile";
import { C, RADIUS, SANS, body, display, hairline, meta, strong } from "@/lib/design";

// ─── Match label helper ───────────────────────────────────────────────────────
function getMatchLabel(mine: Record<string, any>, them: Record<string, any>): string {
  const mySil   = (mine?.silhouette_preference ?? [])[0];
  const theirSil = (them?.silhouette_preference ?? [])[0];
  if (mySil && theirSil && mySil === theirSil) return "Similar build";
  if (mine?.height_range && them?.height_range && mine.height_range === them.height_range) return "Similar height";
  const myStyles: string[]    = mine?.style_aesthetics ?? [];
  const theirStyles: string[] = them?.style_aesthetics ?? [];
  if (myStyles.some(s => theirStyles.includes(s))) return "Similar style";
  if (mine?.top_size && them?.top_size && mine.top_size === them.top_size) return "Similar size";
  return "Close match";
}

// ─── Fan card layout config (5 cards) ────────────────────────────────────────
const FAN_CONFIG = [
  { left: -22, y: 22, rotate: -13, scale: 0.74, zIndex: 1 },
  { left: 52,  y: 9,  rotate: -6,  scale: 0.87, zIndex: 2 },
  { left: 124, y: 0,  rotate: 0,   scale: 1.0,  zIndex: 5 },
  { left: 196, y: 9,  rotate: 6,   scale: 0.87, zIndex: 2 },
  { left: 262, y: 22, rotate: 13,  scale: 0.74, zIndex: 1 },
];

const TOTAL_STEPS = 6;
const HEIGHT_BANDS_ORDERED = [
  "Under 5'0\"",
  "5'0\" – 5'3\"",
  "5'4\" – 5'6\"",
  "5'7\" – 5'9\"",
  "5'10\" – 6'0\"",
  "Over 6'0\"",
];

// ── The editorial system, locally ─────────────────────────────────────────────
// Set per src/lib/design.ts, like Post a decision and Looking for: paper ground,
// hairline rules instead of boxes, square edges, Anton for the step headings
// only. Burgundy is the action colour. Selected options are ink filled with
// paper text; the image cards take a burgundy rule instead.

const PAGE_CSS = `
.ob-field::placeholder { color: ${C.muted}; opacity: 1; }
.ob-field:focus { border-color: ${C.ink} !important; }
.ob-sugg:hover { background: ${C.well}; }
`;

const primaryBtn = (enabled: boolean): CSSProperties => ({
  ...meta(12, "#FFFFFF"),
  fontWeight: 700,
  letterSpacing: "0.16em",
  width: "100%",
  background: C.burgundy,
  border: `1px solid ${C.burgundy}`,
  borderRadius: RADIUS,
  padding: "15px 18px",
  cursor: enabled ? "pointer" : "default",
  opacity: enabled ? 1 : 0.35,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  transition: "opacity 0.15s",
});

const outlineBtn: CSSProperties = {
  ...meta(11, C.ink),
  fontWeight: 700,
  letterSpacing: "0.16em",
  width: "100%",
  background: "transparent",
  border: `1px solid ${C.ink}`,
  borderRadius: RADIUS,
  padding: "13px 16px",
  cursor: "pointer",
};

const textLink = (colour: string = C.ink): CSSProperties => ({
  ...meta(11, colour),
  fontWeight: 700,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
});

/** A short selectable option: fit answers, heights, sizes. */
const chip = (on: boolean): CSSProperties => ({
  fontFamily: SANS,
  fontSize: 13.5,
  fontWeight: on ? 600 : 500,
  lineHeight: 1.2,
  color: on ? C.paper : C.ink,
  background: on ? C.ink : "transparent",
  border: `1px solid ${on ? C.ink : C.rule}`,
  borderRadius: RADIUS,
  padding: "10px 14px",
  cursor: "pointer",
  transition: "background 0.12s, color 0.12s, border-color 0.12s",
});

/** The same, as a full-width tile in a grid. */
const tile = (on: boolean): CSSProperties => ({
  ...chip(on),
  fontSize: 15,
  fontWeight: on ? 600 : 500,
  padding: "15px 10px",
  textAlign: "center",
});

function Masthead({ isMobile }: { isMobile: boolean }) {
  return (
    <header style={{ background: C.paper, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", justifyContent: "center", padding: isMobile ? "14px 16px" : "20px 40px" }}>
        <span style={{ userSelect: "none", fontFamily: SANS, textTransform: "uppercase", letterSpacing: isMobile ? "0.22em" : "0.32em", fontSize: isMobile ? 12 : 15, color: C.ink, whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 700 }}>ELEVEN</span>
          <span style={{ fontWeight: 300 }}>ELEVEN</span>
        </span>
      </div>
    </header>
  );
}

function StepMark({ index, total }: { index: number; total: number }) {
  return (
    <div style={{ marginBottom: 30 }} aria-label={`Step ${index + 1} of ${total}`}>
      <div style={{ display: "flex", gap: 4 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 2, background: i <= index ? C.burgundy : C.rule, transition: "background 0.25s" }} />
        ))}
      </div>
      <p style={{ ...meta(10.5, C.ink), marginTop: 10 }}>Step {index + 1} / {total}</p>
    </div>
  );
}

const Onboarding = () => {
  const navigate = useNavigate();
  const { signInWithEmail, user } = useAuth();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const skipAccount = searchParams.get("fromSignup") === "true";
  // Back to finish: she's signed in but her profile never got a name, because
  // signup handed her a session her browser never picked up. The account step
  // asks for the basics again, without the email field and without sending
  // anything, since she's already in.
  const resuming = searchParams.get("resume") === "true" && !!user;
  const [step, setStep] = useState(skipAccount && searchParams.get("resume") !== "true" ? 1 : 0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [age, setAge]             = useState("");
  const [city, setCity]           = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [answers, setAnswers]     = useState<Record<string, string[]>>({});
  const [exactHeight, setExactHeight]   = useState("");
  const [topSizeValue, setTopSizeValue] = useState("");
  const [topSizeMode, setTopSizeMode]   = useState<"letter" | "number">("letter");
  const [bottomSizeValue, setBottomSizeValue] = useState("");
  const [bottomSizeMode, setBottomSizeMode]   = useState<"letter" | "number">("letter");
  const [fitAnswers, setFitAnswers]     = useState<Record<string, string>>({});
  // Tapping the chosen option again clears it, so nothing is forced.
  const toggleFit = (category: string, option: string) =>
    setFitAnswers(prev => ({ ...prev, [category]: prev[category] === option ? "" : option }));
  const [authLoading, setAuthLoading]   = useState(false);
  const [quickWinPhase, setQuickWinPhase] = useState<"loading" | "ready">("loading");
  // If they arrived via an invite link, the inviter's name for the circle confirmation.
  const [circleInviter, setCircleInviter] = useState<string | null>(null);
  const [onboardingMatches, setOnboardingMatches] = useState<any[]>([]);

  // ─── City autocomplete ──────────────────────────────────────────────────────
  useEffect(() => {
    if (city.length < 2) { setCitySuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(city)}&limit=6&layer=city&layer=state`);
        const data = await res.json();
        const seen = new Set<string>(); const results: string[] = [];
        for (const f of data.features ?? []) {
          const p = f.properties;
          const label = [p.name, p.state, p.country].filter(Boolean).join(", ");
          if (!seen.has(label)) { seen.add(label); results.push(label); }
          if (results.length >= 5) break;
        }
        setCitySuggestions(results);
      } catch { setCitySuggestions([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [city]);

  // ─── Quick win: loading → ready after 2.2s ──────────────────────────────────
  useEffect(() => {
    if (current.type !== "quickwin") return;
    setQuickWinPhase("loading");
    const t = setTimeout(() => setQuickWinPhase("ready"), 2200);
    return () => clearTimeout(t);
  }, [step]);

  // ─── Quick win: ready → auto-advance to pinterest after 2.2s ───────────────
  useEffect(() => {
    if (current.type !== "quickwin" || quickWinPhase !== "ready") return;
    const t = setTimeout(() => setStep(s => s + 1), 2200);
    return () => clearTimeout(t);
  }, [quickWinPhase]);

  // ─── Pinterest: fetch top 5 matches from DB ─────────────────────────────────
  useEffect(() => {
    if (current.type !== "pinterest" || !user) return;
    if (onboardingMatches.length > 0) return; // already fetched

    const tempProfile = {
      silhouette_preference: answers["silhouette"] ?? [],
      style_aesthetics:      answers["style"]      ?? [],
      height_range: exactHeight || answers["height"]?.[0] || null,
      top_size:    topSizeValue    || null,
      bottom_size: bottomSizeValue || null,
    };

    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, silhouette_preference, style_aesthetics, height_range, top_size, bottom_size")
        .neq("id", user.id)
        .limit(100);
      if (!data || data.length === 0) return;
      const scored = data
        .map((p: any) => ({ ...p, score: Math.round(computeMatchScore(tempProfile, p).total) }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);
      setOnboardingMatches(scored);
    })();
  }, [step, user]);

  // ─── Heights within each band ───────────────────────────────────────────────
  const HEIGHT_BAND_DETAILS: Record<string, string[]> = {
    "Under 5'0\"":     ["4'6\"","4'7\"","4'8\"","4'9\"","4'10\"","4'11\""],
    "5'0\" – 5'3\"":   ["5'0\"","5'1\"","5'2\"","5'3\""],
    "5'4\" – 5'6\"":   ["5'4\"","5'5\"","5'6\""],
    "5'7\" – 5'9\"":   ["5'7\"","5'8\"","5'9\""],
    "5'10\" – 6'0\"":  ["5'10\"","5'11\"","6'0\""],
    "Over 6'0\"":      ["6'1\"","6'2\"","6'3\"","6'4\"","6'5\"+"],
  };

  const current  = STEPS[step];
  const selected = answers[current.key] || [];

  // Step number for the segmented progress bar (1–6); null for account/quickwin/pinterest
  const stepNum: number | null = (() => {
    if (current.type === "transition")   return 1;
    if (current.type === "fit")          return 2;
    if (current.key  === "height")       return 3;
    if (current.key  === "sizing_top" || current.key === "sizing_bottom") return 4;
    if (current.key  === "silhouette")   return 5;
    if (current.key  === "style")        return 6;
    return null;
  })();

  const toggleOption = (opt: string) => {
    const cur = answers[current.key] || [];
    if (current.type === "select" || current.maxSelect === 1) {
      setAnswers({ ...answers, [current.key]: [opt] });
    } else {
      const max = current.maxSelect;
      if (cur.includes(opt)) {
        setAnswers({ ...answers, [current.key]: cur.filter(x => x !== opt) });
      } else if (!max || cur.length < max) {
        setAnswers({ ...answers, [current.key]: [...cur, opt] });
      }
    }
  };

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
    || localStorage.getItem("eleven_signup_name")
    || localStorage.getItem("eleven_first_name")
    || "";

  const canContinue = () => {
    if (current.type === "account")      return !!(firstName.trim() && lastName.trim() && (resuming || email.trim()) && age.trim() && city.trim());
    if (current.type === "transition")   return true;
    if (current.type === "fit")          return true;   // every answer is optional
    if (current.type === "pinterest")    return true;
    if (current.type === "quickwin")     return true; // auto-advances, no button shown
    if (current.key === "sizing_top")    return !!topSizeValue;
    if (current.key === "sizing_bottom") return !!bottomSizeValue;
    if (current.key === "height")        return !!(selected.length > 0 && exactHeight);
    return selected.length > 0;
  };

  const saveToLocalStorage = (ua: Record<string, string[]>, ufa: Record<string, string>) => {
    localStorage.setItem("eleven_profile", JSON.stringify({
      display_name: fullName,
      age: age ? parseInt(age) : null,
      city: city || null,
      height: (exactHeight || ua["height"]?.[0]) ?? null,
      top_size: topSizeValue || null,
      bottom_size: bottomSizeValue || null,
      silhouette: ua["silhouette"] ?? [],
      style: ua["style"] ?? [],
      fit_preference: ufa["Overall fit"] ?? null,
      fit_details: ufa,
    }));
  };

  const saveProfileToDb = async (ua: Record<string, string[]>, ufa: Record<string, string>) => {
    if (!user) return;
    const d: Record<string, any> = {
      age: age ? parseInt(age) : null,
      city: city || null,
      height_range: (exactHeight || ua["height"]?.[0]) ?? null,
      top_size: topSizeValue || null,
      bottom_size: bottomSizeValue || null,
      silhouette_preference: ua["silhouette"] ?? [],
      style_aesthetics: ua["style"] ?? [],
      fit_preference: ufa["Overall fit"] ?? null,
      fit_details: ufa,
      onboarding_completed: true,
    };
    if (fullName) d.display_name = fullName;
    await supabase.from("profiles").update(d).eq("id", user.id);
  };

  const next = async () => {
    if (current.key === "account" && resuming && user) {
      setAuthLoading(true);
      await supabase.from("profiles").update({
        display_name: fullName || null,
        age: age ? parseInt(age) : null,
        city: city || null,
      }).eq("id", user.id);
      setAuthLoading(false);
      setStep(step + 1);
      return;
    }
    if (current.key === "account") {
      setAuthLoading(true);
      localStorage.setItem("eleven_first_name", fullName);
      localStorage.setItem("eleven_email", email.trim());
      localStorage.setItem("eleven_session_start", Date.now().toString());
      signInWithEmail(email.trim());
      setAuthLoading(false);
      setStep(step + 1);
      return;
    }

    let ua = answers;
    const ufa = fitAnswers;

    if (current.key === "sizing_top") {
      ua = { ...answers, sizing_top: [topSizeValue] };
      setAnswers(ua);
    }
    if (current.key === "sizing_bottom") {
      ua = { ...answers, sizing: [`Top: ${topSizeValue}`, `Bottom: ${bottomSizeValue}`] };
      setAnswers(ua);
    }

    saveToLocalStorage(ua, ufa);
    if (user) saveProfileToDb(ua, ufa);

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.removeItem("eleven_signup_name");
      // Arrived via an invite? Store the shopping-circle link, then celebrate it.
      if (user && pendingReferrer()) {
        const res = await ensureReferral(user.id);
        if (res?.inviterName) { setCircleInviter(res.inviterName); return; }
      }
      navigate("/feed");
    }
  };

  const profileSteps = STEPS.filter(s =>
    s.type !== "account" && s.type !== "transition" && s.type !== "demographics" &&
    s.type !== "quickwin" && s.type !== "pinterest"
  );
  const currentProfileIndex = profileSteps.findIndex(s => s.key === current.key);
  const progress =
    current.type === "account"      ? 0 :
    current.type === "transition"   ? 3 :
    current.type === "fit"          ? 6 :
    current.type === "quickwin" || current.type === "pinterest" ? 100 :
    ((currentProfileIndex + 1) / profileSteps.length) * 100;

  const slideVariants = {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    exit:    { opacity: 0, x: -30 },
  };

  // Pad matches to always have 5 slots (null = placeholder)
  const paddedMatches: (any | null)[] = [
    ...onboardingMatches,
    ...Array(Math.max(0, 5 - onboardingMatches.length)).fill(null),
  ];

  const tempProfile = {
    silhouette_preference: answers["silhouette"] ?? [],
    style_aesthetics:      answers["style"]      ?? [],
    height_range: exactHeight || answers["height"]?.[0] || null,
    top_size:    topSizeValue    || null,
    bottom_size: bottomSizeValue || null,
  };

  // ── Shared page type ───────────────────────────────────────────────────────
  const heading: CSSProperties = { ...display(isMobile ? "clamp(30px, 9.5vw, 40px)" : 50), marginBottom: 14 };
  const lede: CSSProperties = { ...body(isMobile ? 15 : 16, C.inkSoft), marginBottom: isMobile ? 24 : 30, maxWidth: "46ch" };
  const label: CSSProperties = { ...meta(11, C.ink), display: "block", margin: "0 0 10px" };
  // 16px on phones so iOS doesn't zoom into the field on focus.
  const field: CSSProperties = {
    width: "100%", boxSizing: "border-box", borderRadius: RADIUS, border: `1px solid ${C.rule}`, background: "#FFFFFF",
    padding: "13px 14px", fontFamily: SANS, fontSize: isMobile ? 16 : 15, lineHeight: 1.5, color: C.ink, outline: "none",
  };

  // Shopping-circle confirmation (shown after onboarding when invited by a friend).
  if (circleInviter) {
    return (
      <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
        <Masthead isMobile={isMobile} />
        <main style={{ flex: 1, width: "100%", maxWidth: 640, margin: "0 auto", boxSizing: "border-box", padding: isMobile ? "48px 20px 72px" : "80px 24px 96px" }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p style={{ ...meta(11, C.burgundy), fontWeight: 700, marginBottom: 16 }}>Shopping circle</p>
            <h1 style={heading}>You're now part of {circleInviter}'s shopping circle.</h1>
            <p style={lede}>
              Your take now helps {circleInviter} (and every woman like you) shop with more confidence.
            </p>
            <div style={{ ...hairline(), margin: isMobile ? "28px 0" : "36px 0" }} />
            <button onClick={() => navigate("/feed")} style={primaryBtn(true)}>
              Continue to feed <ArrowRight style={{ width: 16, height: 16 }} strokeWidth={2} />
            </button>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      <style>{PAGE_CSS}</style>
      <Masthead isMobile={isMobile} />

      {/* Content */}
      <div
        style={{
          flex: 1, width: "100%", maxWidth: 640, margin: "0 auto", boxSizing: "border-box",
          display: "flex", flexDirection: "column",
          justifyContent: current.type === "pinterest" ? "flex-start" : "center",
          padding: isMobile ? "26px 20px 40px" : "44px 24px 56px",
          overflowY: "auto", scrollbarWidth: "none",
        }}
      >
        {/* ─── Step marker (steps 1–6, hidden on account / quickwin / pinterest) */}
        {stepNum !== null && <StepMark index={stepNum - 1} total={TOTAL_STEPS} />}

        <AnimatePresence mode="wait">

          {/* ACCOUNT */}
          {current.type === "account" && (
            <motion.div key="account" {...slideVariants} transition={{ duration: 0.3 }}>
              <h2 style={heading}>{resuming ? "Let's finish your account" : "Let's get started"}</h2>
              <p style={lede}>Just the basics.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <input autoFocus className="ob-field" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name"
                    style={{ ...field, flex: 1, minWidth: 0 }} />
                  <input className="ob-field" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name"
                    style={{ ...field, flex: 1, minWidth: 0 }} />
                </div>
                {!resuming && (
                  <input className="ob-field" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
                    style={field} />
                )}
                <input className="ob-field" value={age} onChange={e => setAge(e.target.value.replace(/\D/g, ""))} placeholder="Age" type="text" inputMode="numeric" maxLength={3}
                  style={field} />
                <div style={{ position: "relative" }}>
                  <input className="ob-field" value={city} onChange={e => setCity(e.target.value)} placeholder="City (e.g. New York)"
                    style={field} />
                  {citySuggestions.length > 0 && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 10,
                      background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: RADIUS, overflow: "hidden",
                    }}>
                      {citySuggestions.map(c => (
                        <button key={c} type="button" className="ob-sugg" onClick={() => { setCity(c); setCitySuggestions([]); }}
                          style={{
                            width: "100%", textAlign: "left", padding: "11px 14px", background: "none",
                            border: "none", borderRadius: 0, cursor: "pointer",
                            fontFamily: SANS, fontSize: isMobile ? 16 : 15, color: C.ink,
                          }}>{c}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TRANSITION */}
          {current.type === "transition" && (
            <motion.div key="transition" {...slideVariants} transition={{ duration: 0.3 }}>
              <p style={{ ...meta(11, C.burgundy), fontWeight: 700, marginBottom: 16 }}>Your profile</p>
              <h2 style={{ ...display(isMobile ? "clamp(34px, 11vw, 46px)" : 58), marginBottom: 18 }}>
                Tell us a bit about{" "}
                <span style={{ color: C.burgundy }}>you</span>
              </h2>
              <p style={{ ...body(isMobile ? 15 : 16, C.inkSoft), maxWidth: "34ch" }}>
                So you can see what actually works before you buy anything.
              </p>
              <div style={{ ...hairline(), marginTop: isMobile ? 28 : 36 }} />
            </motion.div>
          )}

          {/* DEMOGRAPHICS */}
          {/* FIT — replaces the old duplicate age/city screen. Same questions as the
              Dial in your fit modal, asked once, here, where she is already answering. */}
          {current.type === "fit" && (
            <motion.div key="fit" {...slideVariants} transition={{ duration: 0.3 }}>
              <h2 style={heading}>Dial in your fit</h2>
              <p style={lede}>Make your matches and responses more precise in seconds.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {FIT_CATEGORIES.map((cat, ci) => (
                  <div key={cat.label} style={{ paddingTop: ci === 0 ? 0 : 22, borderTop: ci === 0 ? "none" : `1px solid ${C.rule}` }}>
                    <p style={label}>{cat.label}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {cat.options.map(opt => {
                        const active = fitAnswers[cat.label] === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => toggleFit(cat.label, opt)}
                            aria-pressed={active}
                            style={{ ...chip(active), whiteSpace: "nowrap" }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* HEIGHT */}
          {current.type === "select" && (
            <motion.div key="height" {...slideVariants} transition={{ duration: 0.3 }}>
              <h2 style={heading}>{current.title}</h2>
              {current.subtitle && <p style={lede}>{current.subtitle}</p>}

              {/* ── Height band tiles ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {HEIGHT_BANDS_ORDERED.map(band => {
                  const active = selected.includes(band);
                  return (
                    <button key={band}
                      onClick={() => { toggleOption(band); setExactHeight(""); }}
                      aria-pressed={active}
                      style={tile(active)}
                    >
                      {band}
                    </button>
                  );
                })}
              </div>

              {/* ── Exact height sub-picker ── */}
              {selected[0] && HEIGHT_BAND_DETAILS[selected[0]] && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ marginTop: 26, paddingTop: 24, borderTop: `1px solid ${C.rule}` }}
                >
                  <p style={label}>Tell us your exact height</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {HEIGHT_BAND_DETAILS[selected[0]].map(ht => {
                      const active = exactHeight === ht;
                      return (
                        <button key={ht} onClick={() => setExactHeight(ht)} aria-pressed={active} style={tile(active)}>
                          {ht}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* SIZING — 3A: Top */}
          {current.key === "sizing_top" && (
            <motion.div key="sizing_top" {...slideVariants} transition={{ duration: 0.3 }}>
              <h2 style={heading}>Top size</h2>
              <p style={lede}>What size do you usually reach for?</p>

              {/* Toggle */}
              <button
                onClick={() => { setTopSizeMode(m => m === "letter" ? "number" : "letter"); setTopSizeValue(""); }}
                style={{ ...outlineBtn, marginBottom: 20 }}
              >
                {topSizeMode === "letter" ? "Use number sizing instead" : "Use letter sizing instead"}
              </button>

              {/* Size tiles */}
              {topSizeMode === "letter" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[["XXS","XS","S","M"], ["L","XL","XXL"], ["1X","2X","3X","4X"]].map((row, ri) => (
                    <div key={ri} style={{ display: "grid", gridTemplateColumns: `repeat(${row.length === 3 ? 3 : 4}, 1fr)`, gap: 8 }}>
                      {row.map(s => {
                        const active = topSizeValue === s;
                        return (
                          <button key={s} onClick={() => setTopSizeValue(v => v === s ? "" : s)} aria-pressed={active} style={tile(active)}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {["00–0","2–4","6–8","10–12","14–16","18–20","22–24"].map(s => {
                    const active = topSizeValue === s;
                    return (
                      <button key={s} onClick={() => setTopSizeValue(v => v === s ? "" : s)} aria-pressed={active} style={tile(active)}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* SIZING — 3B: Bottom */}
          {current.key === "sizing_bottom" && (
            <motion.div key="sizing_bottom" {...slideVariants} transition={{ duration: 0.3 }}>
              <h2 style={heading}>Bottom size</h2>
              <p style={lede}>What size do you usually reach for?</p>

              {/* Toggle */}
              <button
                onClick={() => { setBottomSizeMode(m => m === "letter" ? "number" : "letter"); setBottomSizeValue(""); }}
                style={{ ...outlineBtn, marginBottom: 20 }}
              >
                {bottomSizeMode === "letter" ? "Use number sizing instead" : "Use letter sizing instead"}
              </button>

              {/* Size tiles */}
              {bottomSizeMode === "letter" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[["XXS","XS","S","M"], ["L","XL","XXL"], ["1X","2X","3X","4X"]].map((row, ri) => (
                    <div key={ri} style={{ display: "grid", gridTemplateColumns: `repeat(${row.length === 3 ? 3 : 4}, 1fr)`, gap: 8 }}>
                      {row.map(s => {
                        const active = bottomSizeValue === s;
                        return (
                          <button key={s} onClick={() => setBottomSizeValue(v => v === s ? "" : s)} aria-pressed={active} style={tile(active)}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {["00–0","2–4","6–8","10–12","14–16","18–20","22–24"].map(s => {
                    const active = bottomSizeValue === s;
                    return (
                      <button key={s} onClick={() => setBottomSizeValue(v => v === s ? "" : s)} aria-pressed={active} style={tile(active)}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* SILHOUETTE & STYLE */}
          {current.type === "image-select" && (
            <motion.div key={current.key} {...slideVariants} transition={{ duration: 0.3 }}>
              <h2 style={heading}>{current.title}</h2>
              {current.subtitle && <p style={lede}>{current.subtitle}</p>}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 10 }}>
                {current.options?.map(opt => {
                  const isSelected = selected.includes(opt.label);
                  return (
                  <button key={opt.label} onClick={() => toggleOption(opt.label)}
                    aria-pressed={isSelected}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = isSelected ? C.burgundy : C.ink; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = isSelected ? C.burgundy : C.rule; }}
                    style={{
                      borderRadius: RADIUS,
                      border: `1px solid ${isSelected ? C.burgundy : C.rule}`,
                      textAlign: "left",
                      background: "transparent",
                      cursor: "pointer",
                      transition: "border-color 0.15s",
                      display: "flex",
                      flexDirection: "column",
                      padding: 0,
                    }}>
                    <div style={{ aspectRatio: "2/3", background: C.well, overflow: "hidden", width: "100%", flexShrink: 0 }}>
                      <img src={opt.image} alt={opt.label} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%", display: "block" }} />
                    </div>
                    <div style={{ padding: "11px 12px 14px", borderTop: `1px solid ${isSelected ? C.burgundy : C.rule}` }}>
                      <p style={{ ...strong(13, isSelected ? C.burgundy : C.ink), lineHeight: 1.3 }}>{opt.label}</p>
                      {opt.desc && <p style={{ ...body(12.5, C.muted), marginTop: 5, lineHeight: 1.4 }}>{opt.desc}</p>}
                    </div>
                  </button>
                );
              })}
              </div>
            </motion.div>
          )}

          {/* QUICK WIN */}
          {current.type === "quickwin" && (
            <motion.div key="quickwin" {...slideVariants} transition={{ duration: 0.3 }}>
              <AnimatePresence mode="wait">
                {quickWinPhase === "loading" ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <h2 style={heading}>We're finding your closest matches</h2>
                    <div style={{ position: "relative", height: 2, background: C.rule, overflow: "hidden", marginTop: 8 }}>
                      <motion.div
                        style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "40%", background: C.burgundy }}
                        animate={{ x: ["-100%", "250%"] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="ready" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <h2 style={heading}>You're already matching with people similar to you</h2>
                    <div style={{ height: 2, background: C.burgundy, marginTop: 8 }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* PINTEREST — Profile complete */}
          {current.type === "pinterest" && (
            <motion.div key="pinterest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
              style={{ width: "100%" }}>

              <p style={{ ...meta(11, C.burgundy), fontWeight: 700, marginBottom: 14 }}>Profile complete</p>
              <h2 style={{ ...display(isMobile ? "clamp(44px, 15vw, 64px)" : 76), marginBottom: 16 }}>
                You're in.
              </h2>
              <p style={{ ...body(isMobile ? 15 : 16, C.inkSoft), maxWidth: "40ch" }}>
                We've matched you with women who share your fit, size, and style.
              </p>
              <p style={{ ...strong(15), marginTop: 6 }}>Your feed is ready.</p>

              <div style={{ ...hairline(), margin: isMobile ? "26px 0" : "32px 0" }} />

              {/* ── Fan of match cards ── */}
              <div style={{ position: "relative", width: "100%", maxWidth: 370, height: 215, margin: "0 auto 30px", overflow: "visible" }}>
                {paddedMatches.map((m, i) => {
                  const cfg = FAN_CONFIG[i];
                  const initial = m ? (m.display_name?.trim() || "?")[0].toUpperCase() : "?";
                  const label   = m ? getMatchLabel(tempProfile, m) : null;

                  return (
                    <motion.div key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07, duration: 0.4 }}
                      title={label ?? undefined}
                      style={{
                        position: "absolute",
                        left: cfg.left,
                        top: cfg.y,
                        width: 110,
                        height: 180,
                        borderRadius: 0,
                        overflow: "hidden",
                        background: C.well,
                        border: `1px solid ${C.rule}`,
                        boxSizing: "border-box",
                        transform: `rotate(${cfg.rotate}deg) scale(${cfg.scale})`,
                        transformOrigin: "bottom center",
                        zIndex: cfg.zIndex,
                        flexShrink: 0,
                      }}
                    >
                      {/* Photo or placeholder */}
                      {m?.avatar_url ? (
                        <img src={m.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 }}>
                          <span style={{ ...display(26, C.faint) }}>{initial}</span>
                          {m?.display_name && (
                            <p style={{ ...meta(9.5, C.muted), textAlign: "center", lineHeight: 1.3 }}>
                              {m.display_name.split(" ")[0]}
                            </p>
                          )}
                        </div>
                      )}

                    </motion.div>
                  );
                })}
              </div>

              {/* CTA */}
              <button onClick={next} style={primaryBtn(true)}>
                Go to my feed
                <ArrowRight style={{ width: 16, height: 16 }} strokeWidth={2} />
              </button>

              {/* Welcome-email confirmation */}
              <p style={{ ...body(13, C.muted), marginTop: 16, textAlign: "center" }}>
                We just sent a welcome to your inbox. Check spam or promotions if you don't see it.
              </p>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Bottom — hidden on quickwin (auto-advances) and pinterest (CTA is inline) */}
        {current.type !== "quickwin" && current.type !== "pinterest" && (
          <div style={{ marginTop: 36 }}>
            <button onClick={next} disabled={!canContinue() || authLoading} style={primaryBtn(canContinue() && !authLoading)}>
              {authLoading ? "Sending..." : current.type === "transition" ? "Get started" : "Continue"}
            </button>
            {step > 0 && current.type !== "transition" && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
                <button onClick={() => setStep(step - 1)} style={textLink(C.muted)}>
                  ← Back
                </button>
              </div>
            )}
            {/* Privacy note — shown on all onboarding screens */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 20 }}>
              <Lock style={{ width: 11, height: 11, color: C.faint }} strokeWidth={2} />
              <span style={meta(10, C.muted)}>We keep your info private</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
