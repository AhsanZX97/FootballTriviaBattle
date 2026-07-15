-- Customization schema. Run once via the Supabase SQL editor (or
-- `supabase db push` once the CLI is linked). Builds on 0001_accounts.sql.
--
-- Cosmetics are bound to the character, i.e. the profile row itself — one
-- equipped item per slot, three slots:
--   gk_skin    the goalkeeper's appearance
--   ball_skin  the football's appearance
--   goal_sound the sting played on a scored goal
-- Every slot starts at 'default' (the stock look/sound), so a profile is always
-- renderable without a catalogue lookup. The shop's item catalogue and coin
-- purchases land in a later migration; today the slots only ever hold
-- 'default', and set_customization is the single write path for when they
-- don't. As in 0001/0002, clients never write profiles directly — the RPC is
-- security definer and profiles has no client update policy.

alter table profiles
  add column gk_skin    text not null default 'default',
  add column ball_skin  text not null default 'default',
  add column goal_sound text not null default 'default';

-- Equip an item in one slot for the calling user. p_slot names the slot using
-- the client-side identifier ('gkSkin' | 'ballSkin' | 'goalSound') so the UI
-- has no snake_case mapping to keep in sync. Returns true if the profile was
-- updated, false for an unknown slot or a missing profile.
--
-- No ownership check yet: with no purchasable items there is nothing to own.
-- Once the catalogue exists this function is where that check belongs — it
-- runs as security definer, so it is the only place a slot can be written.
create function set_customization(p_slot text, p_item_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  if p_item_id is null or char_length(p_item_id) = 0 then
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
