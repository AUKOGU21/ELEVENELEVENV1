import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { C, RADIUS, SANS, body, display, meta } from "@/lib/design";

// ── The front door, set in the editorial system ───────────────────────────────
// Paper, rules and square edges per src/lib/design.ts. Nothing here changes what
// the form does: same fields, same handlers, same sign-in-link flow.

const PAGE_CSS = `
.ee-field::placeholder { color: ${C.muted}; opacity: 1; }
.ee-field:focus { border-color: ${C.ink} !important; }
`;

const wordmarkBtn: CSSProperties = {
  background: "none", border: "none", padding: 0, cursor: "pointer", userSelect: "none",
  fontFamily: SANS, textTransform: "uppercase", letterSpacing: "0.28em", fontSize: 13,
  color: C.ink, whiteSpace: "nowrap",
};

/** The two ways in, as tabs on a rule rather than a segmented pill. */
const tabBtn = (on: boolean): CSSProperties => ({
  ...meta(11, on ? C.ink : C.muted),
  fontWeight: 700,
  background: "none",
  border: "none",
  borderBottom: `2px solid ${on ? C.burgundy : "transparent"}`,
  padding: "0 0 11px",
  marginBottom: -1,
  cursor: "pointer",
  transition: "color 0.15s, border-color 0.15s",
});

// 16px so iOS doesn't zoom into the field on focus.
const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: RADIUS,
  border: `1px solid ${C.rule}`,
  background: "transparent",
  padding: "13px 14px",
  fontFamily: SANS,
  fontSize: 16,
  lineHeight: 1.5,
  color: C.ink,
  outline: "none",
};

const primaryBtn = (enabled: boolean): CSSProperties => ({
  ...meta(12, "#FFFFFF"),
  fontWeight: 700,
  letterSpacing: "0.16em",
  width: "100%",
  background: C.burgundy,
  border: `1px solid ${C.burgundy}`,
  borderRadius: RADIUS,
  padding: "16px 18px",
  marginTop: 8,
  cursor: enabled ? "pointer" : "default",
  opacity: enabled ? 1 : 0.3,
  transition: "opacity 0.15s",
});

// Where a failed signup or sign-in gets written down.
//
// Three signups were stranded before anyone knew why: the server made each
// account, and the browser never used the session it was handed. This records
// what the browser saw, on the events table, with a bare anonymous request, so
// it lands even when the auth client is the thing that broke. The morning brief
// counts event kinds, so an auth_problem shows up there the next day.
function reportAuthProblem(stage: string, err: unknown, extra: Record<string, unknown> = {}) {
  const e = (err ?? {}) as { name?: string; message?: string; status?: number; code?: string };
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  try {
    fetch(`${url}/rest/v1/events`, {
      method: "POST",
      keepalive: true,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        kind: "auth_problem",
        meta: {
          stage,
          name: e.name ?? null,
          message: String(e.message ?? (err ? err : "")).slice(0, 300),
          status: e.status ?? null,
          code: e.code ?? null,
          online: navigator.onLine,
          ua: navigator.userAgent,
          ...extra,
        },
      }),
    }).catch(() => {});
  } catch { /* never let the record-keeping become the failure */ }
}

// Can this browser hold a session at all? Private windows and "block site data"
// settings can refuse storage. Then the server creates an account the browser
// can't stay signed in to, and she's locked out of something she just made.
function storageWorks(): boolean {
  try {
    localStorage.setItem("__ee_probe", "1");
    localStorage.removeItem("__ee_probe");
    return true;
  } catch {
    return false;
  }
}

const SignIn = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInWithPassword, user, loading: authLoading } = useAuth();

  // Where to go afterwards. A member who opened a shared decision in a browser
  // with no session (every in-app browser, so most shared links) needs to land
  // back on that decision, not in the feed with her place lost. Only our own
  // paths are honoured, so this can never be pointed at another site.
  const nextRaw = searchParams.get("next") ?? "";
  const next = /^\/[A-Za-z0-9\-._~/?=&%]*$/.test(nextRaw) && !nextRaw.startsWith("//") ? nextRaw : null;

  // Already signed in? Don't make her type it again.
  useEffect(() => {
    if (!authLoading && user) navigate(next ?? "/feed", { replace: true });
  }, [authLoading, user, navigate, next]);

  const [mode, setMode] = useState<"signin" | "signup">(
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A neutral line, for when the page is steering her rather than scolding her.
  const [notice, setNotice] = useState<string | null>(null);
  // The way back in when the password fails: a link to her inbox.
  const [linkState, setLinkState] = useState<"idle" | "sending" | "sent">("idle");

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    let error: string | null = null;
    try {
      ({ error } = await signInWithPassword(email.trim(), password));
    } catch (thrown) {
      // The library throws anything that isn't its own error type. Before this
      // the button sat on "..." with nothing on screen.
      reportAuthProblem("signin_threw", thrown, { email: email.trim().toLowerCase() });
      error = "Something went wrong signing in. Try again, or get a sign-in link by email.";
    }
    if (error) {
      setError(/invalid login credentials/i.test(error)
        ? "That password doesn't match this email. Try again, or get a sign-in link by email."
        : error);
      setLoading(false);
    } else {
      navigate(next ?? "/feed");
    }
  };

  const handleSignUp = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) return;
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (!storageWorks()) {
      reportAuthProblem("signup_blocked_storage", null, { email: email.trim().toLowerCase() });
      setError("This browser is blocking site storage, so it can't keep you signed in. Turn off private browsing or allow site data for geteleveneleven.com, then try again.");
      return;
    }
    setLoading(true);
    setError(null);

    // Clear any stale data from previous sessions BEFORE signUp fires SIGNED_IN
    localStorage.removeItem("eleven_decisions");
    localStorage.removeItem("eleven_profile");
    localStorage.removeItem("eleven_session_start");

    // Store name and set session start BEFORE signUp so the sync handler sees it
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    localStorage.setItem("eleven_first_name", fullName);
    // Also store under a separate key that syncLocalProfileToDb won't clear,
    // so onboarding can still read the name after the SIGNED_IN event fires
    localStorage.setItem("eleven_signup_name", fullName);
    localStorage.setItem("eleven_session_start", Date.now().toString());

    const addr = email.trim();
    let signupError: unknown = null;
    try {
      const r = await supabase.auth.signUp({ email: addr, password });
      signupError = r.error;
    } catch (thrown) {
      // Anything that isn't the library's own error type is thrown, not
      // returned: a storage failure, a listener that broke. Before this the
      // button sat on "..." forever and nothing else happened.
      signupError = thrown;
    }
    if (!signupError) {
      navigate("/onboarding?fromSignup=true");
      return;
    }

    const err = signupError as { message?: string; status?: number };
    const alreadyThere = /already registered|already exists/i.test(err.message ?? "");
    // No status means it failed on this side: the response never arrived, or the
    // browser couldn't keep the session the server issued. The account may well
    // exist, with exactly the password she just typed. That's how Georgia, Sol
    // and Folu were stranded. "Already registered" means it certainly exists.
    // Either way, try the door before sending her anywhere else.
    if (alreadyThere || !err.status) {
      reportAuthProblem(alreadyThere ? "signup_already_registered" : "signup_client_failure", err, { email: addr.toLowerCase() });
      let retryError: unknown = null;
      try {
        const r = await supabase.auth.signInWithPassword({ email: addr, password });
        retryError = r.error;
      } catch (thrown) {
        retryError = thrown;
      }
      if (!retryError) {
        reportAuthProblem("signup_recovered_by_sign_in", null, { email: addr.toLowerCase() });
        // Feed sends an unfinished account on to onboarding, so a returning
        // member lands home and a stranded one lands where she left off.
        navigate(alreadyThere ? "/feed" : "/onboarding?fromSignup=true");
        return;
      }
      reportAuthProblem("signup_recovery_failed", retryError, { email: addr.toLowerCase(), after: alreadyThere ? "already_registered" : "client_failure" });
      setLoading(false);
      setMode("signin");
      setError(null);
      if (alreadyThere) {
        // Not the password on the account. Clearing both fields leaves the
        // browser nothing new to save over the real one, which is how a second
        // generated password ended up replacing Georgia's first.
        setPassword("");
        setConfirm("");
        setNotice("You already have an account with this email. Sign in, or get a sign-in link by email.");
      } else {
        setNotice("Your account may already be set up. Try signing in, or get a sign-in link by email.");
      }
      return;
    }

    setLoading(false);
    setError(err.message ?? "Something went wrong. Try again.");
  };

  const sendSignInLink = async () => {
    if (!email.trim()) { setError("Enter your email first."); return; }
    setError(null);
    setLinkState("sending");
    const { error } = await supabase.functions.invoke("send-sign-in-link", { body: { email: email.trim() } });
    if (error) {
      setLinkState("idle");
      setError("Couldn't send the link. Try again in a minute.");
      return;
    }
    setNotice(null);
    setLinkState("sent");
  };

  const canSubmit = mode === "signin"
    ? email.trim() && password.trim()
    : firstName.trim() && lastName.trim() && email.trim() && password.trim() && confirm.trim();

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: SANS, display: "flex", flexDirection: "column" }}>
      <style>{PAGE_CSS}</style>

      <header style={{ borderBottom: `1px solid ${C.rule}`, padding: "17px 20px" }}>
        <button onClick={() => navigate("/")} style={wordmarkBtn}>
          <span style={{ fontWeight: 700 }}>ELEVEN</span>
          <span style={{ fontWeight: 300 }}>ELEVEN</span>
        </button>
      </header>

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 20px 72px", boxSizing: "border-box" }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <h1 style={{ ...display("clamp(34px, 9.5vw, 46px)"), marginBottom: 26 }}>
            {mode === "signin" ? "Welcome back." : "Join the no-guess list."}
          </h1>

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 30, borderBottom: `1px solid ${C.rule}`, marginBottom: 28 }}>
            <button
              onClick={() => { setMode("signin"); setError(null); setNotice(null); setLinkState("idle"); }}
              style={tabBtn(mode === "signin")}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); setNotice(null); setLinkState("idle"); }}
              style={tabBtn(mode === "signup")}
            >
              Create account
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {mode === "signup" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="ee-field"
                    style={{ ...fieldStyle, width: 0, flex: 1, minWidth: 0 }}
                  />
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="ee-field"
                    style={{ ...fieldStyle, width: 0, flex: 1, minWidth: 0 }}
                  />
                </div>
              )}

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                type="email"
                autoComplete="email"
                className="ee-field"
                style={fieldStyle}
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                onKeyDown={(e) => e.key === "Enter" && mode === "signin" && handleSignIn()}
                className="ee-field"
                style={fieldStyle}
              />
              {mode === "signup" && (
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && handleSignUp()}
                  className="ee-field"
                  style={fieldStyle}
                />
              )}

              {notice && !error && (
                <p style={{ ...body(14, C.inkSoft), marginTop: 4 }}>{notice}</p>
              )}
              {error && (
                <p style={{ ...body(14, C.burgundy), marginTop: 4 }}>{error}</p>
              )}

              <button
                onClick={mode === "signin" ? handleSignIn : handleSignUp}
                disabled={!canSubmit || loading}
                style={primaryBtn(!!canSubmit && !loading)}
              >
                {loading ? "..." : mode === "signin" ? "Sign in" : "Create account"}
              </button>

              {mode === "signin" && (
                linkState === "sent" ? (
                  <p style={{ ...body(13.5, C.muted), marginTop: 6 }}>
                    Sent. Check {email.trim()} for a link to sign in. It works for an hour.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={sendSignInLink}
                    disabled={linkState === "sending"}
                    style={{
                      ...body(13.5, C.muted),
                      background: "none", border: "none", padding: 0, marginTop: 6,
                      textAlign: "left", alignSelf: "flex-start",
                      textDecoration: "underline", textUnderlineOffset: 3, textDecorationThickness: 1,
                      cursor: linkState === "sending" ? "default" : "pointer",
                      opacity: linkState === "sending" ? 0.4 : 1,
                    }}
                  >
                    {linkState === "sending" ? "Sending..." : "Email me a sign-in link"}
                  </button>
                )
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default SignIn;
