// ── Referral / Shopping Circle helpers ────────────────────────────────────────
// Invite links, the native share sheet (with copy fallback), and storing the
// lightweight inviter→invitee relationship. No social graph — just the link + the
// stored relationship.
import { supabase } from "@/lib/supabase";

// Shared links always point at production, never localhost.
const SHARE_SITE = "https://geteleveneleven.com";
const REFERRED_BY_KEY = "eleven_referred_by";

export const inviteUrl = (code: string): string => `${SHARE_SITE}/invite/${code}`;

export const inviteShareText = (code: string): string =>
  `I need your opinions on here too.\n\nCome join me on ELEVENELEVEN.\n\n${inviteUrl(code)}`;

// Ensure the current user has an invite_code; generate + persist if missing.
export async function ensureInviteCode(userId: string, displayName: string | null, existing: string | null): Promise<string | null> {
  if (existing) return existing;
  const base = (displayName || "").trim().toLowerCase().split(" ")[0].replace(/[^a-z0-9]/g, "") || "friend";
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from("profiles").update({ invite_code: code }).eq("id", userId);
    if (!error) return code; // unique violation → loop and try a suffixed code
  }
  return null;
}

// Referrer memory (set on the invite landing page, consumed after onboarding).
export const rememberReferrer = (code: string) => { try { localStorage.setItem(REFERRED_BY_KEY, code); } catch { /* ignore */ } };
export const pendingReferrer = (): string | null => { try { return localStorage.getItem(REFERRED_BY_KEY); } catch { return null; } };
export const clearReferrer = () => { try { localStorage.removeItem(REFERRED_BY_KEY); } catch { /* ignore */ } };

// Resolve an inviter's first name + id from a code (profiles is public-read).
export async function resolveInviter(code: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase.from("profiles").select("id, display_name").eq("invite_code", code).maybeSingle();
  if (!data) return null;
  return { id: data.id, name: (data.display_name || "").trim().split(" ")[0] || "A friend" };
}

// Create the inviter→invitee relationship if there's a pending referrer (and it
// isn't the user themselves). Idempotent — safe to call on every session.
export async function ensureReferral(userId: string): Promise<{ inviterName: string } | null> {
  const code = pendingReferrer();
  if (!code) return null;
  const inviter = await resolveInviter(code);
  if (!inviter || inviter.id === userId) { clearReferrer(); return null; }
  try {
    await supabase.from("referrals").upsert({ inviter_id: inviter.id, invitee_id: userId }, { onConflict: "invitee_id", ignoreDuplicates: true });
  } catch (e) { console.warn("referral create failed:", e); }
  clearReferrer();
  return { inviterName: inviter.name };
}

// Native share sheet (iOS/Android) with a copy-link fallback on desktop.
export async function shareInvite(code: string): Promise<"shared" | "copied" | "cancelled"> {
  const text = inviteShareText(code);
  const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
  if (nav.share) {
    try { await nav.share({ text }); return "shared"; }
    catch (e: any) { if (e?.name === "AbortError") return "cancelled"; }
  }
  try { await navigator.clipboard.writeText(text); return "copied"; }
  catch { return "cancelled"; }
}
