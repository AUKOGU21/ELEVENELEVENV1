// Supabase Edge Function: unsubscribe
// -----------------------------------------------------------------------------
// Records an unsubscribe. Every email we send carries a link of the form
// geteleveneleven.com/unsubscribe?e=<email>&t=<token>, and the List-Unsubscribe
// header points at the same place, so Gmail's and Apple Mail's own Unsubscribe
// buttons land here too. The page at that address (api/unsubscribe.ts on Vercel)
// posts { e, t } to this function.
//
// The token is an HMAC of the address under UNSUB_SECRET, so a link only ever
// unsubscribes the address it was sent to. A valid request adds the address to
// admin.email_exclude with scope 'all': no campaign, no notification, nothing.
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("UNSUB_SECRET") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** First 32 hex chars of HMAC-SHA256(lower(email)). Same recipe as the senders. */
async function tokenFor(email: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.trim().toLowerCase()));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Constant-time compare, so the token can't be guessed a character at a time. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SECRET) return json({ error: "not configured" }, 500);

  const { e, t, src } = await req.json().catch(() => ({} as Record<string, string>));
  const email = String(e ?? "").trim().toLowerCase();
  if (!email || !email.includes("@") || !t) return json({ error: "missing" }, 400);
  if (!same(await tokenFor(email), String(t))) return json({ error: "invalid link" }, 403);

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_unsubscribe`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addr: email, src: src === "one-click" ? "one-click button" : "unsubscribe link" }),
  });
  if (!r.ok) return json({ error: "could not record", detail: await r.text() }, 500);
  return json({ ok: true });
});
