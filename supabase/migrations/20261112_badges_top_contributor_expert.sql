-- Two badges replace the four-tier ladder (Contributor / Trusted Voice / Expert / E11 Insider).
--
--   Top Contributor  earned: the top 15% of people who have weighed in, ranked by
--                    helpful votes on their weigh-ins. Recomputed on every vote,
--                    weigh-in and deletion. Gaining it sends one notification;
--                    losing it is silent.
--   Expert           given by Alexis by hand (profiles.is_expert). Her profile
--                    reads like everyone's: the label, then Ask me about. She
--                    can add her experience in her own words (expert_experience),
--                    shown behind "See experience". Nothing rides on the label.
--
-- Also: favorite brands for every member, on the Style tab (favorite_brands).
--
-- profiles.badge_tier stays the single field the app reads for the ring and the
-- label: 'Expert', 'Top Contributor' or null. Expert wins over Top Contributor.
-- Members can no longer set badge_tier or is_expert on their own row.
--
-- Run in the Supabase SQL Editor BEFORE deploying the frontend that reads these columns.

-- 1. Expert, and what she writes about her expertise.
alter table public.profiles add column if not exists is_expert boolean not null default false;
alter table public.profiles add column if not exists expert_experience text;
comment on column public.profiles.is_expert is 'Set by E11 only. Makes her an Expert.';
comment on column public.profiles.expert_experience is 'Written by the expert: her experience, in her own words. Shown on her profile only, behind See experience.';

-- Every member: the brands she goes back to (Style tab, up to 8), each with its
-- website so the logo can load from Brandfetch: [{"name":"KHAITE","domain":"khaite.com"}].
alter table public.profiles add column if not exists favorite_brands jsonb;
comment on column public.profiles.favorite_brands is 'Her favorite brands, Style tab, up to 8: [{name, domain}]. domain is null for brands without a logo.';

-- 2. Members can't award themselves a badge. Only the database itself
--    (triggers, SQL Editor, service role) may change these two columns.
create or replace function public.guard_badge_columns()
returns trigger language plpgsql as $$
begin
  -- current_user, not auth.role(): refresh_badges() runs as its owner even when a
  -- member's vote set it off, and it must still be allowed to write.
  if current_user in ('anon', 'authenticated') then
    new.badge_tier := old.badge_tier;
    new.is_expert  := old.is_expert;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_badge_columns on public.profiles;
create trigger trg_guard_badge_columns
  before update on public.profiles
  for each row execute function public.guard_badge_columns();

-- 3. Where everyone stands: helpful votes, rank, and the cutoff.
--    Also the place to look for anyone close to the edge.
create or replace function public.top_contributor_standing()
returns table (user_id uuid, display_name text, weigh_ins int, helpful int, rank int, cutoff int, is_top boolean)
language sql stable security definer set search_path = public as $$
  with w as (
    select r.user_id,
           count(distinct r.id)::int as weigh_ins,
           (count(v.id) filter (where v.vote_type = 'helpful'))::int as helpful
    from responses r
    left join response_votes v on v.response_id = r.id
    where r.user_id is not null and r.deleted_at is null
    group by r.user_id
  ), ranked as (
    select w.*, rank() over (order by w.helpful desc)::int as rk,
           ceil(0.15 * count(*) over ())::int as cut
    from w
  )
  select ranked.user_id, p.display_name, ranked.weigh_ins, ranked.helpful, ranked.rk, ranked.cut,
         (ranked.helpful > 0 and ranked.rk <= ranked.cut) as is_top
  from ranked join profiles p on p.id = ranked.user_id
  order by ranked.helpful desc, ranked.weigh_ins desc;
$$;
revoke all on function public.top_contributor_standing() from anon, authenticated;

-- 4. Recompute every badge. Announces only new Top Contributors.
create or replace function public.refresh_badges()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select p.id,
           p.badge_tier as was,
           case when p.is_expert then 'Expert'
                when s.is_top then 'Top Contributor'
                else null end as now_is
    from profiles p
    left join top_contributor_standing() s on s.user_id = p.id
  loop
    if r.was is distinct from r.now_is then
      update profiles set badge_tier = r.now_is where id = r.id;
      if r.now_is = 'Top Contributor' then
        perform net.http_post(
          url := 'https://bmiquikoxxukfujnpizp.supabase.co/functions/v1/notify',
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtaXF1aWtveHh1a2Z1am5waXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTQ1NTUsImV4cCI6MjA5MDY3MDU1NX0.Q2JOtk1OZjz-XF0XbyDBw3p5cAidnB8_IEuCAqjplEA'),
          body := jsonb_build_object('type','tier','user_id',r.id,
                                     'data', jsonb_build_object('tier','Top Contributor'))
        );
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.refresh_badges() from anon, authenticated;

create or replace function public.refresh_badges_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_badges();
  return null;
end $$;

-- 5. Retire the ladder's trigger and recompute whenever standing can change.
drop trigger if exists trg_tier_promotion on public.response_votes;
drop function if exists public.announce_tier_promotion();

drop trigger if exists trg_badges_votes on public.response_votes;
create trigger trg_badges_votes
  after insert or update or delete on public.response_votes
  for each statement execute function public.refresh_badges_trigger();

drop trigger if exists trg_badges_responses on public.responses;
create trigger trg_badges_responses
  after insert or delete or update of deleted_at, user_id on public.responses
  for each statement execute function public.refresh_badges_trigger();

drop trigger if exists trg_badges_expert on public.profiles;
create trigger trg_badges_expert
  after update of is_expert on public.profiles
  for each statement execute function public.refresh_badges_trigger();

-- 6. Clear the old ladder's names, then hand out today's badges.
--    (Today: Alexis and Karina are the top 15% and each get one notification.)
update public.profiles set badge_tier = null
  where badge_tier in ('Contributor', 'Trusted Voice', 'Expert', 'E11 Insider') and not is_expert;
select public.refresh_badges();

-- Making someone an Expert, once she has an account:
--   update public.profiles set is_expert = true where id = '<her user id>';
-- Who's close to the edge:
--   select * from public.top_contributor_standing();
