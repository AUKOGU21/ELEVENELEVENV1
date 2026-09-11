// Web Push client helpers.
// On iOS, push only works once the app is added to the Home Screen (installed PWA)
// and running in standalone mode — so we detect that and guide the user accordingly.
import { supabase } from "./supabase";

// VAPID public key is safe to ship to the client (the private key stays a server secret).
const VAPID_PUBLIC_KEY =
  "BDcYlHtmL3_4ZpHLvoBQSgxVLT97kgqHD2I0D7cRWWY08nKfhrq4HRSDTAtNe9L370QHbu7WJYgX5cr6WNVM9os";

export type PushState = "unsupported" | "needs-install" | "default" | "granted" | "denied";

// One stamp per device, written even when nobody is signed in.
const STANDALONE_SEEN_KEY = "ee_standalone_first_seen";

// Stamp at import time, not just on auth. Someone whose session expired inside
// the installed app still launched it from her home screen, and that used to be
// invisible: recordHomeScreenUse only ever ran with a signed-in user, so she
// counted as never having installed.
if (typeof window !== "undefined") {
  try {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone && !localStorage.getItem(STANDALONE_SEEN_KEY)) {
      localStorage.setItem(STANDALONE_SEEN_KEY, new Date().toISOString());
    }
  } catch { /* private mode, or no matchMedia */ }
}

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

// Which device a stored row belongs to, roughly. Safari's version string changes
// with every update, so the full user agent can't be used to recognise the same
// phone twice.
function deviceFamily(ua: string): string {
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/macintosh/i.test(ua)) return "mac";
  return "other";
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

// ── Keeping the subscription fresh ────────────────────────────────────────────
// A push subscription is not permanent. iOS drops them when the installed app
// sits unused, when storage is reclaimed, and across some OS updates, and it
// hands out a new one when the app comes back. Nothing tells the server: Apple
// keeps returning 201 for the dead token for a while, so from our side a phone
// that has gone silent looks exactly like one that is ringing.
//
// So on every launch, if she has already said yes, we read whatever subscription
// the browser holds right now and write it down again. Any older row for the
// same device is removed, so one phone can't sit in the table three times.
export async function syncPushSubscription(userId: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // Permission stands but the subscription is gone. Re-create it quietly:
      // she already agreed to this, so there's no prompt and nothing to see.
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    // Retire this device's previous tokens. Only this device's: her laptop is a
    // separate row and has every right to stay.
    const family = deviceFamily(navigator.userAgent);
    const { data: mine } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, user_agent")
      .eq("user_id", userId);
    const stale = (mine ?? [])
      .filter((r) => r.endpoint !== sub!.endpoint && deviceFamily(r.user_agent ?? "") === family)
      .map((r) => r.id);
    if (stale.length) {
      await supabase.from("push_subscriptions").delete().in("id", stale);
    }
  } catch {
    // Push is a nice-to-have. It never breaks the launch.
  }
}

// ── Home screen install tracking ──────────────────────────────────────────────
// There is no reliable "was installed" event across platforms (iOS never fires
// appinstalled), so the honest signal is: this user opened the app from her home
// screen. Stamp it at most once a day per device.
export async function recordHomeScreenUse(userId: string): Promise<void> {
  if (!isStandalone()) return;

  // She may have launched from the home screen while signed out, or before this
  // tracking existed. Either way it never reached the DB and she counted as not
  // installed. A local stamp survives both, and backfills on the next sign-in.
  try {
    const seen = localStorage.getItem(STANDALONE_SEEN_KEY);
    if (!seen) localStorage.setItem(STANDALONE_SEEN_KEY, new Date().toISOString());
  } catch { /* private mode */ }

  const key = `ee_standalone_ping_${userId}`;
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(key) === today) return;
  } catch { /* private mode: fall through and write */ }

  const now = new Date().toISOString();
  // The earliest home screen launch this device ever saw beats "now", so an old
  // install stops looking like a brand new one.
  let firstSeen = now;
  try { firstSeen = localStorage.getItem(STANDALONE_SEEN_KEY) || now; } catch { /* private mode */ }
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
        ...(data?.installed_at ? {} : { installed_at: firstSeen }),
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
  const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  return !!deferredInstall && !isStandalone() && mobile;
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
