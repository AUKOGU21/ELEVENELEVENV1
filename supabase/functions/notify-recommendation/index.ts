// Supabase Edge Function: notify-recommendation
// -----------------------------------------------------------------------------
// Emails the owner of a Looking For post when someone recommends a product, and
// writes an in-app notification (bell). Called by the app (Feed.tsx) after a row
// is inserted into `recommendations`, with { looking_for_id, recommender_id }.
// Owner email + names are re-resolved server-side with the service role.
//
// Secrets (reused from the notify pipeline): RESEND_API_KEY, EMAIL_FROM, SITE_URL
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://geteleveneleven.com";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";

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
function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { looking_for_id, recommender_id } = await req.json().catch(() => ({}));
    if (!looking_for_id) return json({ error: "looking_for_id required" }, 400);

    const posts = await sb(`decisions?id=eq.${looking_for_id}&select=user_id,lf_title`);
    const post = Array.isArray(posts) ? posts[0] : null;
    if (!post) return json({ skipped: "post not found" });
    const ownerId: string = post.user_id;
    if (recommender_id && ownerId === recommender_id) return json({ skipped: "self recommendation" });

    let recommenderName = "Someone";
    if (recommender_id) {
      const profs = await sb(`profiles?id=eq.${recommender_id}&select=display_name`);
      recommenderName = firstName(Array.isArray(profs) ? profs[0]?.display_name : null);
    }
    const item = post.lf_title || "your request";

    // In-app notification (bell).
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: ownerId, type: "recommendation", decision_id: looking_for_id, data: { actor_name: recommenderName, item }, email_sent: true }),
    }).catch((e) => console.error("notification insert failed:", e));

    // Email.
    const ownerUser = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${ownerId}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const ownerEmail: string | undefined = ownerUser?.email;
    if (!ownerEmail || !RESEND_API_KEY) return json({ ok: true, emailed: false });

    const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1712;">
      <p style="letter-spacing:5px;font-size:12px;color:#8C7A70;margin:0 0 18px;">ELEVENELEVEN</p>
      <h1 style="font-size:24px;margin:0 0 8px;">${esc(recommenderName)} recommended a product</h1>
      <p style="color:#5A4A42;font-size:16px;margin:0 0 22px;">Someone shared a pick for &ldquo;${esc(item)}&rdquo;. See what they suggested.</p>
      <a href="${SITE_URL}/feed" style="display:inline-block;background:#1C1712;color:#fff;text-decoration:none;font-size:14px;padding:13px 26px;border-radius:100px;">See the recommendation &rarr;</a>
    </div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [ownerEmail], subject: `${recommenderName} recommended a product for you`, html }),
    });
    const data = await res.json().catch(() => ({}));
    return json({ ok: true, emailed: true, id: data?.id ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
