-- ── Reply feature (clarifying follow-ups on responses) ────────────────────────
-- A reply is a short follow-up question or clarification on a weigh-in. ONE level
-- of nesting only: replies attach to a response, never to another reply (the model
-- has no parent_reply_id, so infinite threads are structurally impossible).
-- Architected so a Q→A pair can later feed Brand Library insights.
create table if not exists public.response_replies (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  response_id uuid not null references public.responses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) <= 250 and char_length(btrim(body)) > 0)
);
create index if not exists response_replies_response_idx on public.response_replies(response_id);

alter table public.response_replies enable row level security;
drop policy if exists rr_read_all   on public.response_replies;
drop policy if exists rr_insert_own on public.response_replies;
drop policy if exists rr_update_own on public.response_replies;
drop policy if exists rr_delete_own on public.response_replies;
create policy rr_read_all   on public.response_replies for select using (true);
create policy rr_insert_own on public.response_replies for insert with check (auth.uid() = user_id);
create policy rr_update_own on public.response_replies for update using (auth.uid() = user_id);
create policy rr_delete_own on public.response_replies for delete using (auth.uid() = user_id);
