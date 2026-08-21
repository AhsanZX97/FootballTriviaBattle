-- Welcome bonus: every new account starts with coins instead of nothing. Run
-- once via the Supabase SQL editor (or `supabase db push`). Amends 0001 and
-- 0013.
--
-- Granted in the profile-creation trigger rather than by a claimable RPC, which
-- makes "once per account" structural: the row is inserted exactly once in the
-- account's life, so there is no counter to reset, no flag to forge, and no
-- claim to replay. Both sign-up paths share this trigger — the email/password
-- form and the Play Games auto-signin (0013) — so both are covered by
-- construction rather than by remembering to change two places.
--
-- The abuse ceiling is unchanged: minting accounts was always possible, and
-- profiles.username is unique, so each bonus permanently costs a name. That is
-- the same trade already accepted for the junk accounts PGS creates.
--
-- Not retroactive, deliberately. Existing players keep their balances; this is
-- a signup incentive, not a giveaway.

-- The amount, as a function so it has one home when it needs tuning (same
-- pattern as local_claim_lifetime_cap in 0014). Sized at exactly one cosmetic:
-- a new player can immediately buy something and see what coins are for, which
-- is the point of the bonus.
create function signup_bonus() returns integer
language sql immutable as $$ select 100 $$;

-- Replaces the 0013 version. Only the coins column is added; the username and
-- pgs_player_id handling is unchanged, so the PGS path keeps working exactly as
-- CLAUDE.md describes.
--
-- The profiles.coins column default stays 0 on purpose: the bonus belongs to
-- signing up, not to the existence of a row, so any other insert path added
-- later does not silently mint coins.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, pgs_player_id, coins)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'pgs_player_id',
    signup_bonus()
  );
  return new;
end $$;
