-- Level mode, phase 1: per-question coin payouts. Run once via the Supabase
-- SQL editor (or `supabase db push`). Builds on 0001_accounts.
--
-- TRUST BOUNDARY, deliberate: the question bank ships in the APK, so whether
-- the player actually answered correctly is client-trusted, exactly like the
-- daily challenges. The defence is the bound: every question pays at most once
-- per account (the primary key on level_solves), and the amount is computed
-- here from a clamped try count, never taken from the client. The worst a
-- tampered client can do is collect 3 coins per question in the manifest, once.

-- Which bank ids are level questions. Seeded from src/game/levels/manifest.ts,
-- which is append-only; later phases append rows, never renumber.
create table level_questions (
  question_id text primary key,
  level integer not null check (level >= 1)
);

alter table level_questions enable row level security;
-- No policies: read only through the security-definer RPCs.

insert into level_questions (question_id, level) values
  ('wc-1', 1);

create table level_solves (
  user_id uuid not null references profiles(id) on delete cascade,
  question_id text not null references level_questions(question_id),
  wrong_tries integer not null check (wrong_tries >= 0),
  coins_paid integer not null check (coins_paid >= 0),
  solved_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table level_solves enable row level security;

-- Players read only their own solves. No write policy: every insert goes
-- through claim_level_question so the payout can't be forged.
create policy "own level solves readable" on level_solves
  for select using (auth.uid() = user_id);

-- 3 -> 2 -> 1 by wrong tries, floored at 1. Mirrors coinsForTries in
-- src/game/levels/rewards.ts; this one is what actually pays.
create function level_coins_for_tries(p_wrong_tries integer) returns integer
language sql immutable as $$
  select greatest(1, 3 - greatest(coalesce(p_wrong_tries, 0), 0));
$$;

-- Record a solved level question and pay for it, once.
--   { status: 'ok',              coins_paid, coins, wrong_tries }
--   { status: 'already_solved',  coins_paid: 0, coins, wrong_tries }  (the original row's tries)
--   { status: 'unknown_question' }
-- The insert's ON CONFLICT is the once-only guarantee: two racing calls for
-- the same question can't both insert, so only one of them reaches the payout.
create function claim_level_question(p_question_id text, p_wrong_tries integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tries integer := least(greatest(coalesce(p_wrong_tries, 0), 0), 99);
  pay integer;
  balance integer;
  prior_tries integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  if not exists (select 1 from level_questions where question_id = p_question_id) then
    return jsonb_build_object('status', 'unknown_question');
  end if;

  pay := level_coins_for_tries(tries);

  insert into level_solves (user_id, question_id, wrong_tries, coins_paid)
  values (uid, p_question_id, tries, pay)
  on conflict (user_id, question_id) do nothing;

  if not found then
    select wrong_tries into prior_tries
      from level_solves where user_id = uid and question_id = p_question_id;
    select coins into balance from profiles where id = uid;
    return jsonb_build_object(
      'status', 'already_solved', 'coins_paid', 0, 'coins', balance, 'wrong_tries', prior_tries);
  end if;

  balance := increment_coins(uid, pay);
  return jsonb_build_object('status', 'ok', 'coins_paid', pay, 'coins', balance, 'wrong_tries', tries);
end $$;

-- Postgres grants EXECUTE to PUBLIC by default; revoke that, then let only
-- signed-in players call it.
revoke execute on function claim_level_question(text, integer) from public, anon;
grant execute on function claim_level_question(text, integer) to authenticated;
