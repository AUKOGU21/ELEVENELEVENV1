// ── claim-guest ───────────────────────────────────────────────────────────────
// She answered someone's decision as a guest, then made an account. This moves
// what she already wrote onto that account, so her first contribution is not
// stranded under a name with nothing behind it.
//
// The response itself is rewritten rather than copied: user_id becomes hers and
// guest_id is cleared, which keeps the one-author rule the database enforces.
// The guest row stays, marked claimed, so the history of where she came from
// survives.
//
// Only the person signing in can do this, and only for a guest nobody has
// claimed. The id lives in her own browser, which is the whole of the v1
// identity model: no cross-device guessing, and nothing to orphan.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return json({ error: "Server not configured" }, 500);

  // Who is asking. Taken from the token, never from the body.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await asCaller.auth.getUser();
  const user = who?.user ?? null;
  if (!user) return json({ error: "Sign in first" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const guestId = typeof body.guest_id === "string" ? body.guest_id.trim() : "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(guestId)) return json({ error: "Unknown guest" }, 400);

  const db = createClient(url, serviceKey);

  const { data: guest } = await db
    .from("guests")
    .select("id, claimed_by")
    .eq("id", guestId)
    .maybeSingle();

  if (!guest) return json({ error: "Unknown guest" }, 404);
  // Already hers is success, so a second sign-in is not an error.
  if (guest.claimed_by && guest.claimed_by !== user.id) return json({ error: "Already claimed" }, 409);
  if (guest.claimed_by === user.id) return json({ ok: true, responses: 0, recommendations: 0, already: true });

  const { data: responses } = await db
    .from("responses")
    .update({ user_id: user.id, guest_id: null })
    .eq("guest_id", guestId)
    .select("id");

  const { data: recommendations } = await db
    .from("recommendations")
    .update({ user_id: user.id, guest_id: null })
    .eq("guest_id", guestId)
    .select("id");

  await db
    .from("guests")
    .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq("id", guestId);

  return json({
    ok: true,
    responses: responses?.length ?? 0,
    recommendations: recommendations?.length ?? 0,
  });
});
