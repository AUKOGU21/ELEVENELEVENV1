import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

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

  // Already signed in? Don't make her type it again.
  useEffect(() => {
    if (!authLoading && user) navigate("/feed", { replace: true });
  }, [authLoading, user, navigate]);

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
      navigate("/feed");
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
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center px-6 py-4 border-b border-border">
        <span
          className="font-sans text-lg tracking-widest text-foreground cursor-pointer"
          onClick={() => navigate("/")}
        >
          ELEVENELEVEN
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-muted rounded-xl mb-8">
            <button
              onClick={() => { setMode("signin"); setError(null); setNotice(null); setLinkState("idle"); }}
              className={`flex-1 py-2 rounded-lg text-base font-medium transition-all ${
                mode === "signin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); setNotice(null); setLinkState("idle"); }}
              className={`flex-1 py-2 rounded-lg text-base font-medium transition-all ${
                mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
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
              className="space-y-3"
            >
              {mode === "signup" && (
                <div className="flex gap-3">
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-0 flex-1 min-w-0 px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
                  />
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-0 flex-1 min-w-0 px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                type="email"
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                onKeyDown={(e) => e.key === "Enter" && mode === "signin" && handleSignIn()}
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
              />
              {mode === "signup" && (
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && handleSignUp()}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
                />
              )}

              {notice && !error && (
                <p className="text-base text-muted-foreground text-center">{notice}</p>
              )}
              {error && (
                <p className="text-base text-red-500 text-center">{error}</p>
              )}

              <button
                onClick={mode === "signin" ? handleSignIn : handleSignUp}
                disabled={!canSubmit || loading}
                className="w-full py-4 rounded-full bg-primary text-primary-foreground text-base tracking-widest uppercase font-medium disabled:opacity-30 hover:bg-primary/90 transition-all mt-2"
              >
                {loading ? "..." : mode === "signin" ? "Sign in" : "Create account"}
              </button>

              {mode === "signin" && (
                linkState === "sent" ? (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    Sent. Check {email.trim()} for a link to sign in. It works for an hour.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={sendSignInLink}
                    disabled={linkState === "sending"}
                    className="w-full text-sm text-muted-foreground underline underline-offset-4 pt-2 disabled:opacity-40"
                  >
                    {linkState === "sending" ? "Sending..." : "Email me a sign-in link"}
                  </button>
                )
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
