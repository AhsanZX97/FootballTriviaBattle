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
`android/app/src/main/play/release-notes/en-US/<track>.txt`. For the default
internal release that is
[internal.txt](android/app/src/main/play/release-notes/en-US/internal.txt);
promoting to production later uses `production.txt`, so update that one too if
the user is going straight to production.

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
**internal** track as a **DRAFT**. It does not reach any user until the rollout
button is pressed in the console.

If it fails on credentials, check that `android/play.properties` exists (see
[android/play.properties.example](android/play.properties.example)) and that its
service account has release permissions — the purchase-verifier account does not.

## 6. Hand back to the user

Do NOT tag, commit, or push — leave that to the user. Report:

- the new versionCode / versionName
- the release notes you wrote
- that a draft is waiting on the internal track, with the reminder that
  **rollout, the Data safety form, and any policy declarations are console-only**
- the exact commands for the next steps, so they can copy them:
  - promote to production: `npm run release:promote -- --from-track internal --promote-track production`
  - tag the release: `git tag v<versionName> && git push --tags`
