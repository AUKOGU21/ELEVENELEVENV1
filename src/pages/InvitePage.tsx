// ── InvitePage (/invite/:code) ────────────────────────────────────────────────
// The personalized landing a friend hits from a share link. Leads with the
// inviter's name ("Alexis invited you.") and remembers the referrer so the
// shopping-circle relationship can be created once they finish onboarding.
//
// Set in the editorial system: paper, one oversized Anton welcome, a rule, and
// one burgundy way in. It's the first page a new person sees, so it carries the
// most type and the least furniture.
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { resolveInviter, rememberReferrer } from "@/lib/referral";
import { C, RADIUS, SANS, body, display, meta } from "@/lib/design";

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
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      <header style={{ borderBottom: `1px solid ${C.rule}`, padding: "17px 20px" }}>
        <span style={{ fontFamily: SANS, textTransform: "uppercase", letterSpacing: "0.28em", fontSize: 13, color: C.ink, whiteSpace: "nowrap", userSelect: "none" }}>
          <span style={{ fontWeight: 700 }}>ELEVEN</span>
          <span style={{ fontWeight: 300 }}>ELEVEN</span>
        </span>
      </header>

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px 80px", boxSizing: "border-box" }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ width: "100%", maxWidth: 520 }}
        >
          <p style={meta(11, C.burgundy)}>An invitation</p>

          <h1 style={{ ...display("clamp(40px, 11vw, 66px)"), marginTop: 16 }}>
            {loading ? " " : name ? `${name} invited you.` : "You're invited to ElevenEleven."}
          </h1>

          <div style={{ borderTop: `1px solid ${C.rule}`, marginTop: 28, paddingTop: 22 }}>
            <p style={{ ...body(16), maxWidth: "44ch" }}>
              {name
                ? "The person who invited you trusts your opinion. Create your profile so they can include you in their shopping circle."
                : "Create your profile and help women like you make better shopping decisions."}
            </p>
          </div>

          <button
            onClick={() => navigate("/onboarding")}
            style={{
              ...meta(12, "#FFFFFF"),
              fontWeight: 700,
              letterSpacing: "0.16em",
              width: "100%",
              maxWidth: 340,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: C.burgundy,
              border: `1px solid ${C.burgundy}`,
              borderRadius: RADIUS,
              padding: "16px 18px",
              marginTop: 32,
              cursor: "pointer",
            }}
          >
            Create my profile <ArrowRight style={{ width: 15, height: 15 }} strokeWidth={2} />
          </button>

          <p style={{ ...body(13.5, C.muted), marginTop: 20 }}>
            Already have an account?{" "}
            <button
              onClick={() => navigate("/signin")}
              style={{
                ...body(13.5, C.burgundy),
                fontWeight: 600,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationThickness: 1,
              }}
            >
              Sign in
            </button>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
