// ── track ─────────────────────────────────────────────────────────────────────
// Fire-and-forget interaction logging. Answers "what are they actually clicking
// on", which nothing recorded before this.
//
// Rules: never block the interaction, never throw, never surface an error. A
// failed write is a lost data point, not a broken feature.
import { supabase } from "./supabase";

export type EventKind =
  | "product_click"    // clicked through to the retailer
  | "card_open"        // opened a decision's responses/comments drawer
  | "weigh_in_start"   // tapped Weigh in
  | "profile_open"     // opened someone's profile
  | "post_start"       // started the create-decision flow
  // ── The external share funnel ───────────────────────────────────────────────
  // A decision leaves the app through a message and comes back as a response.
  // Each step is recorded so the drop-off between them can be read: opens per
  // share, responses per open, and profiles per response.
  | "decision_share_clicked"   // tapped Share on a decision
  | "shared_decision_opened"   // a /d/:id page was opened
  | "guest_weigh_in_started"   // a logged-out visitor opened the weigh-in sheet
  | "guest_response_submitted" // a guest response was accepted
  | "guest_signup_started"     // a guest tapped Create my profile
  | "guest_signup_completed";  // that guest became a member

export function track(
  kind: EventKind,
  opts?: {
    decisionId?: string | null;
    userId?: string | null;
    /** Who answered when nobody was signed in. Lands in meta, not user_id. */
    guestId?: string | null;
    meta?: Record<string, unknown>;
  }
): void {
  try {
    void supabase
      .from("events")
      .insert({
        kind,
        user_id: opts?.userId ?? null,
        decision_id: opts?.decisionId ?? null,
        // events.user_id points at profiles, and a guest has no profile row, so
        // her id rides in meta. It still joins the funnel together.
        meta: opts?.guestId ? { ...(opts.meta ?? {}), guest_id: opts.guestId } : opts?.meta ?? null,
      })
      .then(undefined, () => { /* instrumentation never breaks the app */ });
  } catch { /* ditto */ }
}
