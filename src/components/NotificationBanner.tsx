// ── NotificationBanner ────────────────────────────────────────────────────────
// A one-time, dismissible nudge at the top of the feed to turn on push alerts.
// Shows only when push is available but not yet enabled. On iPhones still in
// Safari (not installed), it guides the user to add to Home Screen instead.
//
// One line, set on rules rather than in a tinted box. iPhone can't be sent to
// the Home Screen by script, so tapping it opens the steps instead of failing
// silently.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { pushState, enablePush, canInstall, promptInstall, isStandalone } from "@/lib/push";
import { C, RADIUS, SANS, body, display, meta } from "@/lib/design";

// A dismissal quiets the nudge for three weeks rather than killing it forever.
const RESHOW_DAYS = 21;

const STEPS: { label: string; title: string; note?: string; items: React.ReactNode[] }[] = [
  {
    label: "Step one",
    title: "Add ElevenEleven to your home screen",
    items: [
      <>Tap <b>Share</b>, the square with the arrow. On Android, tap the <b>⋮</b> menu, top right.</>,
      <>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</>,
    ],
  },
  {
    label: "Step two",
    title: "Turn notifications on",
    note: "Do this from the icon you just added, not from your browser.",
    items: [
      <>Open <b>ElevenEleven</b> from your home screen.</>,
      <>Tap the <b>bell</b> in the top right.</>,
      <>Tap <b>Turn on push notifications</b>.</>,
      <>Tap <b>Allow</b> when your phone asks.</>,
    ],
  },
];

export function HowTo({ isMobile, onClose }: { isMobile: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add ElevenEleven to your home screen"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 330, background: C.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 0 : 24, boxSizing: "border-box" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="no-scrollbar"
        style={{
          position: "relative", width: isMobile ? "100%" : "min(520px, 100%)", height: isMobile ? "100%" : "auto",
          maxHeight: isMobile ? "100%" : "88vh", overflowY: "auto", boxSizing: "border-box", borderRadius: isMobile ? 0 : RADIUS,
          background: "linear-gradient(rgba(247,244,239,0.94), rgba(247,244,239,0.94)), #EDECEA url(/email/legs-faded.jpg) center 45% / cover no-repeat",
          fontFamily: SANS, padding: isMobile ? "26px 22px 40px" : "34px 38px 40px",
          boxShadow: isMobile ? "none" : "0 30px 70px rgba(20,18,16,0.35)",
        }}
      >
        <button onClick={onClose} aria-label="Close" className="e11-close"
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", padding: 6, cursor: "pointer", color: C.ink, lineHeight: 0 }}>
          <X style={{ width: 22, height: 22 }} strokeWidth={1.5} />
        </button>

        <p style={{ ...meta(11, C.burgundy), fontWeight: 700 }}>Never miss a weigh-in</p>
        <h2 style={{ ...display(isMobile ? 38 : 44), marginTop: 12, maxWidth: "14ch" }}>
          Put us on your home screen.
        </h2>

        {STEPS.map((s) => (
          <section key={s.label} style={{ marginTop: 30, borderTop: `1px solid ${C.rule}`, paddingTop: 18 }}>
            <p style={meta(10.5, C.muted)}>{s.label}</p>
            <p style={{ ...display(isMobile ? 24 : 28), marginTop: 8 }}>{s.title}</p>
            {s.note && <p style={{ ...body(13.5, C.inkSoft), marginTop: 10 }}>{s.note}</p>}
            <ol style={{ margin: "14px 0 0", padding: 0, listStyle: "none" }}>
              {s.items.map((item, i) => (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 8, padding: "9px 0", borderBottom: `1px solid ${C.rule}` }}>
                  <span style={meta(11, C.burgundy)}>{i + 1}</span>
                  <span style={body(14, C.ink)}>{item}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}

        <button onClick={onClose} style={{
          ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em",
          width: "100%", background: C.burgundy, border: "none", borderRadius: RADIUS,
          padding: "16px 0", marginTop: 28, cursor: "pointer",
        }}>
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function NotificationBanner({ userId, isMobile }: { userId: string; isMobile: boolean }) {
  const dismissKey = `ee_push_prompt_dismissed_${userId}`;
  const [state, setState] = useState(() => pushState());
  const [installable, setInstallable] = useState(() => canInstall());
  const [busy, setBusy] = useState(false);
  const [howTo, setHowTo] = useState(false);

  const [dismissed, setDismissed] = useState(() => {
    try {
      const raw = localStorage.getItem(dismissKey);
      if (!raw) return false;
      // "1" is the old forever-dismissal. Convert it to a timestamped one so the
      // nudge comes back, without resurfacing it the same day for everyone.
      if (raw === "1") {
        localStorage.setItem(dismissKey, String(Date.now()));
        return true;
      }
      const at = Number(raw);
      if (!Number.isFinite(at)) return false;
      return Date.now() - at < RESHOW_DAYS * 86400000;
    } catch {
      return false;
    }
  });

  // Chrome may fire beforeinstallprompt after this mounts.
  useEffect(() => {
    const onInstallable = () => setInstallable(canInstall());
    window.addEventListener("ee-installable", onInstallable);
    window.addEventListener("appinstalled", onInstallable);
    return () => {
      window.removeEventListener("ee-installable", onInstallable);
      window.removeEventListener("appinstalled", onInstallable);
    };
  }, []);

  if (dismissed) return null;

  // iPhone needs the manual share sheet. Android gets a real one-tap install.
  const iosInstall = state === "needs-install";
  const androidInstall = !iosInstall && installable;
  const install = iosInstall || androidInstall;

  // Push nudges are only for the installed app, where push actually lands. In a
  // browser, desktop included, email is the channel and this has nothing to
  // offer, so it was just taking up space at the top of the feed.
  if (!install && !isStandalone()) return null;
  if (!install && state !== "default") return null;

  const dismiss = () => {
    try { localStorage.setItem(dismissKey, String(Date.now())); } catch { /* private mode */ }
    setDismissed(true);
  };
  const turnOn = async () => {
    setBusy(true);
    await enablePush(userId);
    setState(pushState());
    setBusy(false);
  };
  const addToHome = async () => {
    setBusy(true);
    await promptInstall();
    setInstallable(canInstall());
    setBusy(false);
  };

  const line = install
    ? "Add us to your home screen and never miss a weigh-in."
    : "Turn notifications on and never miss a weigh-in.";
  const actionLabel = busy ? "..." : androidInstall ? "Install" : iosInstall ? "Show me how" : "Turn on";
  const onAction = androidInstall ? addToHome : iosInstall ? () => setHowTo(true) : turnOn;

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: isMobile ? 12 : 18,
        borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}`,
        padding: isMobile ? "12px 0" : "14px 0", marginTop: isMobile ? 14 : 30,
      }}>
        <button
          onClick={onAction}
          disabled={busy}
          style={{ ...body(isMobile ? 13.5 : 14.5, C.ink), textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", minWidth: 0 }}
        >
          {line}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, flexShrink: 0 }}>
          <button onClick={onAction} disabled={busy}
            style={{ ...meta(11, C.burgundy), fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer", whiteSpace: "nowrap", opacity: busy ? 0.6 : 1 }}>
            {actionLabel}
          </button>
          <button onClick={dismiss} aria-label="Dismiss"
            style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: C.muted, lineHeight: 0 }}>
            <X style={{ width: 16, height: 16 }} strokeWidth={1.6} />
          </button>
        </div>
      </div>
      {howTo && <HowTo isMobile={isMobile} onClose={() => setHowTo(false)} />}
    </>
  );
}
