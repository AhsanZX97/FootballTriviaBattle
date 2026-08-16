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

## 4. Verify

```
npm run typecheck
npm test
```

Both must pass. If either fails, stop and report — do not publish.

## 5. Build and upload

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

## 6. Hand back to the user

Do NOT tag, commit, or push — leave that to the user. Report:

- the new versionCode / versionName
- the release notes you wrote, called out as **going to real users**
- that a draft is waiting on the **production** track, with the reminder that
  **rollout, the Data safety form, and any policy declarations are console-only**
- the exact commands for the next steps, so they can copy them:
  - commit the bump: `git add -A && git commit -m "release: v<versionName> (versionCode <n>)"`
  - tag the release: `git tag v<versionName> && git push --tags`
  - staged rollout to 10% instead of full: `npm run release:promote -- --from-track production --promote-track production --release-status inProgress --user-fraction 0.1`
