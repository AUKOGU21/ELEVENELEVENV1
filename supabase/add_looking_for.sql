-- ── Looking For (Phase 2) ─────────────────────────────────────────────────────
-- "Looking For" is a second feed post type: an earlier decision stage where a
-- user asks the community "what should I buy?" and receives structured product
-- recommendations. It lives on the existing `decisions` table (post_type) so the
-- feed stays a single query, with recommendations in their own table.

-- 1) Discriminator + Looking For fields on decisions.
alter table public.decisions
  add column if not exists post_type    text not null default 'decision',
  add column if not exists lf_title      text,
  add column if not exists lf_budget     text,
  add column if not exists lf_occasion   text,
  add column if not exists lf_priorities text[],
  add column if not exists lf_context    text;

-- 2) Recommendations — structured product picks in response to a Looking For post.
create table if not exists public.recommendations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  looking_for_id    uuid not null references public.decisions(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  product_url       text,
  product_name      text,
  brand_name        text,
  price_note        text,
  product_image_url text,
  reasoning         text not null,
  fit_note          text,
  who_for           text,
  match_score       numeric
);
create index if not exists recommendations_looking_for_idx on public.recommendations (looking_for_id);

alter table public.recommendations enable row level security;
drop policy if exists recommendations_read_all   on public.recommendations;
drop policy if exists recommendations_insert_own  on public.recommendations;
drop policy if exists recommendations_update_own  on public.recommendations;
drop policy if exists recommendations_delete_own  on public.recommendations;
create policy recommendations_read_all  on public.recommendations for select using (true);
create policy recommendations_insert_own on public.recommendations for insert with check (auth.uid() = user_id);
create policy recommendations_update_own on public.recommendations for update using (auth.uid() = user_id);
create policy recommendations_delete_own on public.recommendations for delete using (auth.uid() = user_id);

-- 3) Helpful votes on recommendations (mirrors response_votes).
create table if not exists public.recommendation_votes (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  voter_id          uuid not null references auth.users(id) on delete cascade,
  vote_type         text not null default 'helpful',
  unique (recommendation_id, voter_id)
);
alter table public.recommendation_votes enable row level security;
drop policy if exists rec_votes_read_all   on public.recommendation_votes;
drop policy if exists rec_votes_insert_own on public.recommendation_votes;
drop policy if exists rec_votes_update_own on public.recommendation_votes;
drop policy if exists rec_votes_delete_own on public.recommendation_votes;
create policy rec_votes_read_all   on public.recommendation_votes for select using (true);
create policy rec_votes_insert_own on public.recommendation_votes for insert with check (auth.uid() = voter_id);
create policy rec_votes_update_own on public.recommendation_votes for update using (auth.uid() = voter_id);
create policy rec_votes_delete_own on public.recommendation_votes for delete using (auth.uid() = voter_id);
