-- Let the app celebrate the signup bonus exactly once. Run once via the
-- Supabase SQL editor (or `supabase db push`). Amends 0016.
--
-- A silent +100 is a wasted moment — the bonus only does its job if the new
-- player notices it. Knowing "this is a first login" has to survive the app
-- being closed before the notice is seen, so it is a column rather than
-- anything in memory or localStorage.
--
-- Why not infer it from profiles.created_at being recent: a player who signs up
-- on a bad connection, or force-quits before the intro renders, would lose the
-- notice for good — and a clock-skewed device would show it at the wrong time.
-- A flag that is only ever cleared once is exact.

-- Defaults to true so every EXISTING row backfills as already-seen: nobody who
-- signed up before 0016 gets a notice for a bonus they never received. New rows
-- set it false explicitly in the trigger below, the same way the bonus itself
-- is granted explicitly rather than by column default.
alter table profiles
  add column welcome_bonus_seen boolean not null default true;

-- Replaces the 0016 version. Only the new column is added.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, pgs_player_id, coins, welcome_bonus_seen)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'pgs_player_id',
    signup_bonus(),
    false
  );
  return new;
end $$;

-- Called once the player has actually seen the welcome notice. Idempotent and
-- one-way: there is no path back to false, so the notice can never be shown a
-- second time. Grants nothing, so it is safe for clients to call.
create function mark_welcome_bonus_seen() returns void
language sql security definer set search_path = public as $$
  update profiles set welcome_bonus_seen = true
   where id = auth.uid() and welcome_bonus_seen = false;
$$;
