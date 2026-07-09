-- Accounts & coins schema. Run once via the Supabase SQL editor (or
-- `supabase db push` once the CLI is linked to the project). See
-- Plans/Accounts and Coins Plan.md for the full design and rationale.

create extension if not exists citext;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique
    check (char_length(username) between 3 and 16
           and username ~ '^[A-Za-z0-9_]+$'),
  coins integer not null default 0 check (coins >= 0),
  last_cpu_award_at timestamptz,
  cpu_awards_today integer not null default 0,
  cpu_awards_date date,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable" on profiles for select using (true);
-- Intentionally no insert/update policy for clients: all writes go through
-- the trigger below or the security-definer RPCs, never a direct client write.

-- Create a profile row automatically when a new auth user signs up.
-- Expects the client to pass `username` in auth.signUp's options.data.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Pre-signup availability check, callable by anon, leaks no email data.
create function is_username_available(p_username citext) returns boolean
language sql security definer set search_path = public as $$
  select not exists (select 1 from profiles where username = p_username)
$$;

-- Client-called, rate-limited vs-CPU win award: +1 coin, >=90s cooldown,
-- capped at 50/day. Returns the new balance, or null if rate-limited.
create function award_cpu_win() returns integer
language plpgsql security definer set search_path = public as $$
declare new_balance integer;
begin
  update profiles set
    cpu_awards_today = case when cpu_awards_date = current_date
                            then cpu_awards_today + 1 else 1 end,
    cpu_awards_date  = current_date,
    last_cpu_award_at = now(),
    coins = coins + 1
  where id = auth.uid()
    and (last_cpu_award_at is null or now() - last_cpu_award_at >= interval '90 seconds')
    and (cpu_awards_date is distinct from current_date or cpu_awards_today < 50)
  returning coins into new_balance;
  return new_balance;
end $$;

-- Server-only entry point for 1v1 coin awards. Called by the WS server using
-- the service-role key, which bypasses RLS — this function stays revoked from
-- anon/authenticated so it can never be called directly by a client.
create function increment_coins(p_user_id uuid, p_amount integer) returns integer
language plpgsql security definer set search_path = public as $$
declare new_balance integer;
begin
  update profiles set coins = coins + p_amount
  where id = p_user_id returning coins into new_balance;
  return new_balance;
end $$;

-- Revoking from PUBLIC is the part that matters: Postgres grants EXECUTE on
-- new functions to PUBLIC by default, and anon/authenticated inherit that —
-- revoking from just those two roles would be a no-op.
revoke execute on function increment_coins from public, anon, authenticated;
