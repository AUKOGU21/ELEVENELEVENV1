// Supabase Edge Function: notify-brand-suggestion
// -----------------------------------------------------------------------------
// Emails the founder whenever someone submits a brand suggestion. Called by the
// app (BrandLibrary.tsx) right after a row is inserted into brand_suggestions,
// with { brand_name, want_to_know }.
//
// Secrets (reused from the notify pipeline — nothing new to set):
//   RESEND_API_KEY  - Resend API key (re_...)
//   EMAIL_FROM      - optional, defaults to "ElevenEleven <hello@geteleveneleven.com>"
//   FOUNDER_EMAIL   - optional, where the alert goes; defaults below
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ElevenEleven <hello@geteleveneleven.com>";
const FOUNDER_EMAIL = Deno.env.get("FOUNDER_EMAIL") ?? "aukogu@mba2026.hbs.edu";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { brand_name, want_to_know } = await req.json().catch(() => ({}));
    if (!brand_name) return json({ error: "brand_name required" }, 400);
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);

    const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1712;">
      <p style="letter-spacing:5px;font-size:12px;color:#8C7A70;margin:0 0 18px;">ELEVENELEVEN &middot; BRAND LIBRARY</p>
      <h1 style="font-size:24px;margin:0 0 6px;font-weight:700;">New brand suggestion</h1>
      <p style="color:#6F665A;margin:0 0 20px;">Someone wants a brand added to the library.</p>
      <div style="background:#F6F1EA;border:1px solid rgba(196,158,100,0.4);border-radius:12px;padding:16px 18px;">
        <p style="margin:0 0 4px;font-size:12px;color:#8C7A70;text-transform:uppercase;letter-spacing:1px;">Brand</p>
        <p style="margin:0 0 14px;font-size:18px;font-weight:700;">${esc(brand_name)}</p>
        <p style="margin:0 0 4px;font-size:12px;color:#8C7A70;text-transform:uppercase;letter-spacing:1px;">Wants to know</p>
        <p style="margin:0;font-size:15px;line-height:1.5;">${want_to_know ? esc(want_to_know) : "&mdash;"}</p>
      </div>
      <p style="margin:22px 0 0;font-size:13px;color:#8C7A70;">Review the full queue anytime with <code>scripts/brand_suggestions.py</code>.</p>
    </div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [FOUNDER_EMAIL], subject: `New brand suggestion: ${brand_name}`, html }),
    });
    const d = await r.json().catch(() => ({}));
    return json({ ok: !!d.id, id: d.id ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
