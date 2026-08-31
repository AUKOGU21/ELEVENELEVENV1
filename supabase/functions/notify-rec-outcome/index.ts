// Supabase Edge Function: notify-rec-outcome
// -----------------------------------------------------------------------------
// Tells a recommender that her pick is what the poster actually bought. Called by
// the app (Feed.tsx) after a Looking For post is closed with a chosen
// recommendation, with { decision_id, recommendation_id }. Handles both cases:
// she bought the exact piece, or a different piece from that same brand.
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
    const { decision_id, recommendation_id } = await req.json().catch(() => ({}));
    if (!decision_id || !recommendation_id) return json({ error: "decision_id and recommendation_id required" }, 400);

    const recs = await sb(`recommendations?id=eq.${recommendation_id}&select=user_id,brand_name,product_name`);
    const rec = Array.isArray(recs) ? recs[0] : null;
    if (!rec) return json({ skipped: "recommendation not found" });

    const posts = await sb(`decisions?id=eq.${decision_id}&select=user_id,lf_title`);
    const post = Array.isArray(posts) ? posts[0] : null;
    if (!post) return json({ skipped: "post not found" });

    const recommenderId: string = rec.user_id;
    if (recommenderId === post.user_id) return json({ skipped: "own post" });

    const outcomes = await sb(`outcomes?decision_id=eq.${decision_id}&select=alt_brand_name,alt_product_name,bought_alternative`);
    const outcome = Array.isArray(outcomes) ? outcomes[0] : null;

    const profs = await sb(`profiles?id=eq.${post.user_id}&select=display_name`);
    const buyerName = firstName(Array.isArray(profs) ? profs[0]?.display_name : null);

    const brand = outcome?.alt_brand_name || rec.brand_name || "your pick";
    const boughtName = outcome?.alt_product_name || rec.product_name || null;
    // True when she went with that brand but a different piece than the one recommended.
    const differentPiece = !!outcome?.bought_alternative;

    const headline = `${buyerName} bought the ${brand} you recommended.`;
    const detail = differentPiece && boughtName
      ? `She went with a different piece from them, the ${boughtName}. Your rec is what got her there.`
      : boughtName
      ? `She went with the ${boughtName}. Your rec is what got her there.`
      : "Your rec is what got her there.";

    // In-app notification (bell).
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: recommenderId,
        type: "rec_outcome",
        decision_id,
        data: { actor_name: buyerName, brand, item: boughtName, different_piece: differentPiece },
        email_sent: true,
      }),
    }).catch((e) => console.error("notification insert failed:", e));

    const recUser = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${recommenderId}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const recEmail: string | undefined = recUser?.email;
    if (!recEmail || !RESEND_API_KEY) return json({ ok: true, emailed: false });

    const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1712;">
      <p style="letter-spacing:5px;font-size:12px;color:#8C7A70;margin:0 0 18px;">ELEVENELEVEN</p>
      <h1 style="font-size:24px;margin:0 0 8px;">${esc(headline)}</h1>
      <p style="color:#5A4A42;font-size:16px;margin:0 0 22px;">${esc(detail)}</p>
      <a href="${SITE_URL}/feed" style="display:inline-block;background:#1C1712;color:#fff;text-decoration:none;font-size:14px;padding:13px 26px;border-radius:100px;">See what she bought &rarr;</a>
    </div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [recEmail], subject: headline, html }),
    });
    const data = await res.json().catch(() => ({}));
    return json({ ok: true, emailed: true, id: data?.id ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
