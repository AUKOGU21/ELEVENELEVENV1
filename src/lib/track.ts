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
  | "post_start";      // started the create-decision flow

export function track(
  kind: EventKind,
  opts?: { decisionId?: string | null; userId?: string | null; meta?: Record<string, unknown> }
): void {
  try {
    void supabase
      .from("events")
      .insert({
        kind,
        user_id: opts?.userId ?? null,
        decision_id: opts?.decisionId ?? null,
        meta: opts?.meta ?? null,
      })
      .then(undefined, () => { /* instrumentation never breaks the app */ });
  } catch { /* ditto */ }
}
