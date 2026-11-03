// /chrome: the one link for the Chrome extension, for bios, stickers and ads.
// On a computer it's the way to the store. Extensions can't be installed on a
// phone, and that's where most people find us, so there it offers to email the
// link to open later.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/track";
import { useAuth } from "@/contexts/AuthContext";
import ChromeMark from "@/components/ChromeMark";
import { C, DISPLAY, SANS, body, meta } from "@/lib/design";

const STORE_URL = "https://chromewebstore.google.com/detail/eleveneleven/pooafgjdcbidgcfndaickfojhicljkjj";
const CREAM = "#F7F4EF";

const isPhone = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent);

export default function ChromeLink() {
  const { user } = useAuth();
  const [phone] = useState(isPhone);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  // A signed-in member is one tap away: her address is already known.
  useEffect(() => { if (user?.email) setEmail((v) => v || user.email!); }, [user]);

  // The loop is decoration. If motion is unwelcome, or it can't play, the still
  // behind it is the page. It only appears once it's actually playing.
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { v.pause(); return; }
    v.play().catch(() => { /* the still stays */ });
  }, []);

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
    ...meta(13, C.ink), fontWeight: 700, letterSpacing: "0.1em", display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 12, boxSizing: "border-box", textDecoration: "none", background: CREAM, border: "none", borderRadius: 999,
    padding: "17px 30px", cursor: "pointer", boxShadow: "0 10px 30px rgba(20,18,16,0.22)", width: phone ? "100%" : "auto",
  };

  return (
    <div style={{ position: "relative", minHeight: "100dvh", overflow: "hidden", background: `#8c8c8c url(${phone ? "/chrome/chrome-still-vertical.jpg" : "/chrome/chrome-still.jpg"}) center / cover no-repeat`, fontFamily: SANS, display: "flex", alignItems: phone ? "flex-end" : "center", justifyContent: "center", boxSizing: "border-box", padding: phone ? "32px 22px 44px" : "32px 22px" }}>
      <video
        ref={video} src={phone ? "/chrome/chrome-loop-vertical.mp4" : "/chrome/chrome-loop.mp4"} poster={phone ? "/chrome/chrome-still-vertical.jpg" : "/chrome/chrome-still.jpg"} muted loop playsInline autoPlay preload="auto" aria-hidden
        onPlaying={() => setPlaying(true)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: playing ? 1 : 0, transition: "opacity .4s ease" }}
      />
      {/* A soft light behind the words, so oxblood holds up against the metal. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, background: phone
        ? "linear-gradient(180deg, rgba(247,244,239,0) 34%, rgba(247,244,239,0.72) 54%, rgba(247,244,239,0.86) 100%)"
        : "radial-gradient(ellipse 62% 58% at 50% 50%, rgba(247,244,239,0.82) 0%, rgba(247,244,239,0.62) 48%, rgba(247,244,239,0) 100%)" }} />

      <main style={{ position: "relative", width: "100%", maxWidth: 640, textAlign: "center" }}>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 400, textTransform: "uppercase", color: C.burgundy, fontSize: phone ? "clamp(42px, 12.5vw, 56px)" : "clamp(52px, 11vw, 96px)", lineHeight: 1.02, margin: 0 }}>
          Take ELEVENELEVEN shopping with you.
        </h1>
        <p style={{ ...body(phone ? 16 : 18, C.burgundy), fontWeight: 500, maxWidth: 480, margin: "18px auto 0" }}>
          {phone ? "Chrome runs on desktop. We'll email you a link to download." : "Post anything you're shopping for and get real, relevant input before you buy."}
        </p>

        {!phone && (
          <div style={{ marginTop: 28 }}>
            {/* A new tab, so this page stays open long enough for the click to be recorded. */}
            <a href={STORE_URL} target="_blank" rel="noopener noreferrer" onClick={() => track("chrome_store_click")} style={button}><ChromeMark size={24} /> Add to Chrome</a>
          </div>
        )}

        {phone && state !== "sent" && (
          <form onSubmit={send} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12, maxWidth: 380, marginInline: "auto" }}>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" aria-label="Your email" autoComplete="email"
              style={{ width: "100%", boxSizing: "border-box", padding: "15px 22px", fontFamily: SANS, fontSize: 16, color: C.ink, background: "#FFFFFF", border: "none", borderRadius: 999, textAlign: "center" }}
            />
            <button type="submit" disabled={state === "sending"} style={{ ...button, opacity: state === "sending" ? 0.7 : 1 }}>
              <ChromeMark size={22} /> {state === "sending" ? "Sending..." : "Send to my laptop"}
            </button>
            {state === "error" && <p style={{ ...body(14, C.burgundy) }}>That didn't send. Check the address and try again.</p>}
          </form>
        )}
        {phone && state === "sent" && (
          <p style={{ ...body(17, C.burgundy), fontWeight: 700, marginTop: 24 }}>Sent. Open it on your laptop to add ELEVENELEVEN to Chrome.</p>
        )}
      </main>
    </div>
  );
}
