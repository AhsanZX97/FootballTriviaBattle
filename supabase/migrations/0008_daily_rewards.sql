-- Daily login reward, 7-day streak, and daily-challenge coin claims. Run once
-- via the Supabase SQL editor (or `supabase db push`). Builds on 0001_accounts.
--
-- Money rules, same shape as 0001/0004:
--   * Coins only ever change through a security-definer RPC — clients still have
--     no insert/update policy on profiles.
--   * Streak state (last claim date + day-in-cycle) lives server-side so the
--     device clock can't be rolled forward to farm rewards. The client date is
--     only ever used to *offer* a claim; current_date here is the source of truth.
--
-- Reward schedule: +5 coins per day, +20 on day 7. The 7-day cycle then repeats
-- (day 8 is day 1 again). Missing a day resets the streak to day 1.

-- Day-in-cycle (1..7) of the last claimed reward, and the date it was claimed.
alter table profiles
  add column daily_reward_streak integer not null default 0
    check (daily_reward_streak between 0 and 7),
  add column last_daily_reward_date date;

-- Claim today's login reward. Idempotent per day: a second call the same day
-- awards nothing and reports already_claimed. Returns jsonb so one round-trip
-- carries the new balance, the resulting streak day, and the coins granted:
--   {"already_claimed": false, "coins": <balance>, "streak": 1..7, "reward": 5|20}
--   {"already_claimed": true,  "coins": <balance>, "streak": 1..7, "reward": 0}
create function claim_daily_reward() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_last date;
  v_streak integer;
  v_new_streak integer;
  v_reward integer;
  v_balance integer;
begin
  select last_daily_reward_date, daily_reward_streak
    into v_last, v_streak
    from profiles where id = auth.uid();

  if not found then
    -- no profile row for this uid (shouldn't happen for a signed-in user)
    return null;
  end if;

  if v_last = current_date then
    select coins into v_balance from profiles where id = auth.uid();
    return jsonb_build_object(
      'already_claimed', true, 'coins', v_balance,
      'streak', v_streak, 'reward', 0);
  end if;

  -- Consecutive day advances the cycle (wrapping 7 -> 1); any gap resets to 1.
  if v_last = current_date - 1 then
    v_new_streak := case when v_streak >= 7 then 1 else v_streak + 1 end;
  else
    v_new_streak := 1;
  end if;

  v_reward := case when v_new_streak = 7 then 20 else 5 end;

  update profiles set
    coins = coins + v_reward,
    daily_reward_streak = v_new_streak,
    last_daily_reward_date = current_date
  where id = auth.uid()
  returning coins into v_balance;

  return jsonb_build_object(
    'already_claimed', false, 'coins', v_balance,
    'streak', v_new_streak, 'reward', v_reward);
end $$;

-- Per-day record of which daily challenges a player has cashed in. The
-- composite primary key is what makes claiming idempotent: the second insert for
-- the same (user, challenge, day) hits the conflict and grants nothing.
create table daily_challenge_claims (
  user_id uuid not null references profiles(id) on delete cascade,
  challenge_id text not null,
  claim_date date not null default current_date,
  primary key (user_id, challenge_id, claim_date)
);

alter table daily_challenge_claims enable row level security;

-- Readable only for your own rows. No insert policy: claims go through the
-- security-definer RPC below.
create policy "own challenge claims readable" on daily_challenge_claims
  for select using (auth.uid() = user_id);

-- Claim a completed daily challenge's coin reward. The reward amount lives here,
-- never on the client, so a tampered client can't pick its own payout. Progress
-- toward the goal is tracked client-side (see src/features/challenges/store.ts);
-- this RPC only guarantees each challenge pays out at most once per day.
-- Returns the new balance, or null if already claimed today / unknown id.
create function claim_daily_challenge(p_challenge_id text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_reward integer;
  v_balance integer;
begin
  v_reward := case p_challenge_id
    when 'answer_15'    then 10
    when 'win_2_cpu'    then 15
    when 'score_5_pens' then 10
    when 'win_1v1'      then 20
    else 0 end;
  if v_reward = 0 then
    return null;
  end if;

  insert into daily_challenge_claims (user_id, challenge_id)
  values (auth.uid(), p_challenge_id)
  on conflict do nothing;
  if not found then
    return null; -- already claimed today
  end if;

  update profiles set coins = coins + v_reward
   where id = auth.uid()
   returning coins into v_balance;
  return v_balance;
end $$;
