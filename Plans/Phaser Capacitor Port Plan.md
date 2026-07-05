# Capacitor Android / iOS Port Plan

Goal: ship Football Trivia Battle as a **portrait** Android app (iOS later)
using Capacitor. The deployed web app keeps its current look and behaviour.

> The shootout scene keeps its existing CSS/sprite renderer as-is on native.
> Both the Phaser rewrite and a `.native` CSS portrait reframe were tried and
> dropped — not pursuing either.

## Status (2026-07-05)

- **Phase 1 — mobile-ready under `.native`: DONE.** platform gate, self-hosted
  font, safe-area/viewport, touch controls + native mute, storage seam.
- **Phase 2 — Capacitor Android shell: DONE.** `android/` scaffolded, 5 plugins
  wired (app/preferences/splash/status-bar/keep-awake), portrait locked in the
  manifest, Preferences hydration + audio-pause-on-background.
- **Phase 3 — device testing: mostly DONE.** Debug APK builds; app boots and
  the intro renders in portrait on the Pixel_7_Pro emulator; no console errors.
  **Open:** playtest on a physical phone (not yet detected by adb) and the full
  gameplay checklist — the user's job.
- **Next: Phase 5 — release** (with the small polish items below).

Key facts established during the port:
- App ID: `com.degreatahsan.footballtriviabattle` (permanent once published).
- JDK 26 is incompatible with the Android Gradle Plugin; `org.gradle.java.home`
  is pinned to Android Studio's bundled JDK 21 in `android/gradle.properties`.
- Live reload: `capacitor.config.ts` reads `CAP_SERVER_URL`; LAN IP is
  `192.168.1.124`; `.env.development.local` sets `VITE_WS_URL` (gitignored).
- `services/platform.ts` `isNative` + a `native` class on `<html>` gate every
  mobile-only style/behaviour; web is inert.
- WS server (Render): `football-trivia-ws` → `wss://football-trivia-ws.onrender.com`
  (confirm the real URL). Client baked with `VITE_WS_URL` at build time.

---

## Architecture (unchanged, still the spine)

**One codebase, platform-gated.** The native app is the same React app in a
Capacitor WebView. `isNative` (from `@capacitor/core`) + a `native` class on
`<html>` gate every mobile difference. On web both are inert, so the deployed
site renders and behaves exactly as today.

Contract for "web stays as is":
- **Zero user-visible change on web** — CSS pitch scene, double-click mute,
  layout all stay.
- **Invisible internal changes only** where sharing the codebase requires it:
  self-hosted font (renders identically), the `localStorage` calls routed
  through `services/storage.ts` (still localStorage on web).
- Native-only plugin code is lazy/dynamic-imported so it never lands in the
  web entry bundle (verified: web entry unchanged in size).

**Portrait.** Locked to portrait on native (web untouched). The `.native` CSS
pass stacks the match screen vertically; the shootout scene uses its existing
cover-sized renderer.

---

## Phases 1–3 — DONE (record)

Full task lists lived in git history; the shipped result:

- **`services/platform.ts`** + `native` class stamp in `main.tsx`.
- **Font** self-hosted (`src/assets/fonts/press-start-2p-latin.woff2`,
  `@font-face` in `index.css`, CDN `<link>`s removed).
- **Viewport/safe-area** (`viewport-fit=cover`, `.native` `env(safe-area-*)`).
- **Touch**: `@media (hover: hover)` on all hovers; native-only MUTE button.
- **Storage seam** `services/storage.ts` (+ test); native mirrors to Capacitor
  Preferences and hydrates it at boot (`services/native/preferences.ts`).
- **Native bootstrap** `services/native/index.ts`: hide status bar/splash,
  pause audio on `appStateChange`. Back button + keep-awake wired in `App.tsx`.
- **Capacitor**: `capacitor.config.ts`, `android/` project, portrait lock in
  `AndroidManifest.xml`, npm scripts (`cap:sync`, `android`, `android:open`).

**Phase 3 still open (user):** connect a physical phone (enable USB debugging,
`--target <id>`); then playtest — solo, 1v1 phone↔desktop, rematch,
backgrounding, back button, audio, keep-awake, airplane-mode → CONNECTION LOST.
Also confirm audio isn't muted on first launch (a screenshot once showed the
volume at 0 — possibly a stray tap, worth a glance).

---

## Before Phase 5 — prerequisites (mostly user)

A release build that actually works needs these first:

1. **Production WS URL.** The release build bakes in `VITE_WS_URL` at build
   time. It must point at the deployed Render socket
   (`wss://football-trivia-ws.onrender.com` — confirm the real URL). Without
   it the app falls back to `ws://localhost:8787` and 1v1 breaks. Solo mode is
   unaffected. → set in `.env.production` before `npm run build`.
2. **Server origin allowlist.** The shipped Android app's page origin is
   `https://localhost`. Add it (and later `capacitor://localhost` for iOS) to
   `ALLOWED_ORIGINS` on Render, alongside the Vercel web origin, or the 1v1
   handshake is rejected in production. No code change.
3. **Is the Render server even deployed?** Confirm it's live (or 1v1 won't work
   for anyone). Free tier cold-starts hit real users — budget ~$7/mo before a
   public launch.
4. **Playtest first (recommended).** Confirm the app works on a device before
   shipping (Phase 3). Not strictly required to produce a build.

Small polish (can ship internal-testing without, wanted before public):
- **App icons + splash:** `npx @capacitor/assets generate` from a **square**
  1024px source (logo.png is wide — needs a square export first).
- **Volume-at-launch:** confirm master volume defaults to full on a fresh
  native install; fix if hydrate/`reloadMasterVolume` ordering zeroes it.

## Phase 5 — Release (Android), then iOS

**Android:**
- Generate an upload keystore (`keytool`); configure signing in
  `android/app/build.gradle` (keystore + passwords stay out of git — **losing
  them means never being able to update the app**).
- `cd android && ./gradlew bundleRelease` → `.aab` (uses the pinned JDK 21).
- **User:** Google Play Console account ($25 one-time); create the app; upload
  to the **internal testing** track first; Data Safety form (declares the
  WebSocket connection; no ads/analytics); privacy-policy URL (a simple hosted
  page suffices).

**iOS (later):** needs **Mac + Xcode** + Apple Developer ($99/yr).
`npm i @capacitor/ios && npx cap add ios`; portrait lock in the Xcode target;
origin `capacitor://localhost`. Retest audio + storage on WKWebView (the
Preferences migration exists for this).

---

## Steps only the user can do

| When | What |
|---|---|
| before release | Confirm the Render WS URL; add `https://localhost` to `ALLOWED_ORIGINS` |
| Phase 3 | Connect the phone (USB debugging), run the gameplay playtest |
| polish | Provide/approve a square app-icon source |
| Phase 5 | Play Console account ($25), privacy policy page, store listing |
| Phase 5 | Consider paid Render tier before public launch |
| iOS | Mac + Xcode + Apple Developer ($99/yr) |

## Suggested order

Confirm WS URL + origins → set `.env.production` → (playtest) → keystore +
`bundleRelease` → internal-testing upload → polish (icons/splash/volume) →
public. iOS is a separate later effort.
