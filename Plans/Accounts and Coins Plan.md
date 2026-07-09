# Accounts & Coins Plan

## Context

Add user accounts (username + email + password, no Google) so players can
accumulate coins, and later get leaderboards, friends, and presence. Backend:
**Supabase** (auth + Postgres, free tier). The existing Render WS server stays
and becomes the trusted authority for 1v1 coin awards. Playing stays possible
without an account — login is only needed to *earn*.

**Product spec (from user):**
- Main menu gains two options: **Sign In** and **Shop** (Shop greyed out for now).
- Sign In → login page (username + password) with a **Sign Up** button.
- Sign Up page: username, email, password → Sign Up.
- Coin icon next to the volume control; shows **0 when logged out**.
- Logged in: **1 v CPU win = 1 coin**; **1v1 win = 3 coins, 1v1 loss = 1 coin**.
- Logged in: name input on the 1v1 lobby screen is gone (username used instead);
  menu's Sign In becomes **Sign Out**.

## Decisions taken (defaults — flag if you disagree)

1. **Login field accepts username OR email.** Supabase authenticates by email;
   username login is resolved via a small Supabase **Edge Function**
   (`login-with-username`) that maps username→email server-side and performs the
   password grant. This avoids a public RPC that would leak email addresses
   (username→email enumeration).
2. **Forfeit pays the quitter nothing.** 1v1 loss coin (1) is only for a match
   played to completion. Winner by forfeit still gets 3. Otherwise "queue,
   insta-quit, collect 1 coin" is free farming.
3. **Email confirmation OFF** in Supabase for v1 (a confirm-link flow needs
   deep links in the Capacitor app; without them users would sign up and be
   locked out). Password reset ships as a follow-up using Supabase's **OTP code
   flow** (`resetPasswordForEmail` → user types the 8-digit code in-app —
   confirmed against a real sent email, not the commonly-assumed 6 —
   `verifyOtp`), which needs no deep links.
4. **Coins are server-authoritative for 1v1** (WS server writes with the
   service-role key). **vs-CPU is inherently client-claimed** (the server never
   sees CPU matches) — mitigated by a rate-limited Postgres RPC (cooldown +
   daily cap), not by trust.
5. Coin counter renders **always** (shows `0 🪙` logged out) per spec, next to
   the global SoundControl overlay.

## Architecture

```
Client (React/Capacitor)
 ├─ supabase-js  ──────────────► Supabase Auth (signup / signin / session)
 │                               Edge Fn: login-with-username
 │                               RPC: award_cpu_win()  (rate-limited)
 └─ WebSocket (?token=JWT) ───► Render WS server
                                  ├─ verifies JWT (jose + Supabase JWKS)
                                  └─ on 1v1 match end: service-role client
                                     └─ RPC increment_coins(user_id, amount)
                                     └─ sends `coinsAwarded` to each client
```

## Supabase setup (manual, one-time)

- Create project. Note `SUPABASE_URL`, anon key, service-role key.
- Auth settings: email provider on, **confirm email OFF**, min password length 8.
- SQL migration (keep the SQL in `supabase/migrations/0001_accounts.sql` in-repo):

```sql
create extension if not exists citext;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique
    check (char_length(username) between 3 and 16
           and username ~ '^[A-Za-z0-9_]+$'),
  coins integer not null default 0 check (coins >= 0),
  last_cpu_award_at timestamptz,
  cpu_awards_today integer not null default 0,
  cpu_awards_date date,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "profiles are readable" on profiles for select using (true);
-- NO insert/update policy for clients: writes go through trigger + definer RPCs only.

-- create profile on signup from raw_user_meta_data.username
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- pre-signup availability check (no email exposure)
create function is_username_available(p_username citext) returns boolean
language sql security definer set search_path = public as $$
  select not exists (select 1 from profiles where username = p_username)
$$;

-- client-called, rate-limited CPU award: 1 coin, >=90s cooldown, 50/day cap
create function award_cpu_win() returns integer
language plpgsql security definer set search_path = public as $$
declare new_balance integer;
begin
  update profiles set
    cpu_awards_today = case when cpu_awards_date = current_date
                            then cpu_awards_today + 1 else 1 end,
    cpu_awards_date  = current_date,
    last_cpu_award_at = now(),
    coins = coins + 1
  where id = auth.uid()
    and (last_cpu_award_at is null or now() - last_cpu_award_at >= interval '90 seconds')
    and (cpu_awards_date is distinct from current_date or cpu_awards_today < 50)
  returning coins into new_balance;
  return new_balance; -- null = rate-limited / no row; client shows nothing extra
end $$;

-- server-only (service role bypasses RLS, but keep it as one atomic entry point)
create function increment_coins(p_user_id uuid, p_amount integer) returns integer
language plpgsql security definer set search_path = public as $$
declare new_balance integer;
begin
  update profiles set coins = coins + p_amount
  where id = p_user_id returning coins into new_balance;
  return new_balance;
end $$;
revoke execute on function increment_coins from anon, authenticated;
```

- Edge Function `login-with-username`: body `{ username, password }` → look up
  email via service role → GoTrue password grant → return session or a generic
  "invalid credentials" (never reveal whether the username exists).

## Wire protocol changes — [src/types/multiplayer.ts](src/types/multiplayer.ts)

- Connection URL gains optional `?token=<supabase access token>` (browsers
  can't set WS headers).
- New `ServerMessage`:
  - `{ type: 'coinsAwarded'; amount: number; balance: number }` — sent to each
    authed player when a 1v1 match reaches a terminal state (win 3 / completed
    loss 1 / forfeit-win 3, quitter 0).
- `queue` keeps `name` for anonymous players; **for authed connections the
  server ignores the client-sent name** and uses the profile username.

## Server changes — [server/index.ts](server/index.ts), [server/matchmaking.ts](server/matchmaking.ts), [server/room.ts](server/room.ts)

1. **New pure module `server/auth.ts`**: `verifySupabaseJwt(token, jwks) →
   { userId } | null` using `jose` + `createRemoteJWKSet(SUPABASE_URL/auth/v1/.well-known/jwks.json)`.
   Injectable verifier for tests.
2. **Handshake** (`verifyClient`, index.ts:199-201): keep origin check; parse
   `?token=`. Valid token → attach `userId` (+ fetch username from `profiles`
   once) to the `Connection` (index.ts:204-207). Missing token → anonymous
   connection (still allowed). **Invalid/expired token → also proceed as
   anonymous** (client may hold a stale token; don't hard-reject) — client
   refreshes and reconnects if it wants coins.
3. **New pure module `server/awards.ts`**: `settleMatch(room, {aUserId, bUserId},
   reason: 'completed' | 'forfeitBy(a|b)') → [{userId, amount}]` implementing
   3/1/0 rules from `room.shootout.status` (status is relative to slot `a`).
   Fully unit-testable like `room.ts`.
4. **Emit points** — the only two places a match ends:
   - `resolveKick` (index.ts:74-79): after `applyKick`, if `isMatchOver` →
     settle, write via `increment_coins`, send `coinsAwarded` to each authed
     player.
   - `handleLeave`/forfeit (index.ts:83-94): same, with the forfeit rule.
   - **Guard: per-room `settled` flag** so a match settles exactly once; reset
     it in `handleRematchVote` when `rematchStart` fires (rematch = new match,
     awards again).
5. **Matchmaking** (`matchmaking.ts`): `QueuedPlayer` gains optional `userId`;
   `enqueue` must **not pair two players with the same `userId`**
   (self-match coin farming from two devices). Second same-user entry waits.
6. **Service-role Supabase client** on the server (plain `fetch` to PostgREST
   RPC or `@supabase/supabase-js`); env `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` added in [render.yaml](render.yaml) (`sync: false`)
   and Render dashboard. If the DB write fails, log and still send the match
   through — never break gameplay over a coin write; retry once.

## Client changes

### Services
- `src/services/supabase.ts`: create client with `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY`; **custom storage adapter** backed by
  [src/services/storage.ts](src/services/storage.ts) `getItem/setItem/removeItem`
  so the session mirrors to Capacitor Preferences and survives app restarts on
  Android (same seam as `ftb-volume`).
- `src/services/multiplayer/socket.ts`: `connect()` appends `?token=` when a
  session exists (get fresh token via `supabase.auth.getSession()` before
  connecting — auto-refresh handles expiry).

### Stores (custom factory + `useSyncExternalStore`, mirroring [src/features/lobby/store.ts](src/features/lobby/store.ts))
- `src/features/auth/store.ts` — `createAuthStore(deps)`:
  `{ status: 'signedOut'|'loading'|'signedIn', userId, username, email, coins,
  error }`. Actions: `signIn(usernameOrEmail, password)` (email → direct
  `signInWithPassword`; else Edge Function), `signUp(username, email, password)`
  (check `is_username_available` first → `signUp` with `options.data.username`),
  `signOut()`, `refreshProfile()` (fetch username+coins), `setCoins(balance)`.
  Subscribes to `onAuthStateChange`; hydrates on boot. Cache last-known coins in
  `storage.ts` (`ftb.coins`) so the counter isn't 0-flashing offline.
- [src/features/match/store.ts](src/features/match/store.ts):
  - CPU: in `submitAnswer` (store.ts:95-102), on the `playing → won` edge and
    only when signed in → call `award_cpu_win()` RPC; on non-null balance →
    `authStore.setCoins(balance)`. Fire-and-forget; failures/rate-limits are
    silent (never block the result screen).
  - 1v1: handle new `coinsAwarded` message in `handleSocketMessage`
    (store.ts:108-149) → `authStore.setCoins(balance)`.
- [src/features/lobby/store.ts](src/features/lobby/store.ts): `quickMatch()`
  uses `authStore` username when signed in (skip name validation).

### UI
- **`src/features/auth/AuthScreen.tsx` + css** — one screen, two modes
  (`signin` | `signup`), styled on the intro scaffolding (bg/overlay/
  `intro__play` buttons). Sign-in: username-or-email + password + Sign In +
  "Sign Up" link. Sign-up: username (maxLength 16, `[A-Za-z0-9_]`), email,
  password (min 8) + Sign Up. Inline error line for: bad credentials, username
  taken, invalid email, weak password, network failure. Disable submit while
  pending.
- **[src/App.tsx](src/App.tsx)**: extend `Screen` union (App.tsx:12) with
  `'auth'`; render branch (App.tsx:144-178); Android back button
  (App.tsx:119-122): auth → intro.
- **`CoinCounter`** component rendered next to `<SoundControl>` (App.tsx:182),
  fixed top-right beside it in [src/index.css](src/index.css) (respect the
  native safe-area offset at index.css:150-153, and keep it from overlapping
  the slider when the sound popover is open — place coin counter left of the
  sound toggle).
- **[src/features/menu/IntroScreen.tsx](src/features/menu/IntroScreen.tsx)**:
  after the two play buttons add **Sign In** (→ auth screen) which becomes
  **Sign Out** when signed in (with a tiny "signed in as X" line), and **Shop**
  rendered `disabled` + greyed variant class.
- **[src/features/lobby/LobbyScreen.tsx](src/features/lobby/LobbyScreen.tsx)**:
  hide the name input + reroll block (LobbyScreen.tsx:42-59) when signed in;
  show the username as static text instead.

### Env
Add to **all three** env files — `.env.production`, `.env.release` (release
mode does NOT inherit production), `.env.development.local`:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key is public-safe).

## Bugs & edge cases accounted for

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Double coin award on rematch | per-room `settled` flag, reset on `rematchStart` |
| 2 | Quit-farming the 1-coin loss reward | forfeit pays quitter 0; only completed losses pay 1 |
| 3 | Self-match farming (same account, 2 devices/tabs) | matchmaking never pairs identical `userId` |
| 4 | CPU-win spam (client-claimed) | RPC cooldown 90s + 50/day cap, enforced in Postgres |
| 5 | Client forging coin writes | RLS: no client write policy on `profiles`; awards only via definer RPCs / service role |
| 6 | Token expired at WS connect | fetch fresh session token pre-connect; invalid token degrades to anonymous, never blocks play |
| 7 | Token expiring mid-match | identity captured at handshake; awards keyed to stored `userId` |
| 8 | Username→email enumeration | login lookup inside Edge Function; generic "invalid credentials" error |
| 9 | Duplicate usernames incl. case (`Ahsan`/`ahsan`) | `citext` unique + charset/length check constraint; pre-check RPC for friendly error |
| 10 | Signup trigger fails on race (username taken between check and insert) | unique constraint is the backstop; surface "username taken" on signup error |
| 11 | Session lost on Android restart | supabase-js custom storage adapter over `storage.ts` → Preferences mirror |
| 12 | Coin write fails (Supabase down) at match end | log + continue match flow; gameplay never blocks on coins |
| 13 | Coins counter stale/offline | cache `ftb.coins`; refresh on auth change, app resume, and every `coinsAwarded`/RPC balance |
| 14 | Anonymous players broken by auth | all auth is optional on the socket; anonymous 1v1 unchanged (earns nothing) |
| 15 | Authed client sends spoofed `queue.name` | server overrides with profile username for authed connections |
| 16 | User locked out with no reset | follow-up milestone: OTP-code password reset (no deep links needed) |
| 17 | Render cold start (free plan) delays handshake | unchanged behaviour; token adds no extra round trip (JWKS cached) |
| 18 | Negative/overflowing balance | `check (coins >= 0)`, integer column |
| 19 | Sign-out mid-match | match continues; CPU award RPC just no-ops without session; counter resets to 0 |
| 20 | Coin counter overlapping sound slider on small screens | CSS: counter sits left of `.sound`, tested at 320px width |

## Milestones (bottom-up, TDD)

**M0 — Supabase provisioning (user + Claude together)**
Create project, run migration SQL, deploy Edge Function, set env keys
(3 env files + Render dashboard), auth settings. ✅ verify: signup via curl.

**M1 — Types** (`src/types/`)
`multiplayer.ts`: `coinsAwarded` message; `auth.ts`: `Profile`, auth state types.
✅ typecheck.

**M2 — Client services**
`services/supabase.ts` (client + storage adapter), `socket.ts` token param.
Tests: storage adapter read/write via `storage.ts`; socket URL includes token
when session exists. ✅ vitest.

**M3 — Server**
`server/auth.ts` (JWT verify, injectable), `server/awards.ts` (settle rules),
matchmaking same-user guard, `index.ts` wiring (handshake identity, settle +
`coinsAwarded` emit, settled-flag reset on rematch), service-role RPC caller.
Tests: awards matrix (win/loss/forfeit/rematch-reset), matchmaking guard, JWT
verify with fake keys. ✅ vitest.

**M4 — Auth store** (`src/features/auth/store.ts`)
Full state machine with injected supabase deps. Tests: signup happy path,
username taken, bad login, signout clears coins, hydration. ✅ vitest.

**M5 — Match store coin hooks**
CPU-win RPC call on won-edge (signed-in only), `coinsAwarded` handling.
Tests extend `match/__tests__/store.test.ts` with fake award fn. ✅ vitest.

**M6 — UI**
`AuthScreen` + css, `CoinCounter`, IntroScreen buttons (Sign In/Out, Shop
greyed), LobbyScreen name gating, App.tsx screen wiring + back button.
✅ typecheck + render tests; visual check by user.

**M7 — Verification (end-to-end, user plays)**
- `npm run typecheck` && `npm test` clean.
- Boot `npm run dev` + `npm run dev:server` (server env pointing at Supabase).
- User: sign up → coin counter 0 → win a CPU match → counter 1 → two tabs
  1v1 (one signed in, one anonymous) → winner +3 / anonymous unchanged →
  completed-loss +1 → rematch pays again → quit mid-match pays quitter 0 →
  sign out → counter 0, Sign In button back, name input back in lobby.

## Follow-ups (explicitly out of scope now)
- Shop (button exists, greyed).
- Password reset via OTP code; email confirmation + deep links.
- Friends, presence, direct challenges (WS server gains `userId` map — designed for, not built).
- Leaderboard (`order by coins desc` on `profiles`).
