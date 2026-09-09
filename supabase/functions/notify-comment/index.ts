// Supabase Edge Function: notify-comment
// -----------------------------------------------------------------------------
// In-app notification when someone comments on a decision itself (not on a
// weigh-in). Called by the app after a row is inserted into decision_comments,
// with { comment_id }. Notifies the poster plus everyone already in the thread,
// minus the commenter — so "what went wrong?" reaches her, and her answer
// reaches whoever asked. In-app only; the push trigger on notifications fans out
// from there.
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
    const { comment_id } = await req.json().catch(() => ({}));
    if (!comment_id) return json({ error: "comment_id required" }, 400);

    // Resolve the comment → its decision + who wrote it.
    const comment = (await sb(`decision_comments?id=eq.${comment_id}&select=user_id,decision_id`))?.[0];
    if (!comment) return json({ skipped: "comment not found" });
    const commenterId: string = comment.user_id;
    const decisionId: string = comment.decision_id;

    const decision = (await sb(`decisions?id=eq.${decisionId}&select=user_id,brand_name,product_name,lf_title`))?.[0];
    if (!decision) return json({ skipped: "decision not found" });

    // The poster, plus everyone who has already commented on this decision.
    const others = (await sb(`decision_comments?decision_id=eq.${decisionId}&deleted_at=is.null&select=user_id`)) ?? [];
    const participants = new Set<string>([decision.user_id, ...others.map((c: any) => c.user_id)]);
    participants.delete(commenterId); // never notify the person who just commented
    if (participants.size === 0) return json({ skipped: "no one to notify" });

    const item = [decision.brand_name, decision.product_name].filter(Boolean).join(" ").trim()
      || decision.lf_title
      || "your decision";

    const prof = (await sb(`profiles?id=eq.${commenterId}&select=display_name`))?.[0];
    const actorName = firstName(prof?.display_name);

    const rows = [...participants].map((uid) => ({
      user_id: uid,
      type: uid === decision.user_id ? "comment" : "comment_thread",
      decision_id: decisionId,
      data: { actor_name: actorName, item },
      email_sent: false,
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
