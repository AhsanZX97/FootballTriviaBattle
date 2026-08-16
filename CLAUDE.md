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

## Multiplayer dev

- `npm run dev` (Vite, port 5173) + `npm run dev:server` (WS server, port 8787).
- The server's origin check only allows `http://localhost:5173`. If Vite grabs
  5174 because a stale Vite is still on 5173, the socket handshake fails with
  "HTTP Authentication failed" — kill the stray process, don't change the port.
- Quick match falls back to a **bot** after 8s alone in the queue (`server/bot.ts`).
  So a single tab that sits on "searching" *will* get matched — that's the fill,
  not a real opponent. Set `BOT_FILL_ENABLED=false` when testing real pairing.
- `dev:server` loads `.env.development.local` (gitignored). 1v1 coin awards
  only work locally if that file sets `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`; the server's boot log says ENABLED or DISABLED
  either way, and `/healthz` reports `coinAwards`. Vs-CPU coin awards are a
  separate path (client → `award_cpu_win` RPC, straight to Supabase) and work
  regardless of the WS server's config.
