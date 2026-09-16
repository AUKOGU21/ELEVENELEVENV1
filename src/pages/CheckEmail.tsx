// ── CheckEmail ────────────────────────────────────────────────────────────────
// Where she lands after a sign-in link is sent. Set in the editorial system:
// paper, one Anton line, rules instead of an icon tile.
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { C, SANS, body, display, meta, strong } from "@/lib/design";

const CheckEmail = () => {
  const navigate = useNavigate();
  const email = localStorage.getItem("eleven_email") ?? "your inbox";

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      <header style={{ borderBottom: `1px solid ${C.rule}`, padding: "17px 20px" }}>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer", userSelect: "none",
            fontFamily: SANS, textTransform: "uppercase", letterSpacing: "0.28em", fontSize: 13,
            color: C.ink, whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontWeight: 700 }}>ELEVEN</span>
          <span style={{ fontWeight: 300 }}>ELEVEN</span>
        </button>
      </header>

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 20px 72px", boxSizing: "border-box" }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ width: "100%", maxWidth: 420 }}
        >
          <p style={meta(11, C.burgundy)}>Almost in</p>

          <h1 style={{ ...display("clamp(34px, 9.5vw, 46px)"), marginTop: 14 }}>
            Check your inbox.
          </h1>

          <div style={{ borderTop: `1px solid ${C.rule}`, marginTop: 26, paddingTop: 20 }}>
            <p style={body(15, C.inkSoft)}>We sent a sign-in link to</p>
            <p style={{ ...strong(16), marginTop: 5 }}>{email}</p>
          </div>

          <p style={{ ...body(14, C.muted), marginTop: 22, maxWidth: "42ch" }}>
            Click the link in the email to verify your account and start weighing in.
            The link expires in 24 hours.
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default CheckEmail;
