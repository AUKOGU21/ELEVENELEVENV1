// ── NotFound ──────────────────────────────────────────────────────────────────
// A dead link, given the same frame as the rest of the app: wordmark, one Anton
// line, one burgundy way out. The way out is a router Link, so it doesn't throw
// away the app and reload the whole bundle.
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { C, RADIUS, SANS, body, display, meta } from "@/lib/design";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      <header style={{ borderBottom: `1px solid ${C.rule}`, padding: "17px 20px" }}>
        <Link
          to="/"
          style={{
            textDecoration: "none", userSelect: "none",
            fontFamily: SANS, textTransform: "uppercase", letterSpacing: "0.28em", fontSize: 13,
            color: C.ink, whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontWeight: 700 }}>ELEVEN</span>
          <span style={{ fontWeight: 300 }}>ELEVEN</span>
        </Link>
      </header>

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 20px 72px", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <p style={meta(11, C.muted)}>Error 404</p>

          <h1 style={{ ...display("clamp(34px, 9.5vw, 46px)"), marginTop: 14 }}>
            This page doesn't exist.
          </h1>

          <p style={{ ...body(15, C.inkSoft), marginTop: 18, maxWidth: "40ch" }}>
            The link may be old, or the page may have moved.
          </p>

          <Link
            to="/"
            style={{
              ...meta(12, "#FFFFFF"),
              fontWeight: 700,
              letterSpacing: "0.16em",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: C.burgundy,
              border: `1px solid ${C.burgundy}`,
              borderRadius: RADIUS,
              padding: "15px 24px",
              marginTop: 30,
              textDecoration: "none",
            }}
          >
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
