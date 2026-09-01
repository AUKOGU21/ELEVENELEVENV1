// Web Push client helpers.
// On iOS, push only works once the app is added to the Home Screen (installed PWA)
// and running in standalone mode — so we detect that and guide the user accordingly.
import { supabase } from "./supabase";

// VAPID public key is safe to ship to the client (the private key stays a server secret).
const VAPID_PUBLIC_KEY =
  "BDcYlHtmL3_4ZpHLvoBQSgxVLT97kgqHD2I0D7cRWWY08nKfhrq4HRSDTAtNe9L370QHbu7WJYgX5cr6WNVM9os";

export type PushState = "unsupported" | "needs-install" | "default" | "granted" | "denied";

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this legacy flag on navigator
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// What the UI should show right now.
export function pushState(): PushState {
  if (!pushSupported()) {
    // iOS supports push, but only inside an installed PWA. If we're in iOS Safari
    // (not standalone), tell the user to add to Home Screen first.
    if (isIOS() && !isStandalone()) return "needs-install";
    return "unsupported";
  }
  if (isIOS() && !isStandalone()) return "needs-install";
  return (Notification.permission as PushState) ?? "default";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Request permission, subscribe, and persist the subscription for this user.
export async function enablePush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: permission };

    const reg = (await navigator.serviceWorker.ready) ?? (await registerServiceWorker());
    if (!reg) return { ok: false, reason: "no-service-worker" };

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" }
    );
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

// ── Home screen install tracking ──────────────────────────────────────────────
// There is no reliable "was installed" event across platforms (iOS never fires
// appinstalled), so the honest signal is: this user opened the app from her home
// screen. Stamp it at most once a day per device.
export async function recordHomeScreenUse(userId: string): Promise<void> {
  if (!isStandalone()) return;

  const key = `ee_standalone_ping_${userId}`;
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(key) === today) return;
  } catch { /* private mode: fall through and write */ }

  const now = new Date().toISOString();
  try {
    // installed_at is the first launch ever, so only fill it when it's empty.
    const { data } = await supabase
      .from("profiles")
      .select("installed_at")
      .eq("id", userId)
      .single();

    await supabase
      .from("profiles")
      .update({
        last_standalone_at: now,
        ...(data?.installed_at ? {} : { installed_at: now }),
      })
      .eq("id", userId);

    try { localStorage.setItem(key, today); } catch { /* private mode */ }
  } catch {
    // Never let instrumentation break the app.
  }
}

// ── Android install prompt ────────────────────────────────────────────────────
// Chrome fires beforeinstallprompt on load, so we capture it at import time and
// hand the banner a real one-tap install. iOS has no equivalent and still needs
// the manual share sheet instructions.
let deferredInstall: (Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> }) | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as typeof deferredInstall;
    window.dispatchEvent(new Event("ee-installable"));
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
  });
}

export function canInstall(): boolean {
  return !!deferredInstall && !isStandalone();
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  try {
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    deferredInstall = null;
    return outcome === "accepted";
  } catch {
    return false;
  }
}
