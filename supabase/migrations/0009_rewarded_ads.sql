-- Rewarded-ad coin grants. Run once via the Supabase SQL editor (or
-- `supabase db push`). Builds on 0001_accounts.
--
-- Money rules, same shape as 0001/0004/0008:
--   * The payout amount lives here, never on the client — a tampered client
--     can't pick its own reward.
--   * Coins only ever change through a security-definer RPC; clients still have
--     no insert/update policy on profiles.
--   * The rate-limit state lives server-side, so rolling the device clock
--     forward can't farm rewards.
--
-- TRUST BOUNDARY, deliberate: this RPC is client-callable, so a tampered client
-- could call it without actually watching an ad. That is the same exposure
-- award_cpu_win (0001) already accepts, and the cap below bounds the abuse to
-- REWARD * DAILY_CAP coins per account per day. The proper fix is AdMob
-- Server-Side Verification (AdMob POSTs a signed callback to an edge function,
-- verified against Google's public keys); that is a follow-up, not this
-- migration. Keep the cap tight until then.

-- Rate-limit state, mirroring the cpu_award_* columns in 0001.
alter table profiles
  add column rewarded_ads_today integer not null default 0,
  add column rewarded_ads_date date,
  add column last_rewarded_ad_at timestamptz;

-- Grant the coins for one watched rewarded ad: +25 coins, >=60s cooldown,
-- capped at 5/day. Returns the new balance, or null when rate-limited — the
-- same contract as award_cpu_win, so the client handles both identically.
--
-- The cooldown and cap live in the UPDATE's WHERE clause rather than a prior
-- SELECT: that makes check-and-credit a single atomic statement, so two calls
-- racing on one account can't both pass the cap and double-pay.
create function claim_rewarded_ad() returns integer
language plpgsql security definer set search_path = public as $$
declare new_balance integer;
begin
  update profiles set
    rewarded_ads_today = case when rewarded_ads_date = current_date
                              then rewarded_ads_today + 1 else 1 end,
    rewarded_ads_date  = current_date,
    last_rewarded_ad_at = now(),
    coins = coins + 25
  where id = auth.uid()
    and (last_rewarded_ad_at is null
         or now() - last_rewarded_ad_at >= interval '60 seconds')
    and (rewarded_ads_date is distinct from current_date
         or rewarded_ads_today < 5)
  returning coins into new_balance;
  return new_balance;
end $$;

-- How many rewarded ads the caller has left today, so the UI can say "3 left"
-- and disable the button at 0 instead of only finding out after an ad plays.
-- Advisory only — claim_rewarded_ad above is what actually enforces the cap.
create function rewarded_ads_remaining() returns integer
language sql security definer set search_path = public as $$
  select case when p.rewarded_ads_date is distinct from current_date
              then 5 else greatest(0, 5 - p.rewarded_ads_today) end
    from profiles p where p.id = auth.uid();
$$;
