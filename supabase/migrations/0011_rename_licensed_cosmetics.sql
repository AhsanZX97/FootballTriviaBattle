-- Renames every cosmetic that was named after a real person, competition or
-- product to a neutral, unbranded name. Builds on 0004/0005/0006/0007, which
-- seeded the catalogue rows this rewrites.
--
-- Why: the app is monetised, and shipping paid items called "Manuel Neuer" or
-- "2022 WC Ball" puts store listings and IAP next to third-party personal
-- likeness and trademarks (FIFA/World Cup, adidas). The names are the part
-- this migration can fix; the sprite ART still carries club crests, kit
-- sponsors and adidas/FIFA marks and has to be repainted separately.
--
-- Ids change as well as display names, so the old names don't leak through
-- API responses. That means rewriting rows other tables point at:
--   * owned_items.item_id references shop_items(id)
--   * profiles.gk_skin / ball_skin / goal_sound hold a bare item id (no FK)
-- owned_items' FK was declared `on delete cascade` only, so an id update would
-- be rejected. The constraint is redefined with `on update cascade` first —
-- both so this migration works and so any future rename does too.
--
-- Mirrors src/services/shopCatalogue.ts, same rule as 0004-0007: that copy
-- drives display, this one is what purchase_item actually charges. Keep the
-- ids and prices identical across the two.

alter table owned_items drop constraint owned_items_item_id_fkey;

alter table owned_items add constraint owned_items_item_id_fkey
  foreign key (item_id) references shop_items(id)
  on delete cascade on update cascade;

-- Old id -> new id + new display name. Anything already renamed (a re-run, or
-- a fresh DB seeded from the current catalogue) simply matches no old id and
-- is left alone.
with renames(old_id, new_id, new_name) as (values
  ('siuuuu',           'celebration_yell',    'Celebration Yell'),
  ('wc_ball_2010',     'ball_gold_trim',      'Gold Trim Ball'),
  ('wc_ball_2014',     'ball_carnival_swirl', 'Carnival Swirl Ball'),
  ('wc_ball_2018',     'ball_crimson_block',  'Crimson Block Ball'),
  ('wc_ball_2022',     'ball_neon_streak',    'Neon Streak Ball'),
  ('wc_ball_2026',     'ball_prism_panel',    'Prism Panel Ball'),
  ('gk_manuel_neuer',  'gk_green_wall',       'Green Wall Keeper'),
  ('gk_iker_casillas', 'gk_gold_standard',    'Gold Standard Keeper'),
  ('gk_vozinha',       'gk_coral_guard',      'Coral Guard Keeper'),
  ('gk_ter_stegen',    'gk_orange_blaze',     'Orange Blaze Keeper')
)
update shop_items s
   set id = r.new_id, name = r.new_name
  from renames r
 where s.id = r.old_id;
-- owned_items.item_id follows automatically via on update cascade above.

-- profiles' equipped-slot columns are plain text, not FKs, so they need their
-- own rewrite. A player who had one of these equipped keeps it equipped.
update profiles set goal_sound = 'celebration_yell' where goal_sound = 'siuuuu';

update profiles set ball_skin = case ball_skin
  when 'wc_ball_2010' then 'ball_gold_trim'
  when 'wc_ball_2014' then 'ball_carnival_swirl'
  when 'wc_ball_2018' then 'ball_crimson_block'
  when 'wc_ball_2022' then 'ball_neon_streak'
  when 'wc_ball_2026' then 'ball_prism_panel'
end
where ball_skin in ('wc_ball_2010', 'wc_ball_2014', 'wc_ball_2018',
                    'wc_ball_2022', 'wc_ball_2026');

update profiles set gk_skin = case gk_skin
  when 'gk_manuel_neuer'  then 'gk_green_wall'
  when 'gk_iker_casillas' then 'gk_gold_standard'
  when 'gk_vozinha'       then 'gk_coral_guard'
  when 'gk_ter_stegen'    then 'gk_orange_blaze'
end
where gk_skin in ('gk_manuel_neuer', 'gk_iker_casillas',
                  'gk_vozinha', 'gk_ter_stegen');
