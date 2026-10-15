// ── Where a member came from ──────────────────────────────────────────────────
// The waitlist form saved each visitor's tracking link; the app never did, so a
// woman who signed up straight on geteleveneleven.com (or from a shared decision)
// left no trace of how she found us.
//
// First touch: the first time this browser lands on the site we note how it got
// here (utm tags, ?ref, the referring site, a shared decision or invite link) and
// keep it. When that browser creates an account, it's saved on the account
// (auth user metadata, so it's there before her profile row exists) as
// signup_attribution. Read it with:
//   select raw_user_meta_data->'signup_attribution' from auth.users
import { supabase } from "./supabase";
import { capture } from "./analytics";

const KEY = "ee_first_touch";

export type FirstTouch = {
  utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string;
  ref?: string;                // ?ref= on any link
  referrer?: string;           // the site she came from, if not us
  landing_path: string;        // where she first landed
  shared_decision?: string;    // /d/:id, a decision someone shared with her
  invite?: string;             // /invite/:code
  at: string;
};

/** Note how this browser first arrived. Runs once on every page load; only the first visit is kept. */
export function captureFirstTouch(): void {
  try {
    if (localStorage.getItem(KEY)) return;
    const url = new URL(window.location.href);
    const q = url.searchParams;
    const t: FirstTouch = { landing_path: url.pathname, at: new Date().toISOString() };
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
      const v = q.get(k);
      if (v) t[k] = v.slice(0, 100);
    }
    const ref = q.get("ref");
    if (ref) t.ref = ref.slice(0, 100);
    if (document.referrer) {
      try {
        const r = new URL(document.referrer);
        if (r.hostname !== url.hostname) t.referrer = r.hostname;
      } catch { /* unparseable referrer: skip */ }
    }
    const shared = url.pathname.match(/^\/d\/([^/?#]+)/);
    if (shared) t.shared_decision = shared[1];
    const invite = url.pathname.match(/^\/invite\/([^/?#]+)/);
    if (invite) t.invite = invite[1];
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch { /* storage blocked: we just won't know */ }
}

export function readFirstTouch(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : null;
  } catch {
    return null;
  }
}

/**
 * On sign-in: if this is a new account (made in the last two days) with no
 * source saved yet, save this browser's first touch on it. Older accounts are
 * left alone: today's visit says nothing about how they found us months ago.
 */
export async function saveSignupAttribution(user: { created_at?: string; user_metadata?: Record<string, unknown> }): Promise<void> {
  if (user.user_metadata && "signup_attribution" in user.user_metadata) return;
  const created = user.created_at ? new Date(user.created_at).getTime() : 0;
  if (!created || Date.now() - created > 2 * 86400000) return;
  const touch = readFirstTouch() ?? { landing_path: "(unknown)", at: new Date().toISOString() };
  const { error } = await supabase.auth.updateUser({ data: { signup_attribution: touch } });
  // Exactly once per new account, whichever way she signed up (password, emailed
  // link, a guest claiming her answers), since this only runs when no source is saved yet.
  if (!error) capture("account_created", { ...touch });
}
