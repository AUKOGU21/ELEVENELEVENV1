-- ── Brand Library ─────────────────────────────────────────────────────────────
-- Community insights shown publicly on brand pages (appended to "Things to know
-- before you buy"). Any signed-in user can add one; everyone can read them.
create table if not exists brand_insights (
  id          uuid primary key default gen_random_uuid(),
  brand_slug  text not null,
  learned     text not null,
  category    text,
  contexts    text[],
  size_bought text,
  height      text,
  note        text,
  photo_url   text,
  user_id     uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
alter table brand_insights enable row level security;
create policy "brand_insights_read_all"  on brand_insights for select using (true);
create policy "brand_insights_insert_own" on brand_insights for insert with check (auth.uid() = user_id);

-- Brand suggestions — private queue reviewed by the founder (admin). Signed-in
-- users can submit; there is intentionally NO public read policy, so suggestions
-- stay private (only the service role / admin can read them).
create table if not exists brand_suggestions (
  id           uuid primary key default gen_random_uuid(),
  brand_name   text not null,
  want_to_know text,
  user_id      uuid references auth.users(id),
  status       text not null default 'pending',
  created_at   timestamptz not null default now()
);
alter table brand_suggestions enable row level security;
create policy "brand_suggestions_insert_own" on brand_suggestions for insert with check (auth.uid() = user_id);
