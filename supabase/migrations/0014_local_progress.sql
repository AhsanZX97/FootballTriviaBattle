-- Claiming on-device progress into an account. Run once via the Supabase SQL
-- editor (or `supabase db push`). Builds on 0001_accounts and 0008_match_history.
--
-- Why this exists: manual signups were barely happening (see CLAUDE.md on the
-- Play Games path), so coins, match history and daily challenges now accrue in
-- localStorage before a player has an account at all. This RPC is the door they
-- come through afterwards.
--
-- TRUST BOUNDARY, and it is a wide one: every number here comes from
-- localStorage, which the player owns and can edit. There is no way to verify a
-- claim after the fact — the device was offline-capable and unauthenticated by
-- design. So the cap below is not a rate limit, it is the *entire* defence:
--
--   * The lifetime cap bounds what an account can ever receive from local
--     progress, across every claim it ever makes. Not per-claim and not
--     per-day — those both fall to signing out, farming, and signing back in.
--   * profiles.local_claimed_coins is the running total that makes the cap
--     stick. A second claim can only take what the first one left.
--   * Match rows are cosmetic (they pay nothing), but are still row-capped and
--     validated so a forged payload can't bloat the table.
--
-- The cap is deliberately set below the smallest paid coin pack: claiming must
-- never be a cheaper substitute for buying.

alter table profiles
  add column local_claimed_coins integer not null default 0;

-- Coins an account may ever receive from on-device progress, in total. Sized at
-- roughly a week of honest pre-signup play (a heavy day is ~50-70 coins: 15 from
-- daily challenges, the rest from 1v1 results at 3 a win). A function rather
-- than a literal so the number has one home when it needs tuning.
create function local_claim_lifetime_cap() returns integer
language sql immutable as $$ select 300 $$;

-- Bank whatever this device earned while signed out. Returns
-- {coins, granted} — the new balance, and how much of the request survived the
-- cap so the client can show an honest "+N".
--
-- Superseded by 0015, which replaces this with a version that also carries the
-- login-reward streak. Left as-is because it has already been applied.
--
-- `p_coins` is the device's claimed total; the grant is whatever is left of the
-- account's lifetime allowance, so an inflated request is silently trimmed
-- rather than rejected. An honest player near the cap should still get what
-- they can, and a dishonest one learns nothing from the response.
create function claim_local_progress(p_coins integer, p_matches jsonb default '[]'::jsonb)
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

  update profiles
     set coins = coins + granted,
         local_claimed_coins = local_claimed_coins + granted
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
