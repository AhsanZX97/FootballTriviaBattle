-- Shop catalogue, ownership and purchases. Run once via the Supabase SQL editor
-- (or `supabase db push`). Builds on 0003_customization.sql, which added the
-- equipped-slot columns and the first cut of set_customization.
--
-- 0003 deliberately shipped without ownership: there was nothing to own. This
-- migration adds the catalogue and the coin purchase path, and replaces
-- set_customization with a version that refuses to equip an unowned item.
--
-- Money rules, same shape as 0001's coin awards:
--   * Price lives here, never on the client — purchase_item reads shop_items.
--   * The coin deduction and the ownership insert are one transaction (a
--     function body), so a player can't be charged without receiving the item.
--   * Clients cannot write owned_items or profiles directly; the security-
--     definer RPC is the only path.

create table shop_items (
  id text primary key,
  slot text not null check (slot in ('gkSkin', 'ballSkin', 'goalSound')),
  name text not null,
  price integer not null check (price >= 0)
);

alter table shop_items enable row level security;

-- The catalogue is public: the shop renders it for signed-out players too.
create policy "shop items are readable" on shop_items for select using (true);

-- Mirrors src/services/shopCatalogue.ts. The client copy drives display (it
-- also holds the bundled audio); this copy is what a player is actually
-- charged. Keep the ids and prices identical across the two.
insert into shop_items (id, slot, name, price) values
  ('goal_horn',        'goalSound', 'goal + horn',   100),
  ('gooal',            'goalSound', 'gooal',         100),
  ('goooooooooal',     'goalSound', 'GOOOOOOOOOOAL', 100),
  ('siuuuu',           'goalSound', 'SIUUUU',        100),
  ('video_game_sound', 'goalSound', 'video game sound', 100);

create table owned_items (
  user_id uuid not null references profiles(id) on delete cascade,
  item_id text not null references shop_items(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table owned_items enable row level security;

-- Readable only for your own row. No insert/update/delete policy: purchases go
-- through purchase_item below, which runs as security definer.
create policy "own items readable" on owned_items for select
  using (auth.uid() = user_id);

-- Buy an item with coins. Returns json so one round-trip carries both the
-- outcome and the resulting balance (which the client shows without a refetch):
--   {"status": "ok",                "coins": <new balance>}
--   {"status": "already_owned",     "coins": <unchanged>}
--   {"status": "insufficient_coins","coins": <unchanged>}
--   {"status": "not_found",         "coins": <unchanged>}
--
-- The `coins >= item_price` guard lives in the UPDATE's WHERE clause rather
-- than a prior SELECT: that makes the check-and-debit a single atomic
-- statement, so two purchases racing on one account can't both pass a balance
-- check and overdraw it. profiles.coins also carries a `>= 0` check constraint
-- as a backstop.
create function purchase_item(p_item_id text) returns json
language plpgsql security definer set search_path = public as $$
declare
  item_price integer;
  new_balance integer;
  current_balance integer;
begin
  select coins into current_balance from profiles where id = auth.uid();
  if current_balance is null then
    return json_build_object('status', 'not_found', 'coins', 0);
  end if;

  select price into item_price from shop_items where id = p_item_id;
  if item_price is null then
    return json_build_object('status', 'not_found', 'coins', current_balance);
  end if;

  if exists (select 1 from owned_items
              where user_id = auth.uid() and item_id = p_item_id) then
    return json_build_object('status', 'already_owned', 'coins', current_balance);
  end if;

  update profiles set coins = coins - item_price
   where id = auth.uid() and coins >= item_price
   returning coins into new_balance;

  if new_balance is null then
    return json_build_object('status', 'insufficient_coins', 'coins', current_balance);
  end if;

  insert into owned_items (user_id, item_id) values (auth.uid(), p_item_id);
  return json_build_object('status', 'ok', 'coins', new_balance);
end $$;

-- The caller's owned item ids. The shop unions this with the catalogue to know
-- which tiles are buyable and which are already theirs.
create function list_owned_items() returns table (item_id text)
language sql security definer set search_path = public as $$
  select o.item_id from owned_items o where o.user_id = auth.uid();
$$;

-- Replaces 0003's version. Same contract, plus the ownership rule now that
-- there are items to own: an item must be owned by the caller AND belong to the
-- slot being set. 'default' is the stock look/sound — always equippable, never
-- owned, so it is exempt.
create or replace function set_customization(p_slot text, p_item_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  if p_item_id is null or char_length(p_item_id) = 0 then
    return false;
  end if;

  if p_item_id <> 'default' and not exists (
    select 1 from owned_items o
      join shop_items s on s.id = o.item_id
     where o.user_id = auth.uid()
       and o.item_id = p_item_id
       and s.slot = p_slot
  ) then
    return false;
  end if;

  update profiles set
    gk_skin    = case when p_slot = 'gkSkin'    then p_item_id else gk_skin end,
    ball_skin  = case when p_slot = 'ballSkin'  then p_item_id else ball_skin end,
    goal_sound = case when p_slot = 'goalSound' then p_item_id else goal_sound end
  where id = auth.uid()
    and p_slot in ('gkSkin', 'ballSkin', 'goalSound');
  get diagnostics affected = row_count;
  return affected > 0;
end $$;
