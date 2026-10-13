// ── /unsubscribe ──────────────────────────────────────────────────────────────
// Where every email's unsubscribe link and List-Unsubscribe header point:
// geteleveneleven.com/unsubscribe?e=<email>&t=<token>.
//
// GET shows a page with one button. It does not unsubscribe on its own, because
// mail scanners open links before people do, and that would quietly unsubscribe
// whoever's inbox they guard. POST does it: the button posts here, and so do
// Gmail's and Apple Mail's own Unsubscribe buttons (RFC 8058 one-click). The
// unsubscribe edge function checks the token and records it in
// admin.email_exclude.
//
// This lives on Vercel rather than in the edge function because Supabase serves
// HTML from functions as plain text.

const SITE = "https://geteleveneleven.com";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} | ELEVENELEVEN</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet">
<style>
  body{margin:0;background:#F7F4EF;color:#141210;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;}
  main{max-width:440px;margin:0 auto;padding:72px 24px;text-align:center;}
  .mark{font-size:11px;letter-spacing:.32em;text-transform:uppercase;}
  .mark b{font-weight:700}.mark span{font-weight:300}
  h1{font-family:Anton,"Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:400;text-transform:uppercase;font-size:44px;line-height:.95;margin:36px 0 0;}
  p{font-size:15px;line-height:1.55;color:#3A3632;margin:16px 0 0;}
  button{margin-top:28px;width:100%;background:#761919;color:#fff;border:0;border-radius:2px;padding:17px 0;font:700 12px/1 "Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;}
  a{color:#761919;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;display:inline-block;margin-top:28px;}
</style></head>
<body><main><div class="mark"><b>ELEVEN</b><span>ELEVEN</span></div>${inner}</main></body></html>`;
}

type Req = { url?: string; method?: string; body?: unknown };
type Res = {
  setHeader: (k: string, v: string) => void;
  status: (n: number) => { send: (b: string) => void };
};

export default async function handler(req: Req, res: Res) {
  const url = new URL(req.url ?? "/", SITE);
  const e = (url.searchParams.get("e") ?? "").trim().toLowerCase();
  const t = url.searchParams.get("t") ?? "";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const broken = page("That link didn't work", `
    <h1>That link didn't work.</h1>
    <p>Email <b>hello@geteleveneleven.com</b> with the subject Unsubscribe and we'll take you off the list.</p>
    <a href="${SITE}">Back to ElevenEleven</a>`);

  if (!e || !t) { res.status(400).send(broken); return; }

  if (req.method !== "POST") {
    res.status(200).send(page("Unsubscribe", `
      <h1>Unsubscribe?</h1>
      <p>We'll stop emailing <b>${esc(e)}</b>. You can still use ElevenEleven anytime.</p>
      <form method="post"><button type="submit">Unsubscribe</button></form>
      <a href="${SITE}">Back to ElevenEleven</a>`));
    return;
  }

  // Gmail and Apple Mail post "List-Unsubscribe=One-Click"; our button posts nothing.
  const body = req.body as Record<string, string> | string | undefined;
  const oneClick = typeof body === "string" ? body.includes("One-Click") : body?.["List-Unsubscribe"] === "One-Click";

  let ok = false;
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ e, t, src: oneClick ? "one-click" : "link" }),
    });
    ok = r.ok;
  } catch { ok = false; }

  if (!ok) { res.status(400).send(broken); return; }
  res.status(200).send(page("You're unsubscribed", `
    <h1>You're unsubscribed.</h1>
    <p>We won't email <b>${esc(e)}</b> again. If that was a mistake, write to hello@geteleveneleven.com.</p>
    <a href="${SITE}">Back to ElevenEleven</a>`));
}
