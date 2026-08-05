// Supabase Edge Function: notify-reply
// -----------------------------------------------------------------------------
// In-app notification when someone posts a clarifying reply on a response. Called
// by the app after a row is inserted into response_replies, with
// { response_id, replier_id }. Notifies everyone in the thread (the response
// author + anyone who has replied) except the person who just replied — so a
// question reaches the responder AND an answer reaches the asker. In-app only.
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
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  return r.ok ? r.json() : null;
}
function firstName(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t ? t.split(/\s+/)[0] : "Someone";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { response_id, replier_id } = await req.json().catch(() => ({}));
    if (!response_id || !replier_id) return json({ error: "response_id and replier_id required" }, 400);

    // Resolve the response → author + its decision.
    const resp = (await sb(`responses?id=eq.${response_id}&select=user_id,decision_id`))?.[0];
    if (!resp) return json({ skipped: "response not found" });
    const authorId: string = resp.user_id;
    const decisionId: string = resp.decision_id;

    // Everyone who has replied so far on this response.
    const replies = (await sb(`response_replies?response_id=eq.${response_id}&select=user_id`)) ?? [];
    const participants = new Set<string>([authorId, ...replies.map((r: any) => r.user_id)]);
    participants.delete(replier_id); // never notify the person who just replied
    if (participants.size === 0) return json({ skipped: "no one to notify" });

    // Item name for the notification copy.
    const decision = decisionId ? (await sb(`decisions?id=eq.${decisionId}&select=brand_name,product_name`))?.[0] : null;
    const item = decision ? ([decision.brand_name, decision.product_name].filter(Boolean).join(" ").trim() || "your decision") : "your decision";

    // Replier's name.
    const prof = (await sb(`profiles?id=eq.${replier_id}&select=display_name`))?.[0];
    const actorName = firstName(prof?.display_name);

    const rows = [...participants].map((uid) => ({
      user_id: uid, type: "reply", decision_id: decisionId, response_id,
      data: { actor_name: actorName, item }, email_sent: false,
    }));
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    }).catch((e) => console.error("notification insert failed:", e));

    return json({ ok: true, notified: rows.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
