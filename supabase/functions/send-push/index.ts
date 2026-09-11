// Supabase Edge Function: send-push
// -----------------------------------------------------------------------------
// Sends a Web Push notification to all of a user's registered devices.
// Called two ways:
//   1. DB trigger on `notifications` insert -> { user_id, type, data, decision_id }
//   2. Directly for a test -> { user_id, title, body, url }
// Dead subscriptions (404/410) are pruned automatically.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SITE_URL
// -----------------------------------------------------------------------------
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@geteleveneleven.com";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://geteleveneleven.com";
const HOOK_SECRET = Deno.env.get("PUSH_HOOK_SECRET") ?? "";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Mirrors messageFor() in NotificationBell.tsx so push text matches the in-app bell.
function messageFor(type: string, data: Record<string, unknown>): string {
  const who = (data.actor_name as string) || "Someone";
  const item = (data.item as string) || (data.product_name as string) || "your decision";
  switch (type) {
    case "weigh_in": return `${who} weighed in on ${item}`;
    case "recommendation": return `${who} recommended a product for “${item}”`;
    case "reply": return `${who} replied to your take on ${item}`;
    case "relevant": return `${who} needs your take on ${item}`;
    case "follow_post": return `${who} posted ${item}`;
    case "comment": return `${who} commented on ${item}`;
    case "comment_thread": return `${who} also commented on ${item}`;
    case "outcome": return `${who} shared how it turned out`;
    case "save": return `${who} saved your decision`;
    case "helpful": return `${who} found your take helpful`;
    default: return (data.message as string) || "New activity on ElevenEleven";
  }
}

async function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (HOOK_SECRET && req.headers.get("x-push-secret") !== HOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    const payload = await req.json().catch(() => ({}));
    const userId: string | undefined = payload.user_id;
    if (!userId) return json({ error: "user_id required" }, 400);

    // The notify function writes push_title / push_body into the notification's
    // data, generated from the same map as the email, so the phone and the inbox
    // say the same thing. messageFor stays as the fallback for older rows.
    const d = payload.data ?? {};
    const title: string = payload.title || d.push_title || "ElevenEleven";
    const body: string = payload.body || d.push_body || messageFor(payload.type ?? "", d);
    const url: string = payload.url || d.url || SITE_URL;

    const subs = await rest(
      `push_subscriptions?user_id=eq.${userId}&select=id,endpoint,p256dh,auth,user_agent`
    ).then((r) => (r.ok ? r.json() : []));
    if (!Array.isArray(subs) || subs.length === 0) return json({ sent: 0, skipped: "no subscriptions" });

    // One tag per notification, not per type. Tagging by type meant two women
    // weighing in on two different posts collapsed into a single banner, with
    // the second one silently replacing the first.
    const tag: string = payload.notification_id || d.notification_id || payload.type || undefined;
    const notification = JSON.stringify({ title, body, url, tag });
    let sent = 0;
    const dead: string[] = [];
    // Per device, not just a count. "sent: 2 of 2" told us Apple accepted both
    // and nothing about which device was which, so a phone that stays silent
    // looks identical to one that rang.
    const devices: { device: string; status: string | number }[] = [];
    const deviceOf = (ua: string | null) =>
      /iPhone|iPad/i.test(ua ?? "") ? "iPhone" : /Macintosh/i.test(ua ?? "") ? "Mac" : "other";

    await Promise.allSettled(
      subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null }) => {
        const device = deviceOf(s.user_agent);
        try {
          const r = await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            notification
          );
          sent++;
          devices.push({ device, status: (r as { statusCode?: number })?.statusCode ?? "accepted" });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          devices.push({ device, status: code ?? "error" });
          if (code === 404 || code === 410) dead.push(s.id);
          else console.error("push send failed:", device, code, (e as Error).message);
        }
      })
    );

    if (dead.length) {
      await rest(`push_subscriptions?id=in.(${dead.join(",")})`, { method: "DELETE" }).catch(() => {});
    }
    return json({ sent, pruned: dead.length, of: subs.length, devices });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
