// Supabase Edge Function: notify-rec-outcome
// -----------------------------------------------------------------------------
// Tells a recommender that her pick is what the poster actually bought. Called
// by the app (Feed.tsx) when a Looking For post closes on a recommendation, with
// { decision_id, recommendation_id }.
//
// Two shapes, two entries in the copy map: she bought the exact piece
// (rec_outcome), or a different piece from that same brand (rec_outcome_alt).
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
    const { decision_id, recommendation_id } = await req.json().catch(() => ({}));
    if (!decision_id || !recommendation_id) {
      return json({ error: "decision_id and recommendation_id required" }, 400);
    }

    const rec = (await sb(`recommendations?id=eq.${recommendation_id}&select=user_id,brand_name,product_name`))?.[0];
    if (!rec) return json({ skipped: "recommendation not found" });

    const post = (await sb(`decisions?id=eq.${decision_id}&select=user_id,lf_title`))?.[0];
    if (!post) return json({ skipped: "post not found" });

    const recommenderId: string = rec.user_id;
    if (recommenderId === post.user_id) return json({ skipped: "own post" });

    const outcome = (await sb(
      `outcomes?decision_id=eq.${decision_id}&select=alt_brand_name,alt_product_name,bought_alternative`,
    ))?.[0];

    // True when she went with that brand but a different piece than the one recommended.
    const differentPiece = !!outcome?.bought_alternative;
    const item = outcome?.alt_product_name
      || rec.product_name
      || outcome?.alt_brand_name
      || rec.brand_name
      || "your pick";

    const r = await fetch(SUPABASE_URL + "/functions/v1/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON_KEY },
      body: JSON.stringify({
        type: differentPiece ? "rec_outcome_alt" : "rec_outcome",
        user_id: recommenderId,
        decision_id,
        data: { actor_id: post.user_id, item },
      }),
    });
    return json({ ok: true, forwarded: r.ok, different_piece: differentPiece });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
