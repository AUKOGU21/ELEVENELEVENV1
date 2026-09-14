-- The way back in: "Email me a sign-in link".
--
-- A friend created an account, landed back on the form, and Chrome offered her
-- a second strong password on top of the first. Six sign-ins failed and the app
-- had nothing to offer: no reset, no link. The send-sign-in-link edge function
-- generates the link with the admin API and mails it through Resend, because
-- Supabase's own auth mail on this project is capped at two emails an hour.
--
-- Both objects are server-only. RLS on the table with no policies, and the
-- function is callable by service_role alone.

-- Throttle: one link a minute and five an hour per address.
create table if not exists public.sign_in_link_requests (
  id bigint generated always as identity primary key,
  email text not null,
  created_at timestamptz not null default now(),
  sent boolean not null default false
);
create index if not exists sign_in_link_requests_email_time
  on public.sign_in_link_requests (lower(email), created_at desc);
alter table public.sign_in_link_requests enable row level security;

-- Does this address have an account? A link may only ever sign in an existing
-- account, never create one.
create or replace function public.user_id_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u
  where lower(u.email) = lower(trim(p_email)) and u.deleted_at is null
  limit 1;
$$;
revoke all on function public.user_id_for_email(text) from public, anon, authenticated;
grant execute on function public.user_id_for_email(text) to service_role;
