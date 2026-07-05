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

## Multiplayer dev

- `npm run dev` (Vite, port 5173) + `npm run dev:server` (WS server, port 8787).
- The server's origin check only allows `http://localhost:5173`. If Vite grabs
  5174 because a stale Vite is still on 5173, the socket handshake fails with
  "HTTP Authentication failed" — kill the stray process, don't change the port.
