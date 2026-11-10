-- Striker slot: the penalty taker's appearance, a fourth customization slot
-- beside gk_skin / ball_skin / goal_sound. Builds on 0003/0004.
--
-- RUN THIS BEFORE shipping a client that selects profiles.striker_skin; the
-- auth store reads the column on every profile fetch.
--
-- Mirrors src/services/shopCatalogue.ts: this copy is what purchase_item
-- actually charges. Keep ids/prices identical across the two.

alter table profiles
  add column striker_skin text not null default 'default';

alter table shop_items drop constraint shop_items_slot_check;
alter table shop_items add constraint shop_items_slot_check
  check (slot in ('gkSkin', 'ballSkin', 'goalSound', 'striker'));

insert into shop_items (id, slot, name, price) values
  ('striker_ronaldo', 'striker', 'Portugal Striker', 1000);

-- Same rules as 0004's version (owned + belongs to the slot, 'default' exempt),
-- with the fourth slot added.
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
    gk_skin     = case when p_slot = 'gkSkin'    then p_item_id else gk_skin end,
    ball_skin   = case when p_slot = 'ballSkin'  then p_item_id else ball_skin end,
    goal_sound  = case when p_slot = 'goalSound' then p_item_id else goal_sound end,
    striker_skin = case when p_slot = 'striker'  then p_item_id else striker_skin end
  where id = auth.uid()
    and p_slot in ('gkSkin', 'ballSkin', 'goalSound', 'striker');
  get diagnostics affected = row_count;
  return affected > 0;
end $$;
