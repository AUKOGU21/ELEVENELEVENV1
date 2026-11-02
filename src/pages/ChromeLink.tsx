// /chrome: the one link for the Chrome extension, for bios, stickers and ads.
// On a computer it's the way to the store. Extensions can't be installed on a
// phone, and that's where most people find us, so there it offers to email the
// link to open later.
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/track";
import { C, RADIUS, SANS, body, display, meta } from "@/lib/design";

const STORE_URL = "https://chromewebstore.google.com/detail/eleveneleven/pooafgjdcbidgcfndaickfojhicljkjj";

const isPhone = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent);

export default function ChromeLink() {
  const navigate = useNavigate();
  const [phone] = useState(isPhone);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || state === "sending") return;
    setState("sending");
    const { error } = await supabase.functions.invoke("send-chrome-link", { body: { email: email.trim() } });
    if (error) { setState("error"); return; }
    track("chrome_link_requested");
    setState("sent");
  };

  const button: React.CSSProperties = {
    ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em", display: "block", width: "100%", boxSizing: "border-box",
    textAlign: "center", textDecoration: "none", background: C.burgundy, border: "none", borderRadius: RADIUS,
    padding: "17px 0", cursor: "pointer", marginTop: 14,
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.paper, fontFamily: SANS, boxSizing: "border-box", padding: "0 20px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", paddingTop: "12vh", paddingBottom: 40 }}>
        <button onClick={() => navigate("/")} aria-label="ElevenEleven home" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS, fontSize: 13, letterSpacing: "0.32em", color: C.ink }}>
          <b style={{ fontWeight: 700 }}>ELEVEN</b><span style={{ fontWeight: 300 }}>ELEVEN</span>
        </button>
        <p style={{ ...meta(11, C.burgundy), fontWeight: 700, marginTop: 44 }}>For Chrome</p>
        <h1 style={{ ...display("clamp(40px, 12vw, 56px)"), marginTop: 12 }}>
          {phone ? "Send it to your laptop." : "Shop with context."}
        </h1>
        <p style={{ ...body(16, C.inkSoft), marginTop: 14 }}>
          {phone
            ? "Our Chrome extension installs on a computer. We'll email you the link to open there."
            : "Post anything you're shopping for from the page you're on, and hear from women like you before you buy."}
        </p>

        {!phone && (
          <a href={STORE_URL} onClick={() => track("chrome_store_click")} style={{ ...button, marginTop: 26 }}>Add to Chrome</a>
        )}

        {phone && state !== "sent" && (
          <form onSubmit={send} style={{ marginTop: 26 }}>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" aria-label="Your email" autoComplete="email"
              style={{ width: "100%", boxSizing: "border-box", padding: "15px 14px", fontFamily: SANS, fontSize: 16, color: C.ink, background: "#FFFFFF", border: `1px solid ${C.ruleStrong}`, borderRadius: RADIUS }}
            />
            <button type="submit" disabled={state === "sending"} style={{ ...button, opacity: state === "sending" ? 0.6 : 1 }}>
              {state === "sending" ? "Sending..." : "Send it to my laptop"}
            </button>
            {state === "error" && <p style={{ ...body(14, C.burgundy), marginTop: 12 }}>That didn't send. Check the address and try again.</p>}
            <p style={{ ...body(13, C.muted), marginTop: 14 }}>One email with the link. That's it.</p>
          </form>
        )}
        {phone && state === "sent" && (
          <p style={{ ...body(16, C.ink), fontWeight: 700, marginTop: 26 }}>Sent. Open it on your laptop to add ELEVENELEVEN to Chrome.</p>
        )}
        {phone && (
          <button onClick={() => navigate("/")} style={{ ...meta(11, C.ink), fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer", marginTop: 30, textDecoration: "underline" }}>
            See what ELEVENELEVEN is
          </button>
        )}
      </div>
    </div>
  );
}
