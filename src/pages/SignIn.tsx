import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const SignIn = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInWithPassword } = useAuth();

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

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await signInWithPassword(email.trim(), password);
    if (error) {
      setError(error);
      setLoading(false);
    } else {
      navigate("/feed");
    }
  };

  const handleSignUp = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) return;
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
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

    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    navigate("/onboarding?fromSignup=true");
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
              onClick={() => { setMode("signin"); setError(null); }}
              className={`flex-1 py-2 rounded-lg text-base font-medium transition-all ${
                mode === "signin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); }}
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
