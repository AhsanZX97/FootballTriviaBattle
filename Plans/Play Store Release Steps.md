# Play Store Release Steps

Signed release bundle is built and verified:

```
android/app/build/outputs/bundle/release/app-release.aab
```

- Package: `com.degreatahsan.footballtriviabattle`
- Version: `versionCode 1`, `versionName "1.0"`
- Signed with the upload key at `C:/Users/ahsan/keys/upload-keystore.jks`
  (passwords in the gitignored `android/keystore.properties`)

Everything below is done on your side, in the Play Console.

## 1. Play Console account

[play.google.com/console](https://play.google.com/console) → pay the **$25
one-time** registration fee (if you don't already have an account).

## 2. Create the app

*Create app* → name (e.g. "Football Trivia Battle") → default language → type
**Game** → **Free**. Accept the declarations.

## 3. Upload to Internal testing

Fastest track — no review wait.

1. Left menu → **Test and release → Testing → Internal testing** →
   *Create new release*.
2. **Play App Signing is now automatic** — no "accept" prompt anymore. On
   the release page the **App integrity** section already shows ✅ *Automatic
   protection is on* and ✅ *Releases signed by Google Play*; that second
   check **is** Play App Signing, enabled by default for all new apps.
   Google holds the real app-signing key; your `upload-keystore.jks` stays
   your *upload* key only (Google can help recover a lost upload key under
   this model — but back the file up regardless). Nothing to click here.
3. Drop `app-release.aab` into the **App bundles** upload box (leave the
   "Play Games Sidekick" checkbox unticked — it's an in-game overlay we're
   not using), fill **Release name** + **Release notes**, then **Next →
   Save and publish** (older wording: *Review → Roll out to internal
   testing*).
4. *Testers* tab → add an email list (or your Google account) → copy the
   **opt-in link** → open it on your phone → become a tester → install
   from Play.

## 4. Complete the "App content" declarations

Under **Policy and programs → App content** (formerly just "App content")
Play gives you a checklist. Internal testing tolerates some of these
incomplete; **production requires all of them**:

- **Privacy policy URL** — required. A simple hosted page works (GitHub
  Pages, Notion page, etc.).
- **Data safety form** — declare the WebSocket connection; no ads, no
  analytics, no data sold.
- **Content rating** questionnaire.
- **Target audience and content**.
- **Ads** — No.
- **Advertising ID** — declare you don't use it (we don't).
- **Government apps**, **Financial features**, **Health**, **Data
  collection for kids** — all No / not applicable.

## 4a. ⚠ New: closed-testing requirement before production

**This is a recent Google policy that the earlier version of this plan
predates.** Personal / individual developer accounts created after **Nov
2023** must run a **closed test with at least 12 testers, opted-in for 14
continuous days**, before Play will unlock **production** access. Internal
testing does **not** count toward this.

Practical path: after internal testing works, promote to a **Closed testing**
track, recruit ≥12 testers, keep them opted in for 14 days, then apply for
production. If you only ever want internal testing (up to 100 testers, no
review wait), you can ignore this — but you cannot go public without it.

## App icon — DONE

Generated from `src/assets/app logo.png` (1254×1254, square) via
`npx @capacitor/assets generate --android`, background color `#04140b` to
match the app theme.

Known tradeoff (accepted): the source has its own baked-in rounded corners
and near-edge-to-edge text. On the legacy/round launcher icon it renders
clean. On a modern **adaptive icon** (Android 8+, most real launchers), the
mandatory safe-zone inset + the OS's own mask shape (e.g. a circle) will show
the artwork as a slightly smaller "sticker" with its own corners visible
inside the mask, rather than bleeding fully to the edge — confirmed by
compositing it locally before shipping. Cosmetic only; revisit later with a
transparent, logo-only foreground layer if a cleaner adaptive icon is wanted.

## Splash screen — investigated, custom art NOT shown (accepted)

`src/assets/splash art.png` was generated into `@drawable/splash` (see git
history for the asset pipeline), but installed and tested on a real device
(Android 16 / API 36) it does **not** appear — the OS shows its plain
icon+background-color splash instead.

**Root cause, confirmed by reading the plugin source:** on Android 12+,
Capacitor's splash-screen plugin hands rendering to the platform's own
`androidx.core.splashscreen.SplashScreen.installSplashScreen()` API, which
**only supports an icon + a solid background color — it cannot show a full
custom image.** `@drawable/splash` is the pre-Android-12 mechanism; the
plugin tries the Android 12+ API first and only falls back to the old
drawable if that throws, which it doesn't. So on any Android 12+ device (the
large majority of real devices today) the custom splash art is unreachable
through this mechanism, full stop — not a config bug.

**The only way to actually show custom splash art** is an in-app splash
screen (a React component rendering the art + loading bar before the intro
screen, shown for a moment during native boot) — this bypasses the OS API
entirely since it's just app content. **Declined** — current call is to ship
with the plain OS icon+color splash. Revisit this section if that changes.

`src/assets/splash art.png` remains in the repo unused by the shipped build.
`src/assets/app logo.png` is still the source for the app icon (see above).

## Store listing assets (before public, not urgent for internal testing)

- **512×512 app icon** and **1024×500 feature graphic** for the Play listing
  itself (separate from the in-app launcher icon/splash above) — can reuse
  the source art above.
- At least **2 phone screenshots**.
- Short + full description.

## For future updates

Every new upload needs a **higher `versionCode`**. Bump `versionCode` (and
usually `versionName`) in `android/app/build.gradle` before each
`bundleRelease` — currently `1` / `"1.0"`.

## Still open / not done

- [ ] Google Play Console account
- [ ] Privacy policy page hosted somewhere
- [ ] Store listing screenshots + description + feature graphic
- [ ] Upload `.aab` to internal testing, add self as tester, install + confirm
- [ ] (optional) transparent-foreground adaptive icon for a cleaner modern look
- [ ] (optional) in-app splash screen component, if custom splash art is wanted after all
