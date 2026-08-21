-- Carry the daily login-reward streak through a claim, too. Run once via the
-- Supabase SQL editor (or `supabase db push`). Amends 0014_local_progress.
--
-- Why a second migration rather than an edit to 0014: 0014 has already been
-- applied, and `supabase db push` tracks migrations by name — an edited 0014
-- would never re-run, leaving the deployed function and the repo out of step.
--
-- What changed: signed-out players now take the 7-day login reward on-device
-- (it is the hook that brings a player back on day two, so gating it behind a
-- signup defeats the point). Their cycle position has to follow them into the
-- account, or converting silently costs them their streak.

-- DROP then CREATE rather than CREATE OR REPLACE: the new signature has extra
-- defaulted parameters, so a bare replace would leave the 2-arg version behind
-- as a second overload and make `claim_local_progress(int, jsonb)` ambiguous.
-- Both signatures are dropped so this applies cleanly whichever version of
-- 0014 was run.
drop function if exists claim_local_progress(integer, jsonb);
drop function if exists claim_local_progress(integer, jsonb, integer, date);

-- Bank whatever this device earned while signed out: coins, match history, and
-- the login-reward streak. Returns {coins, granted} — the new balance, and how
-- much of the *coin* request survived the cap so the client can show an honest
-- "+N".
--
-- `p_coins` is the device's claimed total; the grant is whatever is left of the
-- account's lifetime allowance (see 0014's trust-boundary note — the cap is the
-- entire defence), so an inflated request is silently trimmed rather than
-- rejected. An honest player near the cap should still get what they can, and a
-- dishonest one learns nothing from the response.
create function claim_local_progress(
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
begin
  if auth.uid() is null then return null; end if;

  -- FOR UPDATE serialises concurrent claims on one account (two devices, or a
  -- retried request): the second transaction blocks here, then reads the
  -- first's local_claimed_coins and can only take what is left. Without the
  -- lock both could read the same `prior` and each grant the full allowance.
  select local_claimed_coins into prior
    from profiles where id = auth.uid() for update;
  if not found then return null; end if;

  granted := greatest(0, least(
    greatest(coalesce(p_coins, 0), 0),
    local_claim_lifetime_cap() - prior
  ));

  -- Carry the login-reward streak across, but only onto an account that has
  -- never claimed one (last_daily_reward_date is null). That makes it a genuine
  -- one-time migration for a player converting after days of pre-account play,
  -- and stops a forged streak from re-rolling an established account onto day 7
  -- (worth 20 coins instead of 5) over and over. Clamped to the cycle, and the
  -- date is only honoured if it is today or yesterday — anything else would
  -- either be a stale streak that should already have reset, or a future date.
  update profiles
     set coins = coins + granted,
         local_claimed_coins = local_claimed_coins + granted,
         daily_reward_streak = case
           when last_daily_reward_date is null
            and coalesce(p_streak, 0) between 1 and 7
            and p_streak_date in (current_date, current_date - 1)
           then p_streak else daily_reward_streak end,
         last_daily_reward_date = case
           when last_daily_reward_date is null
            and coalesce(p_streak, 0) between 1 and 7
            and p_streak_date in (current_date, current_date - 1)
           then p_streak_date else last_daily_reward_date end
   where id = auth.uid()
   returning coins into new_balance;

  -- Cosmetic history. Rows pay nothing, so the only exposure is table bloat —
  -- bounded at 25 per claim, each field validated the way record_1v1_match
  -- validates the server's own writes. Wrapped in its own block because a
  -- malformed payload (bad timestamp, non-numeric score) must not roll back the
  -- coins the player already earned: history is the disposable half of a claim.
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
    -- Swallowed on purpose: the balance below is the part that matters.
    null;
  end;

  return json_build_object('coins', new_balance, 'granted', granted);
end $$;
