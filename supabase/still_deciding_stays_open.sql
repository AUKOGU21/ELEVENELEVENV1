-- Still deciding is a pause, not an ending.
--
-- The outcome trigger was a two-way case: bought it, or everything else. That
-- put "still deciding" in the same bucket as "didn't buy" and closed the post.
-- It also quietly undid the front end, which does the right thing already:
-- quickStillDeciding in Feed.tsx deliberately leaves status alone, and this
-- trigger overrode it a millisecond later.
--
-- A closed post stops taking recommendations. So a woman saying she was still
-- thinking about it was shutting the door on the answers she was waiting for.
-- Karina closed three of her own posts this way in twenty-two seconds, one of
-- them the shoulder bag three people had recommended into.

create or replace function public.set_decision_status_from_outcome()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  next_status text;
begin
  next_status := case
    when coalesce(new.did_purchase, new.outcome_type = 'bought_it') then 'purchased'
    when new.outcome_type = 'still_deciding' then 'open'
    else 'closed'
  end;

  update public.decisions
     set status = next_status
   where id = new.decision_id
     and status is distinct from next_status;

  return new;
end $function$;

-- Reopen the six that were closed by the old rule. Judged on each decision's
-- most recent outcome, so a post that was paused and later actually bought
-- keeps its purchase.
with latest as (
  select distinct on (decision_id) decision_id, outcome_type
  from public.outcomes
  order by decision_id, created_at desc
)
update public.decisions d
   set status = 'open'
  from latest l
 where l.decision_id = d.id
   and l.outcome_type = 'still_deciding'
   and d.status <> 'open'
   and d.deleted_at is null;
