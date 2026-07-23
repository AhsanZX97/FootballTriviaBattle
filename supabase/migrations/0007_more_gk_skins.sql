-- More gkSkin catalogue entries. Builds on 0006_gk_skins.sql, which seeded the
-- first one (Manuel Neuer).
--
-- Mirrors src/services/shopCatalogue.ts, same rule as 0004/0005/0006: this
-- copy is what purchase_item actually charges. Keep ids/prices identical
-- across the two.
insert into shop_items (id, slot, name, price) values
  ('gk_iker_casillas', 'gkSkin', 'Iker Casillas', 200),
  ('gk_vozinha',        'gkSkin', 'Vozinha',       200),
  ('gk_ter_stegen',     'gkSkin', 'ter Stegen',    200);
