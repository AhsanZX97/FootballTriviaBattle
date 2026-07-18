-- First ballSkin catalogue entries. Builds on 0004_customization_shop.sql,
-- which created shop_items with 'ballSkin' as an already-valid slot but never
-- seeded any rows for it.
--
-- Mirrors src/services/shopCatalogue.ts, same rule as 0004: this copy is what
-- purchase_item actually charges. Keep ids/prices identical across the two.
insert into shop_items (id, slot, name, price) values
  ('wc_ball_2010', 'ballSkin', '2010 WC Ball', 150),
  ('wc_ball_2014', 'ballSkin', '2014 WC Ball', 150),
  ('wc_ball_2018', 'ballSkin', '2018 WC Ball', 150),
  ('wc_ball_2022', 'ballSkin', '2022 WC Ball', 150),
  ('wc_ball_2026', 'ballSkin', '2026 WC Ball', 150);
