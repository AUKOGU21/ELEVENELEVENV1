// Supabase Edge Function: notify-recommendation
// -----------------------------------------------------------------------------
// Someone recommended a product on her Looking For post. Called by the app
// (Feed.tsx) after a row lands in `recommendations`, with
// { looking_for_id, recommender_id }.
//
// The copy, the template and the send live in `notify`. This file only answers
// who to tell and what to call the thing.
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtaXF1aWtveHh1a2Z1am5waXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTQ1NTUsImV4cCI6MjA5MDY3MDU1NX0.Q2JOtk1OZjz-XF0XbyDBw3p5cAidnB8_IEuCAqjplEA";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function sb(path: string): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return r.ok ? r.json() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { looking_for_id, recommender_id } = await req.json().catch(() => ({}));
    if (!looking_for_id) return json({ error: "looking_for_id required" }, 400);

    const post = (await sb(`decisions?id=eq.${looking_for_id}&select=user_id,lf_title`))?.[0];
    if (!post) return json({ skipped: "post not found" });

    const ownerId: string = post.user_id;
    if (recommender_id && ownerId === recommender_id) return json({ skipped: "self recommendation" });

    const r = await fetch(SUPABASE_URL + "/functions/v1/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON_KEY },
      body: JSON.stringify({
        type: "recommendation",
        user_id: ownerId,
        decision_id: looking_for_id,
        data: { actor_id: recommender_id ?? null, item: post.lf_title || "your request" },
      }),
    });
    return json({ ok: true, forwarded: r.ok });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
