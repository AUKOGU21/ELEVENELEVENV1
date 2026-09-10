// Supabase Edge Function: notify-weigh-in
// -----------------------------------------------------------------------------
// Someone weighed in on her decision. Called by the app with
// { decision_id, responder_id }.
//
// This used to carry its own 150-line email template. The copy, the template and
// the send now live in `notify`, so every notification looks and reads the same
// and the phone says what the inbox says.
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
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },
  });
  return r.ok ? r.json() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { decision_id, responder_id } = await req.json().catch(() => ({}));
    if (!decision_id) return json({ error: "decision_id required" }, 400);

    const d = (await sb(`decisions?id=eq.${decision_id}&select=user_id,brand_name,product_name,lf_title`))?.[0];
    if (!d) return json({ skipped: "decision not found" });

    const ownerId: string = d.user_id;
    if (responder_id && ownerId === responder_id) return json({ skipped: "self weigh-in" });

    const item = [d.brand_name, d.product_name].filter(Boolean).join(" ").trim() || d.lf_title || "your pick";

    const r = await fetch(SUPABASE_URL + "/functions/v1/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON_KEY },
      body: JSON.stringify({
        type: "weigh_in",
        user_id: ownerId,
        decision_id,
        data: { actor_id: responder_id ?? null, item },
      }),
    });
    return json({ ok: true, forwarded: r.ok });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
