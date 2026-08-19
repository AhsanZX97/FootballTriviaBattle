# Football Trivia Battle — working notes for Claude

## Playing the game is the user's job

When verifying a change needs the **game actually played** — clicking answers,
taking penalties, driving a match through to a result, exercising the
multiplayer flow between two clients — **stop and hand that to the user.**
Do the non-gameplay work yourself: write code, run `npm run typecheck` and
`npm test`, boot the dev servers, load a screen to confirm it renders, check
console errors, inspect state. But don't sit there clicking through kicks or
answering trivia to reach an end state — set it up, say what you want checked,
and let the user play it.

**This applies to every surface, including the Android emulator / device.** Do
NOT drive gameplay with `adb shell input tap` (or any automated input). The
game is built on timing — the question countdown, the 20s kick timeout, the
~2.6s feedback animation — and Claude's tool round-trips add seconds of latency
between every action, so anything Claude "plays" fires timers mid-step and is
worthless as a check. It also just wastes the user's time. A single static
`adb exec-out screencap` of a screen that is **already** on the display (e.g.
the intro after launch) is fine; tapping through the app to reach a screen is
not — ask the user to navigate there, or verify the layout in code / a test.

Why: driving matches (web or native) is slow, flaky under tool-driven timing
(timers fire between round-trips), and the user can do it in seconds. Automated
tests already cover the rules and store logic.

**Practical split**
- Claude: types, logic, store, tests, CSS, wiring, `typecheck`/`test`, booting
  `npm run dev` + `npm run dev:server`, building/installing the Android app,
  confirming a screen already on screen mounts / no console errors, one-shot
  state pokes.
- User: playing a match, quick-match pairing between two tabs, rematch, result
  screens, tapping through any flow on the phone/emulator, anything that needs
  a human to answer questions in real time.

## Playwright MCP: only when critical

Browser-driving via the Playwright MCP tools is expensive in tokens
(snapshots and screenshots are large). Do **not** reach for it as routine
verification. Default verification order:

1. `npm run typecheck` + `npm test` (covers rules, stores, parsers).
2. Static checks on build output when relevant (e.g. inspect `dist/` for an
   unexpected chunk) — no browser needed.
3. Hand visual/gameplay confirmation to the user (see section above) with a
   one-line "boot X, look at Y" instruction.

Use Playwright MCP only when a browser is genuinely the only way to answer
the question **and** the user can't easily check it themselves — e.g.
diagnosing a runtime error that only reproduces in-page, or reading console
output the user can't retrieve. When used, keep it surgical: one navigate,
the minimal snapshot/console read, done — not click-through flows.

## Releasing to Play

Releases go out over the Play Developer API via Gradle Play Publisher, not by
hand in the console. The whole flow is the `/release` slash command
(`.claude/commands/release.md`); underneath it is one npm script:

```
npm run release:play      # cap:sync:release -> bundleRelease -> upload
```

Defaults live in the `play { }` block in `android/app/build.gradle`:
**production track, DRAFT status**. A successful run puts a production draft in
the console; nothing reaches users until rollout is pressed there. Override
per-run rather than editing the block — flags pass straight through:

```
npm run release:play -- --track internal
npm run release:play -- --release-status inProgress --user-fraction 0.1
```

Publishing to production needs the *Release to production* permission on the
service account; internal-only needs *Release apps to testing tracks*. A `403`
naming the track means that grant is missing.

Credentials come from a gitignored `android/play.properties` (template:
`play.properties.example`), same pattern as `keystore.properties`. It needs a
service account with **release** permissions — the `play-purchase-verifier`
account only has *View financial data* and cannot publish.

Two things the API cannot do, ever — these stay manual in the console:
the **Data safety form** / content rating / policy declarations, and the
**final rollout** button (by our own DRAFT default).

`versionCode` in `android/app/build.gradle` must increase every upload; Play
rejects a reused one. Release notes are repo files, **one per track**:
`android/app/src/main/play/release-notes/en-US/{internal,alpha,production}.txt`
(`default.txt` is the fallback if a track file is missing), **max 500 chars**.

The store listing itself — title, descriptions, screenshots, feature graphic —
is now checked in under `android/app/src/main/play/listings/`, pulled down by
`bootstrapReleaseListing`. Note `publishReleaseBundle` does **not** push these;
only `publishReleaseListing` does, so editing them is inert until you run that.

Known breakage: `bootstrapListing` and `publishProducts` fail with `403 "Please
migrate to the new publishing API"`. Google retired the v3 `inappproducts`
endpoint (now "One-time products") and GPP 3.12.1 never migrated. It does not
affect `publishReleaseBundle`. Manage in-app products in the console.

## Play Games sign-in (zero-tap accounts)

Android players get an account without a signup form: Play Games Services v2
signs them in automatically at launch, and that identity becomes a Supabase
user. **Username is the identity** — PGS never returns an email, so the auth
user carries a synthetic `pgs-<playerId>@players.invalid` address that exists
only because GoTrue demands one. Renaming lives on the 1v1 screen.

The chain, and why each hop exists:

```
PlayGamesPlugin.java   auto sign-in -> requestServerSideAccess -> auth code
  -> services/native/playGames.ts    (null for every failure; never prompts)
  -> services/supabase.ts            signInWithPlayGames(authCode)
  -> functions/pgs-signin            redeems the code with the client SECRET,
                                     reads games/v1/players/me, creates or
                                     finds the user, mints a session
  -> supabase.auth.setSession        -> onAuthStateChange -> signedIn
```

The code is redeemed server-side because redeeming needs the OAuth client
secret, which can never ship in an APK. The device proves nothing on its own.

**It is inert until configured.** `android/app/src/main/res/values/play_games.xml`
holds two placeholders reading `UNSET`; while either is unset the plugin never
calls `PlayGamesSdk.initialize` (initialising with a bogus project id crashes
on launch) and every player just gets the normal sign-in screen. Setup, once:

1. Play Console > Play Games Services > Setup and management > **Configuration**
   — create the PGS project, link the app, add OAuth clients for the **upload
   key SHA-1 and the Play App Signing SHA-1**. Both, or release builds fail.
2. Put the numeric Project ID and the **web** OAuth client id (not the Android
   one) into `play_games.xml`.
3. `supabase secrets set GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=...`
   (the web client's), then `supabase functions deploy pgs-signin`.
4. Run `supabase/migrations/0013_play_games_accounts.sql`.
5. **Publish the PGS configuration.** Until it is published only accounts on
   the PGS testers list can sign in at all — that list is the whole gate, and
   publishing is one-way (there is no unpublish). It is a separate button from
   the app release, so the config can go live while the app is still internal.

**A Play Games account is not offered a sign-out at all.** It has no password
and an unroutable `@players.invalid` email, so signing out would strand the
player on a sign-in screen that cannot let them back in — the account is only
reachable through Play Games' own automatic sign-in. `AuthState.isPlayGamesAccount`
(derived from `profiles.pgs_player_id`) drives that, and IntroScreen renders
neither Sign Out nor Sign In for those players.

Sign-out still has to mean signed out for everyone else: the store attempts the
silent path **once per launch**, from boot hydration only (`playGamesAttempted`).
Without that flag the SIGNED_OUT event would immediately re-sign-in the player
who just left. The flag is in-memory, so a cold start does re-attempt — which is
exactly why the sign-out button is hidden rather than merely discouraged.

Junk accounts are accepted deliberately — but `profiles.username` is unique, so
a silent account permanently claims a name. Generated names are
`Player_1234`-shaped for exactly that reason.

## Multiplayer dev

- `npm run dev` (Vite, port 5173) + `npm run dev:server` (WS server, port 8787).
- The server's origin check only allows `http://localhost:5173`. If Vite grabs
  5174 because a stale Vite is still on 5173, the socket handshake fails with
  "HTTP Authentication failed" — kill the stray process, don't change the port.
- **There are two bots, at two layers.** Server fill: a lonely queue is paired
  with a bot after 8s (`BOT_QUEUE_TIMEOUT_MS`, `src/services/multiplayer/bot.ts`).
  Client fallback: if the server never answers at all — down, offline, or a
  handshake that hangs — the lobby gives up at 12s and plays a bot *on the
  device* (`src/services/multiplayer/localSocket.ts`), which fakes the whole
  `ServerMessage` side of a match so `matchStore`/`MatchScreen` never know.
  So a tab sitting on "searching" *always* gets matched, with or without a
  server. `BOT_FILL_ENABLED=false` only disables the first one — to test real
  pairing, keep the server up and pair two tabs inside 12s.
- The local fallback never emits `coinsAwarded`, so an offline win pays nothing
  and writes no match history. Daily-challenge counters do advance (they are
  client-side and already client-trusted).
- Room rules and bot behaviour are shared with the client: they live in
  `src/game/room.ts` and `src/services/multiplayer/bot.ts`, and `server/room.ts`
  / `server/bot.ts` are re-export shims.
- `dev:server` loads `.env.development.local` (gitignored). 1v1 coin awards
  only work locally if that file sets `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`; the server's boot log says ENABLED or DISABLED
  either way, and `/healthz` reports `coinAwards`.


## Additional Notes
- Treat a question as a question — answer it, then stop. Treat an imperative ("add," "fix," "build") as the go-ahead to work: make reasonable assumptions, no preamble/summaries, only ask if genuinely blocked. Don't explain things I didn't ask about.