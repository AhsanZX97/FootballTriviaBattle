# Phaser + Capacitor Port Plan

Goal: ship Football Trivia Battle as a **portrait** Android app (iOS later)
using Capacitor, with the shootout animation rendered by Phaser **on native
only**. The deployed web app keeps its current look and behaviour.

## Architecture decisions (read first)

### One codebase, platform-gated — the web app does not change behaviour

No fork, no second repo. The native app is the same React app inside a
Capacitor WebView, with differences gated behind one runtime check:

```ts
// services/platform.ts
import { Capacitor } from '@capacitor/core'
export const isNative = Capacitor.isNativePlatform()
```

At boot, `main.tsx` stamps `document.documentElement.classList.add('native')`
when `isNative`. Every mobile-only style lives under `.native` selectors;
every mobile-only behaviour branches on `isNative`. On web both are inert, so
the deployed site renders and behaves exactly as today.

Precise contract for "web stays as is":
- **Zero user-visible change on web.** CSS pitch scene, double-click mute,
  current layout — all stay.
- **Invisible internal changes are allowed on web** (they're required to
  share the codebase): the Press Start 2P font becomes self-hosted instead
  of Google-CDN (renders identically, loads more reliably), and the three
  `localStorage` call sites go through a thin `services/storage.ts` wrapper
  (still localStorage on web). If even these are unwanted, say so — but
  gating them buys nothing and costs duplication.
- `@capacitor/core` is a small runtime dep that no-ops on web; the Phaser
  bundle is **lazy-loaded only when `isNative`**, so the web bundle doesn't
  grow by Phaser's ~1.3 MB.

### Phaser is scoped to `PitchScene`, native only

The game is 90% UI — React keeps menus, lobby, trivia card, scoreboard on
both platforms. `PitchScene({ stage, feedback, opponentLabel })` is the one
game-y component, and it mounts fresh per animation with a clean props
contract. On native, a Phaser canvas implementation renders it using the
sprite strips already in `src/assets` (`ball-spin-strip.png`,
`gk-dive-strip.png`, `gk-idle-strip.png`, `striker_kick_64.png`); on web the
existing CSS/emoji version keeps rendering. Selection is a lazy
`React.lazy`/dynamic-import branch on `isNative` inside a small
`PitchSceneSwitch` wrapper — `MatchScreen` keeps importing one component.

(Plans/Sprite Transfer Plan.md is subsumed by this for native; if the web
scene should *later* get sprites too, the Phaser scene doesn't block that.)

### Portrait

The app locks to **portrait** on native (web is untouched and stays
free-form). Consequences to plan for:

- The match screen was composed landscape-ish (scoreboard row, wide scene,
  question card). Portrait on a ~390×844 viewport means a vertical stack:
  scoreboard top, scene middle, timer + question card bottom. This is a
  `.native`-scoped CSS pass over `MatchScreen.css` / `PitchScene.css` —
  web layout files gain `.native` blocks but no changed base rules.
- `bg.jpg` is a wide goal shot; portrait shows a center crop. The CSS scene
  already uses cover-sizing so % positions still land on the goal, but this
  must be eyeballed on a phone. The Phaser scene is composed portrait-first
  (camera framed on the goal, actors positioned for a tall canvas), so on
  native the Phaser version is the fix for any cramped CSS crop.
- Intro/lobby screens are simple stacks and should mostly survive portrait;
  audit, don't assume.

### Phase order

The app must work as a *portrait web page* (Chrome device mode) before
Capacitor touches it — every fix done with desktop devtools is one not
debugged on a phone. Phaser (Phase 4) is independent of Capacitor (Phase 3)
and can land before, after, or in parallel.

---

## Phase 1 — Mobile-ready under the `.native` gate

Verification for this phase (per CLAUDE.md's Playwright-MCP rule — no
routine browser-driving): Claude runs `typecheck`/`test` and boots the dev
server; the **user** eyeballs layouts in desktop Chrome device-mode
(portrait iPhone/Pixel preset, `native` class added manually via devtools)
or a phone browser on the LAN (`vite --host`). Claude tells the user exactly
what to load and what to look at.

1. **`services/platform.ts` + `native` class stamp** in `main.tsx`.
2. **Self-host the Press Start 2P font** (shared, invisible change):
   woff2 into `src/assets/fonts/`, `@font-face` in `index.css`, remove the
   Google Fonts `<link>`s from `index.html`.
3. **Viewport + safe areas** (inert on desktop): `viewport-fit=cover`;
   `.native`-scoped `env(safe-area-inset-*)` padding for SoundControl and
   the scoreboard; kill pinch-zoom/double-tap-zoom via `touch-action`
   under `.native` (leave the meta viewport's user-scalable alone so web
   accessibility is unchanged).
4. **Portrait layout pass** for match/intro/lobby under `.native`
   (vertical stack per Architecture § Portrait). Verify vs the CSS scene's
   center-crop of `bg.jpg`.
5. **Touch controls, native only:** SoundControl double-click mute is
   unreliable on touch — when `isNative`, render an explicit mute button
   beside the slider instead of the double-click path (web keeps
   double-click). Confirm 44px+ touch targets on answer buttons; wrap any
   hover-only affordances in `@media (hover: hover)` (safe on web —
   desktop still hovers).
6. **Audio unlock on first gesture** (guarded by `isNative`): WebViews
   block autoplay, so `playTheme()` from `App.tsx`'s mount effect fails
   silently until a tap. One-time `pointerdown` listener retries the theme.
7. **Storage seam** (shared, invisible): wrap the `localStorage` touchpoints
   (`sound.ts` volume, `recentIds.ts`, lobby name) in `services/storage.ts`
   with a sync get/set API backed by localStorage. Phase 2 swaps the
   *native* backend to Capacitor Preferences; web backend stays localStorage
   forever. Route existing tests through it.
8. **WS URL + TLS:** native release talks to
   `wss://<render-app>.onrender.com` via `VITE_WS_URL` in `.env.production`.
   Web deploy already has its own env; unchanged.

**Server change (Render dashboard, user):** Capacitor app origins are
`https://localhost` (Android) and `capacitor://localhost` (iOS). Add both to
`ALLOWED_ORIGINS` on Render, comma-separated, alongside the existing web
origin. No code change — `server/index.ts` reads the env var.

## Phase 2 — Capacitor shell (Android)

1. `npm i -D @capacitor/cli` and `npm i @capacitor/core @capacitor/android`
2. `npx cap init "Football Trivia Battle" com.<yourname>.footballtrivia --web-dir dist`
3. **Lock portrait natively:** `android:screenOrientation="portrait"` on the
   activity in `AndroidManifest.xml` (hard lock, no plugin needed; iOS later
   via Xcode target settings). Skip `@capacitor/screen-orientation` unless a
   screen ever needs to rotate.
4. `npm run build && npx cap add android` — creates `android/` (commit it).
5. Plugins:
   - `@capacitor/app` — Android **back button**: intro → exit app, elsewhere
     mirror the existing back/lobby buttons; **appStateChange**: pause
     theme + crowd audio on background, resume theme on foreground.
   - `@capacitor/preferences` — native backend for `services/storage.ts`.
     It's async and volume/recentIds are read at module init, so add a small
     async hydrate step in `main.tsx` before first render (web path skips it).
   - `@capacitor/splash-screen` + `@capacitor/status-bar` — splash config,
     hide/overlay status bar.
   - `@capacitor-community/keep-awake` — screen must not sleep while the
     opponent takes their kick.
6. Icons + splash: `npx @capacitor/assets generate` from a 1024px `logo.png`
   export.
7. npm scripts: `"android": "npm run build && npx cap sync android && npx cap run android"`.

## Phase 3 — Testing on Android

**One-time user setup:**
- Install **Android Studio** (SDK + emulator). Accept licenses, install a
  platform (API 35) + build-tools. `npx cap doctor` verifies.
- Physical phone: enable Developer Options (tap Build Number 7×), turn on
  **USB debugging**, plug in, accept the RSA prompt.

**Dev loop (live reload on device):**
1. `npm run dev -- --host` + `npm run dev:server`.
2. Temporarily in `capacitor.config.ts`:
   `server: { url: 'http://<LAN-IP>:5173', cleartext: true }` →
   `npx cap run android`. Phone loads straight from Vite with HMR.
3. Dev-only: device origin is `http://<LAN-IP>:5173`, so run the WS server
   with `ALLOWED_ORIGINS=http://localhost:5173,http://<LAN-IP>:5173` and set
   `VITE_WS_URL=ws://<LAN-IP>:8787` in `.env.development.local`.
4. **Debugging:** desktop Chrome → `chrome://inspect` → full devtools
   (console, WS frames, elements) against the app on the device.
5. Remove `server.url` before any release build.

**Web-regression check (each phase) — token-cheap, no browser automation:**
- Claude: `npm run typecheck` + `npm test` green; `npm run build` and inspect
  `dist/` output — no Phaser chunk referenced by the entry bundle, no
  Capacitor-only code in the main chunk (static check, no browser).
- User: open the web build in their own browser once per phase — CSS scene
  still renders, double-click mute still works, layout unchanged.
- Playwright MCP stays holstered unless something breaks in a way only an
  in-page look can diagnose (see CLAUDE.md).

This is the "web stays as is" guarantee, verified, not assumed.

**Verification split (per CLAUDE.md):**
- Claude: typecheck/test/build green; app boots on emulator; portrait lock
  holds on rotation; intro renders; no console errors; WS handshake OK.
- User plays: full solo match on the phone; 1v1 phone ↔ desktop tab;
  rematch; backgrounding mid-match; back button on every screen; volume +
  mute button; theme resumes after background; screen stays awake during
  opponent's kick; airplane mode mid-match → CONNECTION LOST → lobby.

## Phase 4 — Phaser PitchScene (native only; independent of Phases 2–3)

1. `npm i phaser`. Loaded via dynamic import behind `isNative` — verify the
   web bundle has no Phaser chunk.
2. `features/match/components/phaser/ShootoutScene.ts` — a `Phaser.Scene`:
   preload strips as spritesheets; timelines for `goal | miss | save |
   concede` plus keeper variants (`wrong-way | frozen | late`); **portrait
   composition** (camera on the goal, tall canvas). Reuse the timing
   constants MatchScreen's sound cues depend on (`KICK_SOUND_MS = 1000`,
   land 1500–1700 ms, `FEEDBACK_MS = 2600`) so audio stays in sync with no
   MatchScreen changes.
3. `PhaserPitchScene.tsx` with the same props contract (`stage`, `feedback`,
   `opponentLabel`): mount `new Phaser.Game({ parent, scale: FIT })`,
   destroy on unmount. One Game per animation is fine at this cadence; hoist
   to a singleton only if low-end phones show creation jank.
4. `PitchSceneSwitch.tsx`: `isNative` → lazy Phaser scene, else the existing
   CSS `PitchScene`. Swap the one import in `MatchScreen.tsx`. The CSS scene
   is **kept**, not deleted — it's the web renderer.
5. Tests: extract the variant/feedback → timeline-name selection as a pure
   function and unit-test that; canvas output is verified by the user on
   device.

## Phase 5 — Release (Android), then iOS

**Android:**
- Upload keystore (`keytool`), signing config in `android/app/build.gradle`
  (keystore stays out of git).
- `cd android && ./gradlew bundleRelease` → `.aab`.
- **User:** Play Console account ($25 one-time), internal testing track
  first, Data Safety form (declares the WebSocket; no ads/analytics),
  privacy policy URL (a simple hosted page suffices).
- Server: Render free tier cold-starts will hit real users; budget the
  ~$7/mo tier before public launch.

**iOS (separate, later):**
- Hard requirements: **Mac + Xcode**, Apple Developer Program ($99/yr).
- `npm i @capacitor/ios && npx cap add ios`; portrait lock in the Xcode
  target; origin `capacitor://localhost` (already allowed from Phase 1).
- Retest audio + storage on WKWebView — the Preferences migration exists
  for exactly this.

---

## Steps only the user can do (summary)

| When | What |
|---|---|
| Phase 1 | Add Capacitor origins to `ALLOWED_ORIGINS` on Render |
| Phase 2 | Pick the app ID (`com.<name>.footballtrivia` — permanent once published) |
| Phase 3 | Install Android Studio; enable USB debugging on the phone |
| Phase 3 | Playtest: solo, 1v1, rematch, backgrounding, back button, audio |
| Phase 5 | Play Console account ($25), privacy policy page, store listing |
| Phase 5 | Consider paid Render tier before public launch |
| iOS | Mac + Xcode + Apple Developer ($99/yr) |

## Suggested order of work

1 (portrait + mobile fixes under the gate) → 2 (Capacitor shell) → 3
(on-device testing) gets a playable Android build fastest; 4 (Phaser scene)
is the polish pass; 5 (release). After every phase, run the web-regression
check so "web stays as is" holds continuously.
