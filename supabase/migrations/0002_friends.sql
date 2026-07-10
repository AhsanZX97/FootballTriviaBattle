-- Friends schema. Run once via the Supabase SQL editor (or `supabase db push`
-- once the CLI is linked). Builds on 0001_accounts.sql (profiles, citext).
--
-- One row per relationship, direction-bearing while pending:
--   requester_id sent the request to addressee_id.
--   status 'pending'  -> awaiting the addressee's response
--   status 'accepted' -> they are friends (direction no longer meaningful)
-- A declined request is deleted (so the pair can try again later), never kept.
-- All writes go through the security-definer RPCs below, never a direct client
-- write — the same pattern 0001 uses for coins.

create table friendships (
  requester_id uuid not null references profiles(id) on delete cascade,
  addressee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  primary key (requester_id, addressee_id)
);

-- One relationship per unordered pair: blocks A->B and B->A coexisting, so a
-- request can't race a counter-request into two rows.
create unique index friendships_pair_uniq on friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

-- Speeds the addressee-side lookups (incoming requests, friend lists).
create index friendships_addressee_idx on friendships (addressee_id);

alter table friendships enable row level security;

-- Readable only for rows you're part of. No insert/update/delete policy: every
-- write goes through the RPCs below, which run as security definer.
create policy "own friendships readable" on friendships for select
  using (auth.uid() in (requester_id, addressee_id));

-- Send (or auto-accept) a friend request, addressing a user by username.
-- Returns a status code the client maps to UI:
--   'sent'            new pending request created
--   'accepted'        a reverse pending request existed, so this accepts it
--   'already_pending' you already have a pending request with them
--   'already_friends' you're already friends
--   'not_found'       no such username
--   'self'            you tried to add yourself
create function send_friend_request(p_username citext) returns text
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  existing friendships%rowtype;
begin
  select id into target from profiles where username = p_username;
  if target is null then
    return 'not_found';
  end if;
  if target = auth.uid() then
    return 'self';
  end if;

  select * into existing from friendships
   where least(requester_id, addressee_id) = least(auth.uid(), target)
     and greatest(requester_id, addressee_id) = greatest(auth.uid(), target);

  if found then
    if existing.status = 'accepted' then
      return 'already_friends';
    end if;
    -- pending: if they requested us first, sending back accepts it
    if existing.addressee_id = auth.uid() then
      update friendships set status = 'accepted'
       where requester_id = existing.requester_id
         and addressee_id = existing.addressee_id;
      return 'accepted';
    end if;
    return 'already_pending';
  end if;

  insert into friendships (requester_id, addressee_id) values (auth.uid(), target);
  return 'sent';
end $$;

-- Accept or decline a pending request that was sent TO the caller. Accept flips
-- it to 'accepted'; decline deletes the row. Returns true if a matching pending
-- request existed, false otherwise (already handled / never existed).
create function respond_to_friend_request(p_requester uuid, p_accept boolean)
  returns boolean
language plpgsql security definer set search_path = public as $$
declare hit boolean;
begin
  if p_accept then
    update friendships set status = 'accepted'
     where requester_id = p_requester and addressee_id = auth.uid()
       and status = 'pending';
    get diagnostics hit = row_count;
  else
    delete from friendships
     where requester_id = p_requester and addressee_id = auth.uid()
       and status = 'pending';
    get diagnostics hit = row_count;
  end if;
  return hit > 0;
end $$;

-- Remove an existing (accepted) friend, or withdraw a pending request you sent.
create function remove_friend(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare hit boolean;
begin
  delete from friendships
   where least(requester_id, addressee_id) = least(auth.uid(), p_user)
     and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_user);
  get diagnostics hit = row_count;
  return hit > 0;
end $$;

-- The caller's accepted friends, with each friend's username and coins.
create function list_friends()
  returns table (id uuid, username citext, coins integer)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.coins
    from friendships f
    join profiles p
      on p.id = case when f.requester_id = auth.uid()
                     then f.addressee_id else f.requester_id end
   where f.status = 'accepted'
     and auth.uid() in (f.requester_id, f.addressee_id)
   order by p.username;
$$;

-- The caller's pending requests, both directions. `direction` is 'incoming'
-- (someone requested you — actionable) or 'outgoing' (you requested them —
-- shown as "sent"). `other_id` is the requester for incoming, the addressee
-- for outgoing.
create function list_friend_requests()
  returns table (other_id uuid, username citext, direction text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select
    case when f.addressee_id = auth.uid() then f.requester_id else f.addressee_id end,
    p.username,
    case when f.addressee_id = auth.uid() then 'incoming' else 'outgoing' end,
    f.created_at
    from friendships f
    join profiles p
      on p.id = case when f.addressee_id = auth.uid()
                     then f.requester_id else f.addressee_id end
   where f.status = 'pending'
     and auth.uid() in (f.requester_id, f.addressee_id)
   order by f.created_at desc;
$$;

-- Username prefix search for the "add a friend" box. Excludes the caller and
-- reports the caller's current relationship with each hit so the UI can render
-- the Add / Requested / Friends button state without a second round-trip.
--   relationship: 'friends' | 'outgoing' | 'incoming' | 'none'
create function search_users(p_query citext)
  returns table (id uuid, username citext, relationship text)
language sql security definer set search_path = public as $$
  select
    p.id,
    p.username,
    coalesce((
      select case
               when f.status = 'accepted' then 'friends'
               when f.requester_id = auth.uid() then 'outgoing'
               else 'incoming'
             end
        from friendships f
       where least(f.requester_id, f.addressee_id) = least(auth.uid(), p.id)
         and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), p.id)
    ), 'none')
    from profiles p
   where p.username ilike p_query || '%'
     and p.id <> auth.uid()
   order by p.username
   limit 20;
$$;
