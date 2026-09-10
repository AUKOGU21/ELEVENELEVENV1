// Supabase Edge Function: notify-followers
// -----------------------------------------------------------------------------
// Someone you follow posted a new decision. Called by the app right after the
// decision row is inserted, with { decision_id }.
//
// In-app only (bell + push for anyone who has it on). No email: following is a
// low-stakes signal and a follow-heavy user would otherwise get an inbox full of
// them. Revisit if that changes.
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
function firstName(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t ? t.split(" ")[0] : "Someone";
}


// Hand off to `notify`, which owns the copy, the email and the in-app row.
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtaXF1aWtveHh1a2Z1am5waXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTQ1NTUsImV4cCI6MjA5MDY3MDU1NX0.Q2JOtk1OZjz-XF0XbyDBw3p5cAidnB8_IEuCAqjplEA";
async function notify(type: string, user_id: string, data: Record<string, unknown>, decision_id: string | null = null) {
  await fetch(SUPABASE_URL + "/functions/v1/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON_KEY },
    body: JSON.stringify({ type, user_id, data, decision_id }),
  }).catch((e) => console.error("notify failed:", e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { decision_id } = await req.json().catch(() => ({}));
    if (!decision_id) return json({ error: "decision_id required" }, 400);

    const d = (await sb(`decisions?id=eq.${decision_id}&select=user_id,brand_name,product_name,lf_title,is_public,deleted_at`))?.[0];
    if (!d) return json({ skipped: "decision not found" });
    if (d.deleted_at || d.is_public === false) return json({ skipped: "not a public decision" });

    const followers: any[] = (await sb(`follows?following_id=eq.${d.user_id}&select=follower_id`)) ?? [];
    if (followers.length === 0) return json({ ok: true, notified: 0, note: "no followers" });

    const prof = (await sb(`profiles?id=eq.${d.user_id}&select=display_name`))?.[0];
    const actorName = firstName(prof?.display_name);
    const item = [d.brand_name, d.product_name].filter(Boolean).join(" ").trim() || d.lf_title || "something new";

    const targets = followers
      .map((f: any) => f.follower_id)
      .filter((uid: string) => uid !== d.user_id);
    if (targets.length === 0) return json({ ok: true, notified: 0 });
    for (const uid of targets) {
      await notify("follow_post", uid, { actor_id: d.user_id, name: actorName, item }, decision_id);
    }

    return json({ ok: true, notified: targets.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
