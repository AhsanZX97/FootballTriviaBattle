# Phaser gameplay migration

Scope: English mobile match gameplay. Keep the existing question controls,
scoreboard, menus, art, equipped cosmetics, and server-authoritative scoring.
Use TypeScript with Phaser (compiled to JavaScript) to match this repository.

## Acceptance criteria

- Phaser renders the pitch, animated keeper, ball flight and outcome text.
- One engine timeline controls launch, impact, sounds and completion, including
  a single completion after a delayed frame. No CSS actor animations remain.
- Own keeper is used while defending; opponent keeper is used while shooting.
  Unknown cosmetics fall back to stock art.
- A persistent canvas survives question/feedback transitions, fits mobile
  landscape and portrait screens, and releases resources on unmount.
- Existing trivia, scoring, rematch, audio preferences and accessible UI work.

## Atomic tasks

1. **Complete:** Test and implement shot timeline and sprite selection.
   Verify all outcomes, event order, late frames, cosmetic fallback and layout.
   Verification: 17 targeted tests pass after confirmed behavioral failures.
2. **Complete:** Test and implement Phaser renderer and React lifecycle bridge.
   Verify state updates, loading/unmount races, cleanup and rendering.
   Verification: renderer loop and React lifecycle tests pass, including lazy-load
   races, StrictMode cleanup, retry, ordered events and single completion.
3. **Complete:** Integrate match feedback with engine events and persistent pitch.
   Verify answer/timeout/spectator flows, full tests, typecheck, lint, build,
   and prepare the Android build for user testing.

## Verification

- `npm run test -- src/features/match`: 70 tests passed.
- `npm run test`: 655 tests across 52 files passed.
- `npm run typecheck`: passed.
- `npm run lint`: no errors; eight existing warnings in unrelated files.
- `npm run build`: passed. Phaser is a separate lazy-loaded chunk (about 322 kB
  gzip). Vite reports the large chunk warning and the existing Supabase mixed
  static/dynamic import warning.
- `npx cap sync android`: passed.
- `./android/gradlew.bat -p android assembleDebug`: passed with Android Studio's
  bundled JDK and the installed Android SDK.
- Debug APK installed successfully with `adb install -r` on device CPH2709.
  On-device visual/gameplay verification was handed to the user at their request;
  it has not been claimed as tested. No app data was cleared.

## Architecture and manual checks

- `engine/createPitchGame.ts` owns the Phaser scene, texture loading, sprite
  frames, ball/keeper movement, outcome text, dimming, and shot clock.
- `engine/shotTimeline.ts` defines launch, impact and completion events.
- `PitchScene` owns only the accessible canvas host and engine lifecycle.
- `MatchScreen` keeps the existing accessible trivia UI and question countdown;
  sounds and kick submission now follow engine events. Shared scoring and
  multiplayer protocols remain unchanged.
- The existing bundled sprite art is reused with nearest-neighbor rendering.
  Portrait zoom is capped to keep the goalposts and shot paths visible.
- Mobile checks: play correct and incorrect answers, allow a timeout, watch
  opponent kicks, check equipped cosmetics, finish a match and start a rematch.
  Confirm audio, scores, and scene cleanup, including leaving/reopening the app.

No new gameplay rules or commits are part of this change.

## Follow-up: closer mobile camera

User feedback replaces the previous goalpost-preserving zoom cap: the pitch
must fill the screen without top/bottom bands, with the ball closer in the
foreground. Preserve art proportions and the existing UI; crop the sides as
needed instead of stretching the artwork.

1. **Complete:** Replace capped framing with centered cover framing. First
   verify failing tests for full viewport coverage and foreground ball placement,
   then implement, run the suite/static checks, and update the installed APK.
   Manual device gameplay checks remain with the user.

Follow-up verification: the new coverage/foreground tests first failed for the
old letterboxed framing, then all 11 pitch-art tests passed. `npm run test`
passed 657 tests; `npm run typecheck`, `npm run lint` (existing warnings only),
`npm run build`, `npx cap sync android`, and Android `assembleDebug` succeeded.
The updated APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.
Installation could not finish because the previously connected phone was no
longer available to ADB. The zoom update is not yet installed on that phone.
