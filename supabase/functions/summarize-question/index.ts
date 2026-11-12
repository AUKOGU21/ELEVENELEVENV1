// Supabase Edge Function: summarize-question
// -----------------------------------------------------------------------------
// Turns what she wrote when she posted into one short question for the feed
// card ("Are these worth $325?"). Called by the app right after a decision is
// inserted, with { decision_id }, and by the backfill script for older posts.
//
// The original text is never touched; the question lives in its own column.
// A question she edited herself (question_summary_edited) is never replaced.
// When there isn't enough to go on, it writes nothing and the card keeps
// "WEIGH IN." rather than showing a question she didn't ask.
//
// Length: the card sets it in 24px Anton, where about 30 characters fit on one
// line of a phone. Aim for one line, never more than two.
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const MAX_CHARS = 50; // two lines on a phone card
const ONE_LINE = 30;  // one line on a phone card: the aim

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const svc = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };

const RULES = `You write the one-line question that appears on a shopping decision card in a women's peer-advice app. Other members read it in the feed and decide whether to weigh in.

You get what she wrote when she posted: the concerns she ticked and her notes on each, plus the product.

Rules:
1. Find her main uncertainty. If she has several, pick the one she wrote the most about or that matters most to the buy-or-not decision.
2. Write it as one direct question, as she would ask it to the group. Natural and conversational, not a label. Examples: "Are these worth $325?", "Do these run true to size?", "Will cow print work on me?", "Do these gap at the waist?", "Is Quince leather any good?"
3. Keep her actual meaning. Never invent details, experiences, product facts or preferences she didn't state.
4. Prefer the specific detail over generic phrasing ("Are these worth $325?" beats "Is this worth it?") when she gave it.
5. If her own question is already short, keep it.
6. ${ONE_LINE} characters or fewer, counting spaces. Never more than ${MAX_CHARS}. Cut filler words ("actually", "really", "just", "for me"). Drop cents from prices. End with a question mark. No emoji, no quotation marks.
7. Refer to the item as "this" or "these", or by brand when the question is about the brand. Don't repeat the full product name.
8. Talk about her body only in her own words. Never label a body type she didn't name ("smaller on top" stays "smaller on top", never "hip-heavy" or "pear").
9. Name a color only if she or the product name states it. Otherwise say "this color".
10. No abbreviations or shopping jargon (write "true to size", never "TTS").
11. If there isn't enough to know what she's unsure about, return null rather than guessing.

Reply with only JSON: {"question": "..."} or {"question": null}.`;

async function ask(input: string, extra = ""): Promise<string | null> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: RULES,
      messages: [{ role: "user", content: input + extra }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const q = JSON.parse(m[0])?.question;
  if (typeof q !== "string") return null;
  let clean = q.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (!clean.endsWith("?")) clean = clean.replace(/[.!]+$/, "") + "?";
  return clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!ANTHROPIC_KEY) return json({ error: "ANTHROPIC_API_KEY not set" }, 500);
    const { decision_id, force } = await req.json().catch(() => ({}));
    if (!decision_id) return json({ error: "decision_id required" }, 400);

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/decisions?id=eq.${encodeURIComponent(decision_id)}&select=post_type,brand_name,product_name,product_category,price_note,uncertainty_text,context_note,question_summary,question_summary_edited`,
      { headers: svc },
    );
    const d = (await res.json())?.[0];
    if (!d) return json({ skipped: "not found" });
    if (d.post_type === "looking_for") return json({ skipped: "looking for post" });
    if (d.question_summary_edited) return json({ skipped: "edited by her" });
    if (d.question_summary && !force) return json({ skipped: "already has one", question: d.question_summary });
    if (!d.uncertainty_text && !d.context_note) return json({ skipped: "nothing to summarize" });

    const input = [
      `Product: ${[d.brand_name, d.product_name].filter(Boolean).join(" ") || "unknown"}`,
      d.product_category ? `Category: ${d.product_category}` : null,
      d.price_note ? `Price: ${d.price_note}` : null,
      d.uncertainty_text ? `Concerns she ticked: ${d.uncertainty_text}` : null,
      d.context_note ? `What she wrote (concern: note, separated by " · "): ${d.context_note}` : null,
    ].filter(Boolean).join("\n");

    let q = await ask(input);
    // Over one line: one more try at a shorter version, keeping whichever is shorter.
    if (q && q.length > ONE_LINE) {
      const shorter = await ask(input, `\n\nYour first answer was "${q}" (${q.length} characters). Write it again in ${ONE_LINE} characters or fewer, keeping her meaning.`);
      if (shorter && shorter.length < q.length) q = shorter;
    }
    if (q && q.length > MAX_CHARS) q = null;
    if (!q) return json({ ok: true, question: null });

    const up = await fetch(`${SUPABASE_URL}/rest/v1/decisions?id=eq.${encodeURIComponent(decision_id)}&question_summary_edited=is.false`, {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ question_summary: q }),
    });
    if (!up.ok) return json({ error: `save failed ${up.status}: ${await up.text()}` }, 500);
    return json({ ok: true, question: q });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
