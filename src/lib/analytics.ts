// ── Product analytics (PostHog) ───────────────────────────────────────────────
// PostHog already records every page view, page leave (so time on page and
// session length) and session replays. What it couldn't do was tell one member
// from another, or see what she did. This file adds both:
//
//   identifyMember(user)  on sign-in: ties her visits to her account, which is
//                          what makes returning-to-browse, time spent per member
//                          and retention measurable in PostHog
//   resetMember()          on sign-out, so a shared device doesn't blend people
//   capture(name, props)   key actions (signed up, posted, advised, outcome...)
//
// Team accounts are marked internal so dashboards can filter them out.
// Never throws: a failed analytics call is a lost data point, not a bug.
import posthog from "posthog-js";
import { readFirstTouch } from "./attribution";

const TEAM_EMAILS = ["alexiskukogu@gmail.com", "srishtisat_09@berkeley.edu"];

export function identifyMember(user: { id: string; email?: string | null; created_at?: string }): void {
  try {
    const internal = !!user.email && TEAM_EMAILS.includes(user.email.toLowerCase());
    const touch = readFirstTouch();
    posthog.identify(
      user.id,
      { internal },
      {
        signed_up_at: user.created_at ?? null,
        first_touch_source: touch?.utm_source ?? touch?.ref ?? touch?.referrer ?? (touch?.shared_decision ? "shared_decision" : touch?.invite ? "invite" : "direct"),
        first_touch_landing: touch?.landing_path ?? null,
      },
    );
  } catch { /* analytics never breaks the app */ }
}

export function resetMember(): void {
  try { posthog.reset(); } catch { /* ditto */ }
}

export function capture(name: string, props?: Record<string, unknown>): void {
  try { posthog.capture(name, props); } catch { /* ditto */ }
}
