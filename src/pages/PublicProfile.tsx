import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { computeMatchScore } from "@/lib/matching";
import { SILHOUETTE_OPTIONS, STYLE_OPTIONS } from "@/components/onboarding/OnboardingData";
import heroEditorial from "@/assets/hero-editorial.png";

const MUTED    = "#8C7A70";
const SECONDARY= "#5A4A42";
const PRIMARY  = "#1A1A1A";
const CARD_BG  = "#F5EFEA";
const DIVIDER  = "rgba(0,0,0,0.07)";
const PILL_BG  = "rgba(0,0,0,0.05)";
const PILL_BDR = "rgba(0,0,0,0.09)";

function getBadge(v: number) {
  if (v >= 50) return "Top Voice";
  if (v >= 25) return "Trusted Voice";
  if (v >= 5)  return "Contributor";
  return "";
}

const PublicProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  const [profile, setProfile]   = useState<any>(null);
  const [stats, setStats]       = useState({ decisions: 0, responses: 0, helpfulVotes: 0 });
  const [fitPhotos, setFitPhotos] = useState<string[]>([]);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [loading, setLoading]   = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchData();
  }, [userId, user]);

  const fetchData = async () => {
    // Fetch the viewed profile
    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!prof) { setLoading(false); return; }
    setProfile(prof);

    const storedPhotos = prof.fit_details?._fit_photos ?? prof.fit_photo_urls ?? [];
    setFitPhotos(Array.isArray(storedPhotos) ? storedPhotos : []);

    // Stats
    const [{ count: dCount }, { count: rCount }, { data: votes }] = await Promise.all([
      supabase.from("decisions").select("*", { count: "exact", head: true }).eq("user_id", userId!).is("deleted_at", null),
      supabase.from("responses").select("*", { count: "exact", head: true }).eq("user_id", userId!),
      supabase.from("responses").select("helpfulness_votes").eq("user_id", userId!),
    ]);
    const totalVotes = (votes ?? []).reduce((s: number, r: any) => s + (r.helpfulness_votes ?? 0), 0);
    setStats({ decisions: dCount ?? 0, responses: rCount ?? 0, helpfulVotes: totalVotes });

    // Compute match score if viewer is logged in
    if (user && user.id !== userId) {
      const { data: myProf } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (myProf && prof) {
        const result = computeMatchScore(myProf, prof);
        setMatchScore(Math.round(result.total));
      }
    }

    setLoading(false);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#ECE7DF", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "rgba(28,23,18,0.4)", fontSize: 13 }}>Loading...</p>
    </div>
  );

  if (!profile) return (
    <div style={{ minHeight: "100vh", background: "#ECE7DF", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "rgba(28,23,18,0.4)", fontSize: 13 }}>Profile not found.</p>
    </div>
  );

  const name     = profile.display_name?.trim() || "Anonymous";
  const initial  = name[0].toUpperCase();
  const badge    = getBadge(stats.helpfulVotes);
  const rawSil   = profile.silhouette_preference;
  const silLabel = Array.isArray(rawSil) ? rawSil[0] : (typeof rawSil === "string" ? rawSil : null);
  const sil      = SILHOUETTE_OPTIONS.find(s => s.label === silLabel);
  const avgHelp  = stats.responses > 0 ? Math.min(5, stats.helpfulVotes / stats.responses).toFixed(1) : null;

  const AVERAGE_TERMS = ["average", "about average", "typical", "standard", "normal", "medium", "moderate"];
  const isAverage = (v: string) => AVERAGE_TERMS.some(t => v.toLowerCase().includes(t));
  const fitDetails = profile.fit_details as Record<string, string> | null;
  const notableFit = fitDetails
    ? Object.entries(fitDetails).filter(([k, v]) => v && k !== "Overall fit" && !k.startsWith("_") && !isAverage(v)).map(([, v]) => v)
    : [];
  const allTags = [
    profile.fit_preference && !isAverage(profile.fit_preference) ? profile.fit_preference : null,
    ...notableFit,
  ].filter(Boolean) as string[];

  return (
    <div style={{ minHeight: "100vh", position: "relative", background: "#ECE7DF" }}>

      {/* Background */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }}>
        <img src={heroEditorial} aria-hidden alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "60% center", filter: "brightness(1.08) saturate(0.85)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(240,236,230,0.18) 0%, rgba(240,236,230,0.62) 22%, rgba(240,236,230,0.72) 38%, rgba(240,236,230,0.72) 62%, rgba(240,236,230,0.62) 78%, rgba(240,236,230,0.18) 100%)" }} />
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div onClick={() => setLightboxIdx(null)}
          style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={fitPhotos[lightboxIdx]} alt="" onClick={e => e.stopPropagation()}
            style={{ maxHeight: "88vh", maxWidth: "88vw", objectFit: "contain", borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }} />
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Nav */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 32px" }}>
          <button onClick={() => navigate(-1)}
            style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(28,23,18,0.55)", background: "none", border: "none", cursor: "pointer" }}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
            <span style={{ fontSize: 13 }}>Back</span>
          </button>
          <span style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(28,23,18,0.38)" }}>Profile</span>
          <div style={{ width: 60 }} />
        </header>

        <div style={{ maxWidth: 680, margin: "0 auto", padding: "8px 28px 80px" }}>

          {/* ── Card 1: Identity ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: CARD_BG, borderRadius: 20, overflow: "hidden", marginBottom: 12 }}>

            <div style={{ padding: "32px 36px 28px", display: "flex", gap: 24, alignItems: "flex-start" }}>
              {/* Avatar */}
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: "#3A3530", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 700, color: "white", overflow: "hidden", flexShrink: 0 }}>
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : initial}
              </div>

              {/* Identity */}
              <div style={{ paddingTop: 8 }}>
                {badge && (
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8E3A3A", borderBottom: "1px solid #8E3A3A", paddingBottom: 1, display: "inline-block", marginBottom: 8 }}>
                    {badge}
                  </p>
                )}
                <h1 style={{ fontSize: 30, fontWeight: 700, color: PRIMARY, lineHeight: 1.05, margin: 0, marginBottom: 6 }}>{name}</h1>
                {(profile.age || profile.city) && (
                  <p style={{ fontSize: 14, color: MUTED }}>
                    {[profile.age, profile.city?.split(",")[0]].filter(Boolean).join(" · ")}
                  </p>
                )}

                {/* Match score badge */}
                {matchScore !== null && (
                  <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 5,
                    background: "linear-gradient(135deg, #C4A47A 0%, #B8956A 50%, #A07848 100%)",
                    border: "1px solid rgba(220,185,130,0.60)",
                    borderRadius: 100, padding: "6px 16px",
                    boxShadow: "0 0 12px rgba(184,149,106,0.55), 0 0 28px rgba(184,149,106,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
                  }}>
                    <span style={{ fontSize: 13, color: "#FDFAF6", fontWeight: 700, letterSpacing: "0.04em" }}>✦ {matchScore}% match</span>
                  </div>
                )}
              </div>
            </div>

            {/* Fit photos */}
            {fitPhotos.length > 0 && (
              <div style={{ padding: "0 36px 28px", borderTop: `1px solid ${DIVIDER}`, paddingTop: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: SECONDARY, marginBottom: 12 }}>you, IRL</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {fitPhotos.map((url, i) => (
                    <button key={i} onClick={() => setLightboxIdx(i)}
                      style={{ width: 130, height: 172, borderRadius: 14, overflow: "hidden", border: "none", cursor: "zoom-in", padding: 0, flexShrink: 0 }}>
                      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* ── Card 2: Stats ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            style={{ background: CARD_BG, borderRadius: 20, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${DIVIDER}` }}>
              {[
                { value: stats.decisions, label: "Decisions\nposted" },
                { value: stats.responses, label: "Takes\ngiven" },
                { value: stats.helpfulVotes, label: "Marked\nhelpful" },
              ].map(({ value, label }, i) => (
                <div key={label} style={{ flex: 1, textAlign: "center", padding: "24px 16px", borderRight: i < 2 ? `1px solid ${DIVIDER}` : "none" }}>
                  <p style={{ fontSize: 32, fontWeight: 700, color: PRIMARY, lineHeight: 1, marginBottom: 6 }}>{value}</p>
                  <p style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.5, whiteSpace: "pre-line" }}>{label}</p>
                </div>
              ))}
            </div>
            {avgHelp && (
              <div style={{ padding: "16px 24px" }}>
                <p style={{ fontSize: 13, color: SECONDARY }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: PRIMARY }}>{avgHelp}</span>
                  <span style={{ color: MUTED }}> / 5 avg helpfulness · {stats.responses} response{stats.responses !== 1 ? "s" : ""}</span>
                </p>
              </div>
            )}
          </motion.div>

          {/* ── Card 3: Fit profile ── */}
          {sil && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}
              style={{ background: CARD_BG, borderRadius: 20, marginBottom: 12, padding: "28px 28px 24px" }}>
              <p style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTED, marginBottom: 20 }}>Fit profile</p>
              <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 16 }}>
                <img src={sil.image} alt={sil.label}
                  style={{ width: 76, height: 100, objectFit: "cover", objectPosition: "top", borderRadius: 12, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: PRIMARY, lineHeight: 1.1, marginBottom: 4 }}>{sil.label}</p>
                  <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{sil.desc}</p>
                </div>
              </div>

              {(profile.height_range || profile.top_size || profile.bottom_size) && (
                <div style={{ display: "flex", borderTop: `1px solid ${DIVIDER}`, borderBottom: `1px solid ${DIVIDER}`, marginBottom: 14 }}>
                  {[
                    profile.height_range && { label: "Height", value: profile.height_range },
                    profile.top_size     && { label: "Top size", value: profile.top_size },
                    profile.bottom_size  && { label: "Bottom size", value: profile.bottom_size },
                  ].filter(Boolean).map((item: any, i, arr) => (
                    <div key={item.label} style={{ flex: 1, padding: "12px 14px", borderRight: i < arr.length - 1 ? `1px solid ${DIVIDER}` : "none" }}>
                      <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, marginBottom: 4 }}>{item.label}</p>
                      <p style={{ fontSize: 14, fontWeight: 600, color: PRIMARY }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {allTags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {allTags.map((tag, i) => (
                    <span key={i} style={{ fontSize: 12, color: SECONDARY, background: PILL_BG, border: `1px solid ${PILL_BDR}`, borderRadius: 100, padding: "5px 13px" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Card 4: Aesthetic ── */}
          {(profile.style_aesthetics?.length ?? 0) > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
              style={{ background: CARD_BG, borderRadius: 20, padding: "28px 28px 24px" }}>
              <p style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTED, marginBottom: 20 }}>Aesthetic</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {profile.style_aesthetics.map((label: string) => {
                  const opt = STYLE_OPTIONS.find((s: any) => s.label === label);
                  return opt ? (
                    <div key={label} style={{ borderRadius: 14, overflow: "hidden", position: "relative" }}>
                      <img src={opt.image} alt={label} style={{ width: "100%", height: 200, objectFit: "cover", objectPosition: "top", display: "block" }} />
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 10px 10px", background: "linear-gradient(to top, rgba(0,0,0,0.58), transparent)" }}>
                        <p style={{ fontSize: 12, color: "white", fontWeight: 700, textAlign: "center", letterSpacing: "0.05em" }}>{label}</p>
                      </div>
                    </div>
                  ) : null;
                })}
              </div>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
};

export default PublicProfile;
