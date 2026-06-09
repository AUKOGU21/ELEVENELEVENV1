import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight, Lock, Calendar, MapPin } from "lucide-react";
import { STEPS, SIZE_OPTIONS } from "@/components/onboarding/OnboardingData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { computeMatchScore } from "@/lib/matching";

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

// ─── Height visualization constants ──────────────────────────────────────────
const TOTAL_STEPS = 6;
const HEIGHT_BANDS_ORDERED = [
  "Under 5'0\"",
  "5'0\" – 5'3\"",
  "5'4\" – 5'6\"",
  "5'7\" – 5'9\"",
  "5'10\" – 6'0\"",
  "Over 6'0\"",
];
// 5 female silhouettes — UNIFORM scaling (viewBox 80×360, ratio 1∶4.5)
const SILHOUETTE_SIZES = [
  { w: 20, h: 90  },   // very short
  { w: 24, h: 108 },   // short
  { w: 28, h: 126 },   // medium
  { w: 32, h: 144 },   // tall
  { w: 36, h: 162 },   // very tall
];

// 6 height bands → 5 silhouette indices
const BAND_TO_SIL_IDX: Record<string, number> = {
  "Under 5'0\"":    0,
  "5'0\" – 5'3\"":  1,
  "5'4\" – 5'6\"":  2,
  "5'7\" – 5'9\"":  3,
  "5'10\" – 6'0\"": 4,
  "Over 6'0\"":     4,
};

// ─── Component ────────────────────────────────────────────────────────────────
const Onboarding = () => {
  const navigate = useNavigate();
  const { signInWithEmail, user } = useAuth();
  const [searchParams] = useSearchParams();
  const skipAccount = searchParams.get("fromSignup") === "true";
  const [step, setStep] = useState(skipAccount ? 1 : 0);
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
  const [authLoading, setAuthLoading]   = useState(false);
  const [quickWinPhase, setQuickWinPhase] = useState<"loading" | "ready">("loading");
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
    if (current.type === "demographics") return 2;
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
    if (current.type === "account")      return !!(firstName.trim() && lastName.trim() && email.trim() && age.trim() && city.trim());
    if (current.type === "transition")   return true;
    if (current.type === "demographics") return !!age.trim();
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
    current.type === "demographics" ? 6 :
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ─── Segmented progress bar (steps 1–6, hidden on account / quickwin / pinterest) */}
      {stepNum !== null && (
        <div className="flex gap-1 px-4 pt-3">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 999,
                background: i < stepNum! ? "#C49E64" : "rgba(196,158,100,0.18)",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>
      )}

      {/* Header / logo */}
      <div className="flex items-center justify-between px-6 py-3">
        <span className="font-sans text-lg tracking-widest text-foreground">ELEVENELEVEN</span>
        {stepNum !== null && (
          <span className="text-base text-muted-foreground tracking-wider">
            Step {stepNum} of {TOTAL_STEPS}
          </span>
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 flex flex-col px-6 max-w-3xl mx-auto w-full overflow-y-auto
        ${current.type === "pinterest" ? "justify-start pt-4 pb-8" : "justify-center pb-12"}`}
        style={{ scrollbarWidth: "none" }}>
        <AnimatePresence mode="wait">

          {/* ACCOUNT */}
          {current.type === "account" && (
            <motion.div key="account" {...slideVariants} transition={{ duration: 0.3 }}>
              <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-2">Let's get started</h2>
              <p className="text-muted-foreground text-base mb-8">Just the basics.</p>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <input autoFocus value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name"
                    className="flex-1 px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent" />
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name"
                    className="flex-1 px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent" />
                </div>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent" />
                <input value={age} onChange={e => setAge(e.target.value.replace(/\D/g, ""))} placeholder="Age" type="text" inputMode="numeric" maxLength={3}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent" />
                <div className="relative">
                  <input value={city} onChange={e => setCity(e.target.value)} placeholder="City (e.g. New York)"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent" />
                  {citySuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl overflow-hidden shadow-lg z-10">
                      {citySuggestions.map(c => (
                        <button key={c} type="button" onClick={() => { setCity(c); setCitySuggestions([]); }}
                          className="w-full text-left px-4 py-2.5 text-base text-foreground hover:bg-muted transition-colors">{c}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TRANSITION */}
          {current.type === "transition" && (
            <motion.div key="transition" {...slideVariants} transition={{ duration: 0.3 }} className="text-center flex flex-col items-center" style={{ marginTop: -32 }}>

              {/* Faint full-background topo lines (top-left decorative) */}
              <svg
                viewBox="0 0 320 280"
                style={{
                  position: "absolute", top: 0, left: 0, width: "60%", maxWidth: 320,
                  pointerEvents: "none", opacity: 0.55, zIndex: 0,
                }}
                fill="none"
              >
                {[40,70,100,130,160,190,220,255].map((r, i) => (
                  <ellipse key={i} cx="0" cy="0" rx={r * 1.35} ry={r}
                    stroke="rgba(196,158,100,0.22)" strokeWidth="0.8"
                    transform={`translate(0, 0)`}
                  />
                ))}
              </svg>

              {/* Glowing orb — pulsating */}
              <div style={{
                position: "relative", zIndex: 1,
                width: 160, height: 160, marginBottom: 40,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <motion.div
                  animate={{ scale: [1, 1.18, 1], opacity: [0.85, 1, 0.85] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    position: "absolute", inset: 0,
                    borderRadius: "50%",
                    background: "radial-gradient(ellipse at center, rgba(196,158,100,0.72) 0%, rgba(196,158,100,0.38) 28%, rgba(196,158,100,0.14) 55%, transparent 75%)",
                    filter: "blur(18px)",
                  }}
                />
                <motion.div
                  animate={{ scale: [1, 1.25, 1], opacity: [0.9, 1, 0.9] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
                  style={{
                    position: "absolute", inset: "30%",
                    borderRadius: "50%",
                    background: "radial-gradient(ellipse at center, rgba(220,185,130,0.9) 0%, rgba(196,158,100,0.5) 50%, transparent 80%)",
                    filter: "blur(6px)",
                  }}
                />
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#3a2810",
                  position: "relative", zIndex: 2,
                }} />
              </div>

              {/* Title with "you" in gold */}
              <h2
                className="font-sans font-light text-foreground mb-5"
                style={{ fontSize: "clamp(2rem, 8vw, 2.5rem)", lineHeight: 1.15, zIndex: 1, position: "relative" }}
              >
                Tell us a bit about{" "}
                <span style={{ color: "#C49E64" }}>you</span>
              </h2>

              <p className="text-muted-foreground text-base" style={{ zIndex: 1, position: "relative", maxWidth: 280 }}>
                So you can see what actually works before you buy anything.
              </p>
            </motion.div>
          )}

          {/* DEMOGRAPHICS */}
          {current.type === "demographics" && (
            <motion.div key="demographics" {...slideVariants} transition={{ duration: 0.3 }}>

              {/* Topographic circle graphic */}
              <div className="flex justify-center mb-8">
                <svg viewBox="0 0 160 160" width="130" height="130" style={{ overflow: "visible" }}>
                  <circle cx="80" cy="80" r="76" fill="rgba(196,158,100,0.07)" />
                  <ellipse cx="80" cy="80" rx="70" ry="62" fill="none" stroke="rgba(196,158,100,0.12)" strokeWidth="0.9"/>
                  <ellipse cx="80" cy="80" rx="60" ry="53" fill="none" stroke="rgba(196,158,100,0.17)" strokeWidth="0.9"/>
                  <ellipse cx="80" cy="80" rx="50" ry="44" fill="none" stroke="rgba(196,158,100,0.22)" strokeWidth="0.9"/>
                  <ellipse cx="80" cy="80" rx="40" ry="35" fill="none" stroke="rgba(196,158,100,0.27)" strokeWidth="0.9"/>
                  <ellipse cx="80" cy="80" rx="30" ry="26" fill="none" stroke="rgba(196,158,100,0.32)" strokeWidth="0.9"/>
                  <ellipse cx="80" cy="80" rx="20" ry="17" fill="none" stroke="rgba(196,158,100,0.38)" strokeWidth="0.9"/>
                  <ellipse cx="80" cy="80" rx="11" ry="9" fill="none" stroke="rgba(196,158,100,0.44)" strokeWidth="0.9"/>
                  <circle cx="80" cy="80" r="2.5" fill="rgba(92,61,30,0.65)" />
                </svg>
              </div>

              <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-2 text-center">Add a little context</h2>
              <p className="text-muted-foreground text-base mb-8 text-center">Helps us fine tune your matches</p>

              <div className="space-y-5">
                {/* Age field */}
                <div>
                  <label className="block text-base font-semibold tracking-widest text-muted-foreground uppercase mb-2">Age</label>
                  <div className="relative">
                    <input
                      autoFocus
                      value={age}
                      onChange={e => setAge(e.target.value.replace(/\D/g, ""))}
                      placeholder="Your age"
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      className="w-full px-4 py-4 pr-12 rounded-2xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#C49E64] transition-colors"
                    />
                    <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" style={{ width: 17, height: 17 }} />
                  </div>
                </div>

                {/* Location field */}
                <div>
                  <label className="block text-base font-semibold tracking-widest text-muted-foreground uppercase mb-2">Location</label>
                  <div className="relative">
                    <input
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      placeholder="City (optional)"
                      className="w-full px-4 py-4 pr-12 rounded-2xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#C49E64] transition-colors"
                    />
                    <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" style={{ width: 17, height: 17 }} />
                    {citySuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl overflow-hidden shadow-lg z-10">
                        {citySuggestions.map(c => (
                          <button key={c} type="button" onClick={() => { setCity(c); setCitySuggestions([]); }}
                            className="w-full text-left px-4 py-2.5 text-base text-foreground hover:bg-muted transition-colors">{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* HEIGHT — abstract icon height picker */}
          {current.type === "select" && (
            <motion.div key="height" {...slideVariants} transition={{ duration: 0.3 }}>
              <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-2 text-center">
                {current.title}
              </h2>

              {/* ── Height band tiles ── */}
              <div className="grid grid-cols-2 gap-3 mt-6 mb-6">
                {HEIGHT_BANDS_ORDERED.map(band => {
                  const active = selected.includes(band);
                  return (
                    <button key={band}
                      onClick={() => { toggleOption(band); setExactHeight(""); }}
                      className="relative flex items-center justify-center rounded-xl border text-base font-medium transition-all duration-200 py-4 px-3"
                      style={{
                        background: active ? "rgba(196,158,100,0.13)" : "hsl(var(--background))",
                        borderColor: active ? "#C49E64" : "hsl(var(--border))",
                        color: "hsl(var(--foreground))",
                      }}
                    >
                      {band}
                      {active && (
                        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#5C3D1E" }}>
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      )}
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
                  className="mb-4"
                >
                  <p className="text-base font-medium text-foreground mb-3">Tell us your exact height</p>
                  <div className="grid grid-cols-3 gap-2">
                    {HEIGHT_BAND_DETAILS[selected[0]].map(ht => {
                      const active = exactHeight === ht;
                      return (
                        <button key={ht} onClick={() => setExactHeight(ht)}
                          className="relative flex items-center justify-center rounded-xl border text-base font-medium transition-all duration-200 py-3"
                          style={{
                            background: active ? "rgba(196,158,100,0.13)" : "hsl(var(--background))",
                            borderColor: active ? "#C49E64" : "hsl(var(--border))",
                            color: "hsl(var(--foreground))",
                          }}
                        >
                          {ht}
                          {active && (
                            <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#5C3D1E" }}>
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                          )}
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
              <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-1 text-center">Top size</h2>
              <p className="text-muted-foreground text-base mb-5 text-center">What size do you usually reach for?</p>

              {/* Toggle */}
              <button
                onClick={() => { setTopSizeMode(m => m === "letter" ? "number" : "letter"); setTopSizeValue(""); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-background text-base font-medium text-foreground hover:bg-muted/60 transition-colors mb-5"
              >
                {topSizeMode === "letter" ? "Use number sizing instead" : "Use letter sizing instead"}
                <span style={{ fontSize: 15 }}>⇄</span>
              </button>

              {/* Size tiles */}
              {topSizeMode === "letter" ? (
                <div className="flex flex-col gap-3 mb-6">
                  {[["XXS","XS","S","M"], ["L","XL","XXL"], ["1X","2X","3X","4X"]].map((row, ri) => (
                    <div key={ri} className={`grid gap-3 ${row.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
                      {row.map(s => {
                        const active = topSizeValue === s;
                        return (
                          <button key={s} onClick={() => setTopSizeValue(v => v === s ? "" : s)}
                            className="relative flex items-center justify-center rounded-xl border text-base font-medium transition-all duration-200 py-4"
                            style={{
                              background: active ? "rgba(196,158,100,0.13)" : "hsl(var(--background))",
                              borderColor: active ? "#C49E64" : "hsl(var(--border))",
                              color: "hsl(var(--foreground))",
                            }}
                          >
                            {s}
                            {active && (
                              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#5C3D1E" }}>
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {["00–0","2–4","6–8","10–12","14–16","18–20","22–24"].map(s => {
                    const active = topSizeValue === s;
                    return (
                      <button key={s} onClick={() => setTopSizeValue(v => v === s ? "" : s)}
                        className="relative flex items-center justify-center rounded-xl border text-base font-medium transition-all duration-200 py-4"
                        style={{
                          background: active ? "rgba(196,158,100,0.13)" : "hsl(var(--background))",
                          borderColor: active ? "#C49E64" : "hsl(var(--border))",
                          color: "hsl(var(--foreground))",
                        }}
                      >
                        {s}
                        {active && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#5C3D1E" }}>
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        )}
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
              <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-1 text-center">Bottom size</h2>
              <p className="text-muted-foreground text-base mb-5 text-center">What size do you usually reach for?</p>

              {/* Toggle */}
              <button
                onClick={() => { setBottomSizeMode(m => m === "letter" ? "number" : "letter"); setBottomSizeValue(""); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-background text-base font-medium text-foreground hover:bg-muted/60 transition-colors mb-5"
              >
                {bottomSizeMode === "letter" ? "Use number sizing instead" : "Use letter sizing instead"}
                <span style={{ fontSize: 15 }}>⇄</span>
              </button>

              {/* Size tiles */}
              {bottomSizeMode === "letter" ? (
                <div className="flex flex-col gap-3 mb-6">
                  {[["XXS","XS","S","M"], ["L","XL","XXL"], ["1X","2X","3X","4X"]].map((row, ri) => (
                    <div key={ri} className={`grid gap-3 ${row.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
                      {row.map(s => {
                        const active = bottomSizeValue === s;
                        return (
                          <button key={s} onClick={() => setBottomSizeValue(v => v === s ? "" : s)}
                            className="relative flex items-center justify-center rounded-xl border text-base font-medium transition-all duration-200 py-4"
                            style={{
                              background: active ? "rgba(196,158,100,0.13)" : "hsl(var(--background))",
                              borderColor: active ? "#C49E64" : "hsl(var(--border))",
                              color: "hsl(var(--foreground))",
                            }}
                          >
                            {s}
                            {active && (
                              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#5C3D1E" }}>
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {["00–0","2–4","6–8","10–12","14–16","18–20","22–24"].map(s => {
                    const active = bottomSizeValue === s;
                    return (
                      <button key={s} onClick={() => setBottomSizeValue(v => v === s ? "" : s)}
                        className="relative flex items-center justify-center rounded-xl border text-base font-medium transition-all duration-200 py-4"
                        style={{
                          background: active ? "rgba(196,158,100,0.13)" : "hsl(var(--background))",
                          borderColor: active ? "#C49E64" : "hsl(var(--border))",
                          color: "hsl(var(--foreground))",
                        }}
                      >
                        {s}
                        {active && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#5C3D1E" }}>
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        )}
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
              <h2 className="font-sans text-3xl md:text-4xl font-light text-foreground mb-2">{current.title}</h2>
              <p className="text-muted-foreground text-base mb-6">{current.subtitle}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {current.options?.map(opt => {
                  const isSelected = selected.includes(opt.label);
                  return (
                  <button key={opt.label} onClick={() => toggleOption(opt.label)}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = "#C49E64";
                      e.currentTarget.style.transform = "scale(1.04)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = isSelected ? "#C49E64" : "var(--border)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                    style={{
                      borderRadius: 16,
                      border: `2px solid ${isSelected ? "#C49E64" : "var(--border)"}`,
                      textAlign: "left",
                      background: "var(--card)",
                      cursor: "pointer",
                      transition: "border-color 0.15s, transform 0.15s",
                      display: "flex",
                      flexDirection: "column",
                      padding: 0,
                    }}>
                    <div style={{ aspectRatio: "2/3", background: "var(--muted)", overflow: "hidden", width: "100%", flexShrink: 0, borderRadius: "14px 14px 0 0" }}>
                      <img src={opt.image} alt={opt.label} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%", display: "block" }} />
                    </div>
                    <div style={{ padding: "10px 12px 14px" }}>
                      <p style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3, margin: 0, textTransform: "lowercase" }}>{opt.label}</p>
                      {opt.desc && <p style={{ fontSize: 15, color: "var(--muted-foreground)", marginTop: 5, lineHeight: 1.4, textTransform: "lowercase" }}>{opt.desc}</p>}
                    </div>
                  </button>
                );
              })}
              </div>
            </motion.div>
          )}

          {/* QUICK WIN */}
          {current.type === "quickwin" && (
            <motion.div key="quickwin" {...slideVariants} transition={{ duration: 0.3 }} className="text-center">
              <AnimatePresence mode="wait">
                {quickWinPhase === "loading" ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="font-sans text-2xl md:text-3xl font-light text-foreground mb-10">
                      We're finding your closest matches
                    </p>
                    <div className="flex gap-3 justify-center">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-2.5 h-2.5 rounded-full bg-foreground"
                          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.15, 0.8] }}
                          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }} />
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="ready" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <p className="font-sans text-2xl md:text-3xl font-light text-foreground mb-10">
                      You're already matching with<br />people similar to you
                    </p>
                    <div className="flex gap-3 justify-center">
                      {[0, 1, 2].map(i => (
                        <motion.div key={i} className="w-2.5 h-2.5 rounded-full bg-foreground"
                          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.15, 0.8] }}
                          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* PINTEREST — Profile complete */}
          {current.type === "pinterest" && (
            <motion.div key="pinterest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
              className="text-center w-full">

              {/* Checkmark icon */}
              <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
                <span style={{ position: "absolute", top: -10, left: -18, fontSize: 15, color: "rgba(184,149,106,0.75)", pointerEvents: "none" }}>✦</span>
                <span style={{ position: "absolute", top: -14, right: -6, fontSize: 16,  color: "rgba(184,149,106,0.55)", pointerEvents: "none" }}>+</span>
                <span style={{ position: "absolute", bottom: -6, right: -20, fontSize: 16, color: "rgba(184,149,106,0.70)", pointerEvents: "none" }}>✦</span>
                <div style={{ width: 54, height: 54, borderRadius: "50%", border: "1.5px solid #B8956A", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
                  <Check style={{ width: 22, height: 22, color: "#B8956A" }} />
                </div>
              </div>

              {/* Heading */}
              <p className="text-base tracking-widest uppercase text-muted-foreground mb-3">Profile complete</p>
              <h2 className="font-sans font-light text-foreground" style={{ fontSize: "clamp(2.4rem, 8vw, 3rem)", lineHeight: 1.1, marginBottom: 14 }}>
                You're in.
              </h2>
              <p className="text-muted-foreground text-base leading-relaxed mb-1">
                We've matched you with women who share your fit, size, and style.
              </p>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#8E3A3A", marginBottom: 28 }}>Your feed is ready.</p>

              {/* ── Fan of match cards ── */}
              <div style={{ position: "relative", width: "100%", maxWidth: 370, height: 215, margin: "0 auto 28px", overflow: "visible" }}>
                {paddedMatches.map((m, i) => {
                  const cfg = FAN_CONFIG[i];
                  const initial = m ? (m.display_name?.trim() || "?")[0].toUpperCase() : "?";
                  const label   = m ? getMatchLabel(tempProfile, m) : null;
                  const isCenter = i === 2;

                  return (
                    <motion.div key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07, duration: 0.4 }}
                      style={{
                        position: "absolute",
                        left: cfg.left,
                        top: cfg.y,
                        width: 110,
                        height: 180,
                        borderRadius: 16,
                        overflow: "hidden",
                        background: m?.avatar_url ? "transparent" : `hsl(${20 + i * 18}, 22%, ${82 - i * 3}%)`,
                        boxShadow: isCenter ? "0 10px 36px rgba(0,0,0,0.20)" : "0 4px 14px rgba(0,0,0,0.11)",
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
                        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 12 }}>
                          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "rgba(0,0,0,0.45)" }}>
                            {initial}
                          </div>
                          {m?.display_name && (
                            <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(0,0,0,0.45)", textAlign: "center", lineHeight: 1.3 }}>
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
              <button onClick={next}
                style={{ width: "100%", padding: "16px 0", borderRadius: 100, background: "#1C1712", color: "#FDFAF6", border: "none", cursor: "pointer", fontSize: 16, letterSpacing: "0.22em", textTransform: "uppercase" as const, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                Go to my feed
                <ArrowRight style={{ width: 14, height: 14 }} />
              </button>

              {/* Welcome-email confirmation */}
              <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.5, color: "rgba(120,105,88,0.75)", textAlign: "center" }}>
                ✉️ we just sent a welcome to your inbox — check spam or promotions if you don't see it.
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Bottom — hidden on quickwin (auto-advances) and pinterest (CTA is inline) */}
      {current.type !== "quickwin" && current.type !== "pinterest" && (
        <div className="px-6 pb-8 max-w-3xl mx-auto w-full">
          <button onClick={next} disabled={!canContinue() || authLoading}
            className="w-full py-4 rounded-full bg-secondary text-secondary-foreground text-base tracking-widest uppercase font-medium disabled:opacity-30 transition-all hover:bg-secondary/90">
            {authLoading ? "Sending..." : current.type === "transition" ? "Get started" : "Continue"}
          </button>
          {step > 0 && current.type !== "transition" && (
            <button onClick={() => setStep(step - 1)}
              className="w-full mt-3 text-center text-base text-muted-foreground hover:text-foreground transition-colors">
              Back
            </button>
          )}
          {/* Privacy note — shown on all onboarding screens */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            <Lock style={{ width: 11, height: 11, color: "rgba(120,105,88,0.45)" }} />
            <span style={{ fontSize: 15, color: "rgba(120,105,88,0.45)", letterSpacing: "0.03em" }}>
              We keep your info private
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
