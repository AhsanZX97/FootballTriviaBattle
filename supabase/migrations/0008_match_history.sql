-- Match history & win/loss tracking. Run once via the Supabase SQL editor (or
-- `supabase db push`). Records one row per authed player per finished match:
-- vs-CPU rows come from the client (record_cpu_match), 1v1 rows from the WS
-- server using the service-role key (record_1v1_match).

create table match_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  mode text not null check (mode in ('cpu', '1v1')),
  -- 'CPU' for a vs-CPU game, otherwise the opponent's display name at match time.
  opponent_name text not null,
  outcome text not null check (outcome in ('win', 'loss')),
  user_score integer not null check (user_score >= 0),
  opponent_score integer not null check (opponent_score >= 0),
  -- True when the match ended by disconnect/quit rather than at full time.
  by_disconnect boolean not null default false,
  created_at timestamptz not null default now()
);

-- The stat tab only ever reads a user's own most-recent rows.
create index match_history_user_recent on match_history (user_id, created_at desc);

alter table match_history enable row level security;

-- Players read only their own history. No insert/update/delete policy for
-- clients: every write goes through the security-definer RPCs below, so a
-- client can never forge a result for themselves or anyone else.
create policy "own match history readable" on match_history
  for select using (auth.uid() = user_id);

-- Client-called: record a finished vs-CPU match for the signed-in user. Unlike
-- award_cpu_win this is never rate-limited — history should log every game,
-- win or loss, even when the coin award is on cooldown.
create function record_cpu_match(
  p_outcome text,
  p_user_score integer,
  p_opponent_score integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_outcome not in ('win', 'loss') then return; end if;
  insert into match_history (user_id, mode, opponent_name, outcome, user_score, opponent_score, by_disconnect)
  values (auth.uid(), 'cpu', 'CPU', p_outcome,
          greatest(coalesce(p_user_score, 0), 0), greatest(coalesce(p_opponent_score, 0), 0), false);
end $$;

-- Server-only (service role): record one player's row for a finished 1v1. The
-- server calls this once per authed player, with scores/outcome already framed
-- from that player's perspective. Stays revoked from clients (see below).
create function record_1v1_match(
  p_user_id uuid,
  p_opponent_name text,
  p_outcome text,
  p_user_score integer,
  p_opponent_score integer,
  p_by_disconnect boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_outcome not in ('win', 'loss') then return; end if;
  insert into match_history (user_id, mode, opponent_name, outcome, user_score, opponent_score, by_disconnect)
  values (p_user_id, '1v1', left(coalesce(nullif(trim(p_opponent_name), ''), 'Player'), 40), p_outcome,
          greatest(coalesce(p_user_score, 0), 0), greatest(coalesce(p_opponent_score, 0), 0),
          coalesce(p_by_disconnect, false));
end $$;

-- Same reasoning as increment_coins: Postgres grants EXECUTE to PUBLIC by
-- default and anon/authenticated inherit it, so the revoke is what keeps this
-- a service-role-only entry point that a client can't call to forge results.
revoke execute on function record_1v1_match from public, anon, authenticated;

-- The stat tab's whole payload in one call: lifetime win/loss tally plus the
-- five most recent matches, keyed to the caller via auth.uid(). Column aliases
-- are camelCase so the client can use the JSON as-is (see MatchHistoryEntry).
create function get_match_stats() returns json
language sql security definer set search_path = public stable as $$
  select json_build_object(
    'wins',   (select count(*) from match_history where user_id = auth.uid() and outcome = 'win'),
    'losses', (select count(*) from match_history where user_id = auth.uid() and outcome = 'loss'),
    'recent', coalesce((
      select json_agg(row_to_json(r)) from (
        select mode,
               opponent_name  as "opponentName",
               outcome,
               user_score     as "userScore",
               opponent_score as "opponentScore",
               by_disconnect  as "byDisconnect",
               created_at     as "createdAt"
        from match_history
        where user_id = auth.uid()
        order by created_at desc
        limit 5
      ) r
    ), '[]'::json)
  )
$$;
