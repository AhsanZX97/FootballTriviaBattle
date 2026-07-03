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

Why: driving full matches through the UI is slow, flaky under tool-driven
timing (the kick timeout fires between round-trips), and the user can do it in
seconds. Automated tests already cover the rules and store logic.

**Practical split**
- Claude: types, logic, store, tests, CSS, wiring, `typecheck`/`test`, booting
  `npm run dev` + `npm run dev:server`, confirming a screen mounts / no console
  errors, one-shot state pokes.
- User: playing a match, quick-match pairing between two tabs, rematch, result
  screens, anything that needs a human to answer questions in real time.

## Multiplayer dev

- `npm run dev` (Vite, port 5173) + `npm run dev:server` (WS server, port 8787).
- The server's origin check only allows `http://localhost:5173`. If Vite grabs
  5174 because a stale Vite is still on 5173, the socket handshake fails with
  "HTTP Authentication failed" — kill the stray process, don't change the port.
