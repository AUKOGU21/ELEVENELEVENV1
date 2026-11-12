-- Top Contributor: top 15%, but never fewer than 3 places while we're small.
-- Ties at the cutoff are all in (rank()), so today that's Alexis, Karina, Ebony
-- and Ayan (Ebony and Ayan tie for 3rd). Refreshing announces the new ones.
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
           greatest(3, ceil(0.15 * count(*) over ()))::int as cut
    from w
  )
  select ranked.user_id, p.display_name, ranked.weigh_ins, ranked.helpful, ranked.rk, ranked.cut,
         (ranked.helpful > 0 and ranked.rk <= ranked.cut) as is_top
  from ranked join profiles p on p.id = ranked.user_id
  order by ranked.helpful desc, ranked.weigh_ins desc;
$$;
revoke all on function public.top_contributor_standing() from anon, authenticated;

select public.refresh_badges();
