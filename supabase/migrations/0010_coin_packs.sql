-- Real-money coin packs (Google Play Billing). Run once via the Supabase SQL
-- editor (or `supabase db push`). Builds on 0001_accounts.
--
-- Money rules, same shape as 0004's shop_items:
--   * How many coins a pack grants lives HERE, never on the client. A tampered
--     client can pick which product it claims to have bought, but not what that
--     product pays.
--   * Clients cannot write iap_purchases or profiles directly. The only path is
--     the verify-coin-purchase edge function, which runs with the service-role
--     key and credits through 0001's increment_coins (already revoked from
--     anon/authenticated).
--
-- What is deliberately NOT here: the money price. Google Play owns localized
-- pricing, so the UI shows the store's own `priceString` for each product. A
-- price column here would silently drift from what the player is actually
-- charged in their currency.

create table coin_packs (
  -- Must match the in-app product id in the Play Console exactly.
  product_id text primary key,
  coins integer not null check (coins > 0),
  name text not null,
  -- Display order in the shop; lowest first.
  sort_order integer not null default 0,
  -- Lets a pack be pulled from sale without deleting the rows in
  -- iap_purchases that reference it.
  active boolean not null default true
);

alter table coin_packs enable row level security;

-- The catalogue is public, same as shop_items: the popup renders it for
-- signed-out players too.
create policy "coin packs are readable" on coin_packs for select using (true);

insert into coin_packs (product_id, coins, name, sort_order) values
  ('coins_500',   500,  'HANDFUL OF COINS', 1),
  ('coins_1200',  1200, 'SACK OF COINS',    2),
  ('coins_3000',  3000, 'CHEST OF COINS',   3);

-- Every Play purchase this backend has redeemed.
--
-- purchase_token as the PRIMARY KEY is the whole idempotency story: the client
-- can replay a token as many times as it likes (and legitimately will — a crash
-- between "credited" and "consumed" leaves a purchase the app must retry), and
-- every attempt after the first hits the conflict and grants nothing.
create table iap_purchases (
  purchase_token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  product_id text not null references coin_packs(product_id),
  -- Snapshotted, not joined: what this purchase actually paid out stays
  -- correct even if the pack's coin amount is retuned later.
  coins integer not null,
  created_at timestamptz not null default now()
);

alter table iap_purchases enable row level security;

-- Readable only for your own rows. No insert policy: redemptions go through the
-- edge function, which uses the service-role key and bypasses RLS.
create policy "own purchases readable" on iap_purchases for select
  using (auth.uid() = user_id);

-- Lets the edge function find a user's redemption history without scanning.
create index iap_purchases_user_idx on iap_purchases (user_id, created_at desc);

-- Server-only: claim a verified Play purchase for a user. Called by the
-- verify-coin-purchase edge function AFTER it has checked the token with
-- Google's Play Developer API — this function trusts its caller completely,
-- which is why it is revoked from anon/authenticated below.
--
-- Returns json carrying both the outcome and the resulting balance, the same
-- two-field shape purchase_item (0004) returns:
--   {"status": "ok",             "coins": <new balance>}
--   {"status": "already_redeemed","coins": <unchanged>}
--   {"status": "unknown_product","coins": <unchanged>}
--   {"status": "no_profile",     "coins": 0}
--
-- The insert and the credit are one function body (one transaction), so a
-- token can never be recorded as redeemed without the coins landing, nor the
-- coins granted twice for one token.
create function redeem_coin_pack(
  p_user_id uuid,
  p_product_id text,
  p_purchase_token text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_coins integer;
  v_balance integer;
begin
  select coins into v_balance from profiles where id = p_user_id;
  if v_balance is null then
    return json_build_object('status', 'no_profile', 'coins', 0);
  end if;

  select coins into v_coins from coin_packs
   where product_id = p_product_id and active;
  if v_coins is null then
    return json_build_object('status', 'unknown_product', 'coins', v_balance);
  end if;

  insert into iap_purchases (purchase_token, user_id, product_id, coins)
  values (p_purchase_token, p_user_id, p_product_id, v_coins)
  on conflict (purchase_token) do nothing;

  if not found then
    -- Already redeemed. Report the balance so a retrying client still ends up
    -- showing the right number rather than treating this as an error.
    return json_build_object('status', 'already_redeemed', 'coins', v_balance);
  end if;

  update profiles set coins = coins + v_coins
   where id = p_user_id
   returning coins into v_balance;

  return json_build_object('status', 'ok', 'coins', v_balance);
end $$;

-- Revoking from PUBLIC is the part that matters: Postgres grants EXECUTE on new
-- functions to PUBLIC by default and anon/authenticated inherit that, so
-- revoking from just those two would be a no-op. Same reasoning as 0001's
-- increment_coins.
revoke execute on function redeem_coin_pack from public, anon, authenticated;
