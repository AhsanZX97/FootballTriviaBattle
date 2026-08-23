-- Stop a daily login reward being paid twice for the same calendar day, once
-- on-device and once by the server. Run once via the Supabase SQL editor (or
-- `supabase db push`). Replaces the 0015 version of claim_local_progress.
--
-- THE BUG: 0015 only carried the login-reward date onto an account that had
-- never claimed one (`last_daily_reward_date is null`). That guard existed to
-- stop a forged streak re-rolling an established account onto day 7, but it
-- also meant a returning account never learned that today's reward had already
-- been taken on-device:
--
--   1. account claimed the daily reward yesterday, then signed out
--   2. played signed out today and claimed the local +5
--   3. signed back in -> date not carried (it wasn't null)
--   4. server still saw yesterday -> claim_daily_reward paid +5 again
--
-- THE FIX, in two halves, because the streak and the date protect different
-- things and must not share a guard:
--
--   * The DATE now always advances to the local one (when that is today or
--     yesterday), for every account. It is what blocks the double payout, and
--     moving it forward can only ever cost a player a reward they already took.
--   * The STREAK still only transfers onto a never-claimed account, which is
--     the anti-forgery guard 0015 wanted. An established cycle is never
--     rewritten by client-supplied state.
--
-- Net effect for an established account: it keeps its own streak, but is marked
-- as having claimed on the local date, so the reward cannot be taken twice.
--
-- Also now returns the resulting streak and date, so the client can refresh its
-- own copy instead of holding the pre-claim values and offering a Claim button
-- that the server will refuse.

create or replace function claim_local_progress(
  p_coins integer,
  p_matches jsonb default '[]'::jsonb,
  p_streak integer default 0,
  p_streak_date date default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  prior integer;
  granted integer;
  new_balance integer;
  new_streak integer;
  new_streak_date date;
  -- Whether the device is offering a usable login-reward position at all.
  carry boolean;
begin
  if auth.uid() is null then return null; end if;

  -- FOR UPDATE serialises concurrent claims on one account (two devices, or a
  -- retried request): the second transaction blocks here, then reads the
  -- first's local_claimed_coins and can only take what is left.
  select local_claimed_coins into prior
    from profiles where id = auth.uid() for update;
  if not found then return null; end if;

  granted := greatest(0, least(
    greatest(coalesce(p_coins, 0), 0),
    local_claim_lifetime_cap() - prior
  ));

  -- A date outside today/yesterday is either a stale streak that should already
  -- have reset, or a forgery — either way there is nothing worth carrying.
  carry := coalesce(p_streak, 0) between 1 and 7
       and p_streak_date in (current_date, current_date - 1);

  -- Every SET expression below sees the pre-UPDATE row, so both cases test the
  -- account's original last_daily_reward_date.
  update profiles
     set coins = coins + granted,
         local_claimed_coins = local_claimed_coins + granted,
         -- Streak: only onto an account with no cycle of its own.
         daily_reward_streak = case
           when carry and last_daily_reward_date is null then p_streak
           else daily_reward_streak end,
         -- Date: always advance, never retreat. GREATEST ignores a null left
         -- side, so a fresh account simply takes the device's date.
         last_daily_reward_date = case
           when carry then greatest(last_daily_reward_date, p_streak_date)
           else last_daily_reward_date end
   where id = auth.uid()
   returning coins, daily_reward_streak, last_daily_reward_date
     into new_balance, new_streak, new_streak_date;

  -- Cosmetic history. Rows pay nothing, so the only exposure is table bloat —
  -- bounded at 25 per claim, each field validated the way record_1v1_match
  -- validates the server's own writes. Its own block because a malformed
  -- payload must not roll back the coins the player already earned.
  begin
    insert into match_history (
      user_id, mode, opponent_name, outcome, user_score, opponent_score, by_disconnect, created_at
    )
    select auth.uid(),
           '1v1',
           left(coalesce(nullif(trim(m->>'opponentName'), ''), 'Player'), 40),
           m->>'outcome',
           greatest(coalesce((m->>'userScore')::integer, 0), 0),
           greatest(coalesce((m->>'opponentScore')::integer, 0), 0),
           coalesce((m->>'byDisconnect')::boolean, false),
           coalesce((m->>'createdAt')::timestamptz, now())
      from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) as m
     where m->>'outcome' in ('win', 'loss')
     limit 25;
  exception when others then
    null;
  end;

  return json_build_object(
    'coins', new_balance,
    'granted', granted,
    'streak', new_streak,
    'streak_date', new_streak_date
  );
end $$;
