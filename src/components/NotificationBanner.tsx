// ── NotificationBanner ────────────────────────────────────────────────────────
// A one-time, dismissible nudge at the top of the feed to turn on push alerts.
// Shows only when push is available but not yet enabled. On iPhones still in
// Safari (not installed), it guides the user to add to Home Screen instead.
import { useEffect, useState } from "react";
import { Bell, X, Plus } from "lucide-react";
import { pushState, enablePush, canInstall, promptInstall } from "@/lib/push";

const INK = "#1C1712";
const MUTED = "#8C7A70";

// A dismissal quiets the nudge for three weeks rather than killing it forever.
const RESHOW_DAYS = 21;

export default function NotificationBanner({ userId, isMobile }: { userId: string; isMobile: boolean }) {
  const dismissKey = `ee_push_prompt_dismissed_${userId}`;
  const [state, setState] = useState(() => pushState());
  const [installable, setInstallable] = useState(() => canInstall());
  const [busy, setBusy] = useState(false);

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

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: isMobile ? 11 : 14,
      background: "rgba(196,158,100,0.10)", border: "1px solid rgba(196,158,100,0.55)",
      borderRadius: 16, padding: isMobile ? "12px 13px" : "14px 16px", marginTop: isMobile ? 18 : 34,
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(196,158,100,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {install
          ? <Plus style={{ width: 22, height: 22, color: "#A07848" }} />
          : <Bell style={{ width: 21, height: 21, color: "#A07848" }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.25 }}>
          {install ? "add ElevenEleven to your home screen" : <>know the second<br />she weighs in</>}
        </p>
        <p style={{ fontSize: 13, color: MUTED, margin: "3px 0 0", lineHeight: 1.4 }}>
          {iosInstall
            ? "on iphone, notifications turn on once we're on your home screen. tap share, then add to home screen."
            : androidInstall
            ? "notifications turn on once we're on your home screen. tap install."
            : "turn on notifications and we'll ping you when someone responds to your decision."}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {androidInstall && (
          <button onClick={addToHome} disabled={busy}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: INK, color: "#FDFAF6", borderRadius: 100, padding: isMobile ? "8px 14px" : "9px 18px", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "…" : "install"}
          </button>
        )}
        {!install && (
          <button onClick={turnOn} disabled={busy}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: INK, color: "#FDFAF6", borderRadius: 100, padding: isMobile ? "8px 14px" : "9px 18px", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "…" : "turn on"}
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss" style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
          <X style={{ width: 15, height: 15 }} />
        </button>
      </div>
    </div>
  );
}
