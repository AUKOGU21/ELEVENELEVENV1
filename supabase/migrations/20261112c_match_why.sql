-- ── match_why ────────────────────────────────────────────────────────────────
-- Everything the "Why her?" panel (tap the match %) needs for one post, in one
-- call: the poster's profile, and for each woman who weighed in or recommended,
-- her profile plus what she's earned:
--   owns_item   she said "I own this exact item" on this post
--   bought      she's bought this brand (said so on a take for this brand, or
--               posted it herself and bought it)
--   fav         the brand is one of her favorite brands
--   trusted     the poster marked one of her takes/recs helpful on another post,
--               or bought something she recommended
--   calls_n / calls_right   her buy / don't buy takes on posts that closed, and
--               how many matched what the poster did
-- Signed-in members only: it carries fit answers.
create or replace function public.match_why(p_decision uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with d as (
  select id, user_id, product_category, post_type, nullif(trim(brand_name), '') as brand
  from decisions where id = p_decision and deleted_at is null
),
people as (
  select r.user_id, null::text as rec_brand
  from responses r, d
  where r.decision_id = d.id and r.deleted_at is null and r.user_id is not null and r.user_id <> d.user_id
  union
  select rc.user_id, nullif(trim(rc.brand_name), '')
  from recommendations rc, d
  where rc.looking_for_id = d.id and rc.user_id is not null and rc.user_id <> d.user_id
),
per as (
  select user_id, coalesce((select brand from d), max(rec_brand)) as brand
  from people group by user_id
),
last_outcome as (
  select distinct on (decision_id) decision_id, did_purchase, kept, chosen_recommendation_id
  from outcomes order by decision_id, created_at desc
),
prof as (
  select p.id,
    jsonb_build_object(
      'height', p.height_range,
      'silhouette', p.silhouette_preference[1],
      'top', p.top_size,
      'bottom', p.bottom_size,
      'fit', case when jsonb_typeof(p.fit_details) = 'object'
                  then (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p.fit_details) e(k, v) where k not like '\_%')
                  else '{}'::jsonb end,
      'style', to_jsonb(coalesce(p.style_aesthetics, '{}'::text[])),
      'brands', coalesce(p.favorite_brands, '[]'::jsonb)
    ) as j
  from profiles p
)
select jsonb_build_object(
  'category', (select product_category from d),
  'brand', (select brand from d),
  'poster', (select j from prof where id = (select user_id from d)),
  'people', coalesce((
    select jsonb_object_agg(per.user_id, jsonb_build_object(
      'profile', (select j from prof where id = per.user_id),
      'brand', per.brand,
      'owns_item', exists (
        select 1 from responses r, d
        where r.decision_id = d.id and r.user_id = per.user_id and r.deleted_at is null
          and r.personal_experience = 'I own this exact item'),
      'bought', per.brand is not null and (
        exists (
          select 1 from responses r join decisions d2 on d2.id = r.decision_id
          where r.user_id = per.user_id and r.deleted_at is null
            and lower(trim(d2.brand_name)) = lower(per.brand)
            and r.personal_experience in ('I own this exact item', 'I''ve bought from this brand before'))
        or exists (
          select 1 from decisions d2 join last_outcome o on o.decision_id = d2.id
          where d2.user_id = per.user_id and d2.deleted_at is null
            and lower(trim(d2.brand_name)) = lower(per.brand)
            and o.did_purchase and coalesce(o.kept, true))),
      'fav', per.brand is not null and exists (
        select 1 from profiles p, jsonb_array_elements(case when jsonb_typeof(p.favorite_brands) = 'array' then p.favorite_brands else '[]'::jsonb end) b
        where p.id = per.user_id
          and (lower(b->>'name') = lower(per.brand)
               or split_part(lower(coalesce(b->>'domain', '')), '.', 1) = regexp_replace(lower(per.brand), '[^a-z0-9]', '', 'g'))),
      'trusted', exists (
          select 1 from response_votes v join responses r on r.id = v.response_id, d
          where r.user_id = per.user_id and v.voter_id = d.user_id and v.vote_type = 'helpful' and r.decision_id <> d.id)
        or exists (
          select 1 from recommendation_votes v join recommendations rc on rc.id = v.recommendation_id, d
          where rc.user_id = per.user_id and v.voter_id = d.user_id and v.vote_type = 'helpful' and rc.looking_for_id <> d.id)
        or exists (
          select 1 from recommendations rc join last_outcome o on o.chosen_recommendation_id = rc.id
          join decisions d3 on d3.id = rc.looking_for_id, d
          where rc.user_id = per.user_id and d3.user_id = d.user_id and d3.id <> d.id),
      'calls_n', (
        select count(*) from responses r join last_outcome o on o.decision_id = r.decision_id
        where r.user_id = per.user_id and r.deleted_at is null and r.decision_id <> p_decision
          and r.recommendation in ('buy', 'do_not_buy') and o.did_purchase is not null),
      'calls_right', (
        select count(*) from responses r join last_outcome o on o.decision_id = r.decision_id
        where r.user_id = per.user_id and r.deleted_at is null and r.decision_id <> p_decision
          and ((r.recommendation = 'buy' and o.did_purchase) or (r.recommendation = 'do_not_buy' and not o.did_purchase)))
    ))
    from per
  ), '{}'::jsonb)
)
where exists (select 1 from d);
$$;

revoke all on function public.match_why(uuid) from public, anon;
grant execute on function public.match_why(uuid) to authenticated;
