---
description: Cut an Android release — bump version, verify, build, upload a draft to Play
argument-hint: "[patch|minor|major] (default: patch)"
allowed-tools: Read, Edit, Bash(npm run typecheck), Bash(npm test), Bash(npm run release:play), Bash(git log:*), Bash(git status), Bash(git tag:*), Bash(git diff:*)
---

Cut a new Android release for Football Trivia Battle. Bump type: $1 (default `patch`).

Work through these in order and STOP at the first failure — do not continue a
release past a failing check.

## 1. Confirm the tree is clean

Run `git status`. If there are uncommitted changes to `src/`, `server/`, or
`android/`, stop and tell the user — releases ship committed code only.

## 2. Bump the version

Read [android/app/build.gradle](android/app/build.gradle). Bump:

- `versionCode` — always +1, no exceptions. Play rejects a reused code.
- `versionName` — apply the `$1` bump (default patch) to the semver string.

## 3. Write the release notes

Read `git log <last tag>..HEAD --oneline` and rewrite the user-facing changes
into the release-notes file **for the track being published** —
`android/app/src/main/play/release-notes/en-US/<track>.txt`. The default track
is production, so that is
[production.txt](android/app/src/main/play/release-notes/en-US/production.txt).
These notes go to real users — write them for a player, not a developer.

Rules: **max 500 characters** (Play hard-rejects longer), plain user language,
no commit hashes, no internal refactors. Short bullets with `-`. If every commit
since the last tag is internal, write a single "Bug fixes and performance
improvements." line.

## 4. Check the privacy policy

Google rejects releases whose privacy policy doesn't match the listing or the
app's actual data practices. The policy lives in Notion:
<https://app.notion.com/p/privacy-policy-3aa737e1e106803b9f22c4bcd7822fbf>
(page id `3aa737e1e106803b9f22c4bcd7822fbf`). Fetch it with the Notion MCP.

**Identifiers must match exactly** — compare the policy against:

- app title: [title.txt](android/app/src/main/play/listings/en-US/title.txt)
- contact email: [contact-email.txt](android/app/src/main/play/contact-email.txt)
- website: [contact-website.txt](android/app/src/main/play/contact-website.txt)
- package name: `applicationId` in [android/app/build.gradle](android/app/build.gradle)
- developer name: **DeGreat Studios** (Play Console account name)

**Data practices must still be accurate** — run
`git diff <last tag>..HEAD --stat` and look for changes that alter what the app
collects or who it shares with:

- new or removed SDK dependencies in `package.json` (ads, analytics, billing,
  auth, crash reporting)
- new tables/columns holding user data in `supabase/migrations/`
- new or changed edge functions in `supabase/functions/`
- new Android permissions in `android/app/src/main/AndroidManifest.xml`
- new sign-in methods, purchase types, ad formats, or analytics events
  (`src/services/analytics.ts`, `src/services/ads.ts`, `src/features/auth/`)

If nothing relevant changed and every identifier matches, say so in one line
and continue. Otherwise **stop**: show the user the mismatches / new data
practices and the proposed policy wording, and only edit the Notion page
(also bumping its "Last updated" date) once they approve. Remind them that a
data-practice change usually also needs the **Data safety form** updated in
the console.

## 5. Verify

```
npm run typecheck
npm test
```

Both must pass. If either fails, stop and report — do not publish.

## 6. Build and upload

```
npm run release:play
```

This runs `cap:sync:release` then `publishReleaseBundle`, which uploads to the
**production** track as a **DRAFT**. It does not reach any user until the
rollout button is pressed in the console.

If it 403s on the track, the service account is missing the *Release to
production* permission — it must be granted in Play Console under Users and
permissions. To fall back to internal for a run: `npm run release:play -- --track internal`.

If it fails on credentials, check that `android/play.properties` exists (see
[android/play.properties.example](android/play.properties.example)) and that its
service account has release permissions — the purchase-verifier account does not.

## 7. Hand back to the user

Do NOT tag, commit, or push — leave that to the user. Report:

- the new versionCode / versionName
- the privacy policy check result (unchanged, or what was updated)
- the release notes you wrote, called out as **going to real users**
- that a draft is waiting on the **production** track, with the reminder that
  **rollout, the Data safety form, and any policy declarations are console-only**
- the exact commands for the next steps, so they can copy them:
  - commit the bump: `git add -A && git commit -m "release: v<versionName> (versionCode <n>)"`
  - tag the release: `git tag v<versionName> && git push --tags`
  - staged rollout to 10% instead of full: `npm run release:promote -- --from-track production --promote-track production --release-status inProgress --user-fraction 0.1`
