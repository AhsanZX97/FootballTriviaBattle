-- First gkSkin catalogue entry. Builds on 0004_customization_shop.sql, which
-- created shop_items with 'gkSkin' as an already-valid slot but never seeded
-- any rows for it.
--
-- Mirrors src/services/shopCatalogue.ts, same rule as 0004/0005: this copy is
-- what purchase_item actually charges. Keep ids/prices identical across the two.
insert into shop_items (id, slot, name, price) values
  ('gk_manuel_neuer', 'gkSkin', 'Manuel Neuer', 200);
