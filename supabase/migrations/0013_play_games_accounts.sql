-- Play Games Services accounts. Run once via the Supabase SQL editor (or
-- `supabase db push`). Builds on 0001_accounts.
--
-- A PGS sign-in gives us a Player ID and nothing else — no email, ever. So the
-- Player ID becomes the join key between a Google account and a profile, and
-- the auth user gets a synthetic, unroutable email purely because GoTrue
-- requires one. `username` stays the identity players see and search on.

alter table profiles
  add column pgs_player_id text unique;

-- Note: 0001's "profiles are readable" policy is `using (true)`, so this column
-- is readable by any client that asks for it by name. That is accepted rather
-- than fixed: a PGS Player ID is a public gamer identifier, not a credential —
-- it grants nothing without a Google-signed auth code — and locking it down
-- would mean revoking table-level SELECT and re-granting every other column by
-- name, which then silently breaks the next migration that adds one.

-- Auto-signed-in players never see a signup form, so the trigger has to accept
-- a username the server generated for them, plus the Player ID that earned it.
-- Replaces the 0001 version; the email/password path is unchanged — it simply
-- passes no pgs_player_id, leaving the column null.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, pgs_player_id)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'pgs_player_id'
  );
  return new;
end $$;
