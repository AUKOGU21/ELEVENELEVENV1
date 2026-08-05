// ── InvitePage (/invite/:code) ────────────────────────────────────────────────
// The personalized landing a friend hits from a share link. Leads with the
// inviter's name ("Alexis invited you.") and remembers the referrer so the
// shopping-circle relationship can be created once they finish onboarding.
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, ArrowRight } from "lucide-react";
import { resolveInviter, rememberReferrer } from "@/lib/referral";

const INK = "#1C1712";
const CREAM = "#FDFAF6";
const MUTED = "#8C7A70";
const GOLD = "#C49E64";

export default function InvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) { setLoading(false); return; }
    rememberReferrer(code); // consumed after onboarding to store the relationship
    resolveInviter(code).then((i) => { setName(i?.name ?? null); setLoading(false); });
  }, [code]);

  return (
    <div style={{ minHeight: "100vh", background: CREAM, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
      <span className="font-sans uppercase select-none" style={{ letterSpacing: "0.32em", fontSize: 16, color: INK, marginBottom: 40 }}>
        <span style={{ fontWeight: 700 }}>ELEVEN</span><span style={{ fontWeight: 300 }}>ELEVEN</span>
      </span>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ maxWidth: 460, width: "100%" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", margin: "0 auto 22px", background: "rgba(196,158,100,0.14)", border: `1px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Users style={{ width: 27, height: 27, color: "#A07848" }} />
        </div>

        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 38, lineHeight: 1.08, color: INK, margin: "0 0 18px", letterSpacing: "-0.01em" }}>
          {loading ? " " : name ? `${name} invited you.` : "You're invited to ELEVENELEVEN."}
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: "#5A4A42", margin: "0 0 34px" }}>
          {name
            ? "The person who invited you trusts your opinion. Create your profile so they can include you in their shopping circle."
            : "Create your profile and help women like you make better shopping decisions."}
        </p>

        <button onClick={() => navigate("/onboarding")} style={{ width: "100%", maxWidth: 340, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, background: INK, color: CREAM, border: "none", borderRadius: 100, padding: "16px 0", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
          Create My Profile <ArrowRight style={{ width: 17, height: 17 }} />
        </button>

        <p style={{ fontSize: 13, color: MUTED, margin: "18px 0 0" }}>
          Already have an account? <button onClick={() => navigate("/signin")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#A07848", fontWeight: 600, textDecoration: "underline" }}>Sign in</button>
        </p>
      </motion.div>
    </div>
  );
}
