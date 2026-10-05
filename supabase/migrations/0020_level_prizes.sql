-- Level mode, phase 2: the full Level 1, level prizes, and carrying offline
-- progress into an account. Run once via the Supabase SQL editor (or
-- `supabase db push`). Builds on 0004_customization_shop and 0019_level_mode.
--
-- TRUST BOUNDARY, same as 0019: answers are client-trusted, so the defence is
-- the bound. Every prize is claimable at most once per account (the primary
-- key on level_prize_claims), only once every question in its level has a
-- level_solves row, and what it grants is read from level_prizes, never taken
-- from the client. claim_level_prize is the first FREE grant into owned_items;
-- purchase_item stays the only paid path.

-- Level 1's 24 cards, from `npx tsx scripts/buildLevels.ts --sql 1-1`.
-- wc-1 is already seeded by 0019; ON CONFLICT keeps that row.
insert into level_questions (question_id, level) values
  ('pt-0', 1),
  ('pp-0', 1),
  ('pl-0', 1),
  ('lg-1', 1),
  ('ec-0', 1),
  ('wc-1', 1),
  ('nt-0', 1),
  ('re-0', 1),
  ('cl-0', 1),
  ('ru-0', 1),
  ('pt-1', 1),
  ('pp-1', 1),
  ('pt-2', 1),
  ('pp-2', 1),
  ('pl-1', 1),
  ('lg-2', 1),
  ('ec-7', 1),
  ('wc-2', 1),
  ('nt-1', 1),
  ('re-1', 1),
  ('cl-2', 1),
  ('pt-3', 1),
  ('ru-1', 1),
  ('pp-3', 1)
on conflict (question_id) do nothing;

-- One prize per level: a shop item, or a coin chest. An item the player
-- already owns pays its shop price instead, so a prize is never nothing.
-- Mirrors levelPrize in src/game/levels/rewards.ts.
create table level_prizes (
  level integer primary key check (level >= 1),
  item_id text references shop_items(id),
  coins integer not null default 0 check (coins >= 0),
  check ((item_id is null) <> (coins = 0))
);

alter table level_prizes enable row level security;
-- No policies: read only through the security-definer RPCs.

insert into level_prizes (level, item_id, coins) values
  (1, 'goal_horn', 0);

create table level_prize_claims (
  user_id uuid not null references profiles(id) on delete cascade,
  level integer not null references level_prizes(level),
  -- The item actually granted; null when the prize paid coins instead.
  item_id text references shop_items(id),
  coins_paid integer not null check (coins_paid >= 0),
  claimed_at timestamptz not null default now(),
  primary key (user_id, level)
);

alter table level_prize_claims enable row level security;

create policy "own level prize claims readable" on level_prize_claims
  for select using (auth.uid() = user_id);

-- True when the level has questions and the caller has solved all of them.
-- The has-questions half matters: without it an unseeded level would count as
-- vacuously complete.
create function level_is_complete(p_user uuid, p_level integer) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from level_questions where level = p_level)
     and not exists (
       select 1 from level_questions q
        where q.level = p_level
          and not exists (
            select 1 from level_solves s
             where s.user_id = p_user and s.question_id = q.question_id));
$$;

revoke execute on function level_is_complete(uuid, integer) from public, anon, authenticated;

-- Claim a finished level's prize, once.
--   { status: 'ok', item_id, coins_paid, coins }   item_id null for coins
--   { status: 'already_claimed', coins }
--   { status: 'incomplete' }                        not every question solved
--   { status: 'unknown_level' }
-- The claim row is inserted first and its ON CONFLICT is the once-only
-- guarantee: two racing calls can't both insert, so only one reaches a grant.
create function claim_level_prize(p_level integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prize level_prizes%rowtype;
  granted_item text;
  pay integer;
  balance integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select * into prize from level_prizes where level = p_level;
  if not found then
    return jsonb_build_object('status', 'unknown_level');
  end if;

  if not level_is_complete(uid, p_level) then
    return jsonb_build_object('status', 'incomplete');
  end if;

  if prize.item_id is not null and not exists (
    select 1 from owned_items where user_id = uid and item_id = prize.item_id
  ) then
    granted_item := prize.item_id;
    pay := 0;
  elsif prize.item_id is not null then
    select price into pay from shop_items where id = prize.item_id;
  else
    pay := prize.coins;
  end if;

  insert into level_prize_claims (user_id, level, item_id, coins_paid)
  values (uid, p_level, granted_item, pay)
  on conflict (user_id, level) do nothing;

  if not found then
    select coins into balance from profiles where id = uid;
    return jsonb_build_object('status', 'already_claimed', 'coins', balance);
  end if;

  if granted_item is not null then
    insert into owned_items (user_id, item_id) values (uid, granted_item)
    on conflict (user_id, item_id) do nothing;
  end if;

  if pay > 0 then
    balance := increment_coins(uid, pay);
  else
    select coins into balance from profiles where id = uid;
  end if;

  return jsonb_build_object(
    'status', 'ok', 'item_id', granted_item, 'coins_paid', pay, 'coins', balance);
end $$;

revoke execute on function claim_level_prize(integer) from public, anon;
grant execute on function claim_level_prize(integer) to authenticated;

-- The caller's level progress, for hydrating the client:
--   { solved: { question_id: wrong_tries, ... }, prizes: [level, ...] }
create function list_level_progress() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'solved', coalesce(
      (select jsonb_object_agg(question_id, wrong_tries)
         from level_solves where user_id = auth.uid()),
      '{}'::jsonb),
    'prizes', coalesce(
      (select jsonb_agg(level order by level)
         from level_prize_claims where user_id = auth.uid()),
      '[]'::jsonb));
$$;

revoke execute on function list_level_progress() from public, anon;
grant execute on function list_level_progress() to authenticated;

-- Carry progress made while signed out into the account. Pays NO coins: the
-- device already paid them into local coins, which reach the account through
-- claim_local_progress and its lifetime cap. So solves land with coins_paid 0,
-- and a prize the device claimed lands as a claim with coins_paid 0 — granting
-- its item if the account doesn't own it, and nothing otherwise.
--
--   p_solved: { question_id: wrong_tries }   unknown ids are ignored
--   p_prizes: [level, ...]                   honoured only for complete levels
-- Returns list_level_progress() afterwards, so one round trip hydrates too.
create function import_level_progress(p_solved jsonb, p_prizes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  claimed_level integer;
  prize level_prizes%rowtype;
  granted_item text;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  if jsonb_typeof(p_solved) = 'object' then
    insert into level_solves (user_id, question_id, wrong_tries, coins_paid)
    select uid, q.question_id,
           case when jsonb_typeof(e.value) = 'number'
                then least(greatest(floor((e.value #>> '{}')::numeric), 0), 99)::integer
                else 0 end, 0
      from jsonb_each(p_solved) e
      join level_questions q on q.question_id = e.key
     where jsonb_typeof(e.value) = 'number'
    on conflict (user_id, question_id) do nothing;
  end if;

  if jsonb_typeof(p_prizes) = 'array' then
    for claimed_level in
      select distinct (v #>> '{}')::numeric::integer
        from jsonb_array_elements(p_prizes) v
       where case when jsonb_typeof(v) = 'number'
                  then (v #>> '{}')::numeric between 1 and 10000
                  else false end
    loop
      select * into prize from level_prizes where level = claimed_level;
      continue when not found or not level_is_complete(uid, claimed_level);

      granted_item := null;
      if prize.item_id is not null and not exists (
        select 1 from owned_items where user_id = uid and item_id = prize.item_id
      ) then
        granted_item := prize.item_id;
      end if;

      insert into level_prize_claims (user_id, level, item_id, coins_paid)
      values (uid, claimed_level, granted_item, 0)
      on conflict (user_id, level) do nothing;

      if found and granted_item is not null then
        insert into owned_items (user_id, item_id) values (uid, granted_item)
        on conflict (user_id, item_id) do nothing;
      end if;
    end loop;
  end if;

  return list_level_progress();
end $$;

revoke execute on function import_level_progress(jsonb, jsonb) from public, anon;
grant execute on function import_level_progress(jsonb, jsonb) to authenticated;
