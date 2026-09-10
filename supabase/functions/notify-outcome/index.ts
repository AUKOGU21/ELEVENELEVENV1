// Supabase Edge Function: notify-outcome
// -----------------------------------------------------------------------------
// Closes the loop. When the asker logs an outcome, this tells everyone who
// weighed in what happened. Called by the app (OutcomeModal.tsx) right after the
// outcome is saved, with { decision_id }.
//
// This used to carry its own 120-line email template, in fonts we don't use
// anymore, and it wrote no in-app notification at all: women got the email and
// nothing in the bell. The copy, the template, the bell row and the push now all
// come from `notify`, so this file is only the question of who to tell.
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
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const decisionId: string | undefined = payload.decision_id;
  if (!decisionId) return json({ error: "decision_id required" }, 400);

  const decision = (await sb(`decisions?id=eq.${decisionId}&select=user_id,brand_name,product_name`))?.[0];
  if (!decision) return json({ skipped: "decision not found" });
  const askerId: string = decision.user_id;

  // Everyone who weighed in, once each, minus the asker herself.
  const responses = await sb(`responses?decision_id=eq.${decisionId}&select=user_id`);
  const weigherIds = [...new Set((Array.isArray(responses) ? responses : [])
    .map((r: any) => r.user_id).filter((id: string) => id && id !== askerId))] as string[];
  if (!weigherIds.length) return json({ skipped: "no weigh-ins to notify" });

  const outcome = (await sb(
    `outcomes?decision_id=eq.${decisionId}&select=did_purchase,outcome_type,fit_result_note,outcome_notes,outcome_detail_other&order=created_at.desc&limit=1`,
  ))?.[0];

  const item = [decision.brand_name, decision.product_name].filter(Boolean).join(" ").trim() || "the piece";
  const bought = outcome?.did_purchase === true || outcome?.outcome_type === "bought_it";
  const verdict = bought ? "bought" : "passed on";

  // What she wrote when she closed the loop. It's the reason anyone opens this
  // email, so it rides along as the quiet line under the headline.
  const noteRaw = (outcome?.fit_result_note || outcome?.outcome_notes || outcome?.outcome_detail_other || "")
    .toString().trim();
  const note = noteRaw ? `"${noteRaw}"` : "";

  if (payload.dry) {
    return json({ dry: true, item, verdict, note: noteRaw || null, weighers: weigherIds.length });
  }

  let sent = 0;
  const results: Record<string, string> = {};
  for (const wid of weigherIds) {
    const r = await fetch(SUPABASE_URL + "/functions/v1/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON_KEY },
      body: JSON.stringify({
        type: "outcome",
        user_id: wid,
        decision_id: decisionId,
        data: { actor_id: askerId, item, verdict, note },
      }),
    });
    if (r.ok) { sent++; results[wid] = "sent"; } else { results[wid] = `err-${r.status}`; }
  }

  console.log("Outcome notifications:", JSON.stringify(results));
  return json({ ok: true, weighers: weigherIds.length, sent });
});
