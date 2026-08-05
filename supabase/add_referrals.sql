-- ── Referral flow / Shopping Circle ───────────────────────────────────────────
-- A lightweight inviter→invitee relationship. No follower counts, no social feed,
-- no public friend lists — just the stored relationship (future: prioritize a
-- user's circle in matching; NOT built now).
alter table public.profiles
  add column if not exists invite_code text unique,
  add column if not exists referral_prompt_dismissed_at timestamptz;

create table if not exists public.referrals (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  inviter_id  uuid not null references auth.users(id) on delete cascade,
  invitee_id  uuid not null references auth.users(id) on delete cascade,
  check (inviter_id <> invitee_id),
  unique (invitee_id)            -- a person joins via one circle
);
alter table public.referrals enable row level security;
drop policy if exists referrals_read_involved  on public.referrals;
drop policy if exists referrals_insert_invitee on public.referrals;
create policy referrals_read_involved  on public.referrals for select using (auth.uid() = inviter_id or auth.uid() = invitee_id);
create policy referrals_insert_invitee on public.referrals for insert with check (auth.uid() = invitee_id);
