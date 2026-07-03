# Football Trivia Battle — 1v1 Online Multiplayer Plan

> **Nature of this doc:** Living plan, same spirit as `Initial Plan.md`. Goal:
> a playable online 1v1 penalty-shootout trivia match via Quick Match.
> Friendly (invite) matches, accounts, and ranking are explicitly later.

---

## 1. What this phase ships

1. **1 v 1 button** on the intro screen, next to 1 v CPU.
2. **Lobby screen** (new) — same background/vibe as the intro:
   - Name text box, pre-filled with a randomised name.
   - **Quick Match** button — pairs you with anyone in the queue.
   - **Friendly Match** button — visible but **disabled** (future phase).
   - Empty name → both buttons refuse to work + a visible warning.
3. **Matchmaking flow** — "FINDING MATCH…" → "MATCH FOUND" → "STARTING…" →
   "YOU GO FIRST" / "<NAME> GOES FIRST" → 3-2-1 countdown → match.
4. **1v1 match** — alternating turns (P1 kicks, P2 kicks, …), real shootout
   rules (best of 5, sudden death), reusing the existing rule engine, pitch
   scene, and animations. Ends on WIN/LOSE like the CPU match.

---

## 2. The big architecture requirement: a server

Today the app is a static Vite site with **zero backend**. Online quick match
is impossible without one — two browsers can't find each other on their own.

### Recommended: one small Node WebSocket server

- **`server/`** folder in this repo: Node + TypeScript + the `ws` package.
  That's the entire dependency footprint. No database — everything
  (queue, rooms, match state) lives in memory. A dropped server just means
  in-flight matches die, which is acceptable for this phase.
- **Server is authoritative** for pairing and turn order; it relays kick
  outcomes between the two clients. Each client runs the same pure
  `game/shootout.ts` engine on the events it receives, so the rules code is
  reused untouched and never duplicated on the server.
- **Questions:** the server fetches one OpenTDB batch per room (server-side
  fetch also dodges the per-IP rate limit) and sends the identical question
  list to both players. Both clients see the same questions in the same order.
- Dev experience: `npm run dev` starts Vite as today; `npm run dev:server`
  starts the WS server on `ws://localhost:PORT`. Client reads the WS URL from
  a Vite env var (`VITE_WS_URL`) so prod is a one-line config.

### Hosting model (client on Vercel)

Vercel serves static files + short-lived serverless functions only — it
**cannot** run a persistent WebSocket process, so hosting splits in two:

- **Client → Vercel.** The built Vite bundle deploys as-is.
- **WS server → Railway / Fly / Render.** One always-on Node process with a
  `wss://…` URL. (Render free tier sleeps when idle → ~30s cold start for
  the first match; Railway/Fly hobby tiers don't.)
- **Wiring:** set `VITE_WS_URL=wss://<server-host>` in the Vercel project's
  env vars (baked into the bundle at build time). Browsers load the site
  from Vercel, then open a socket directly to the game server.
- **Origin check:** the server accepts connections only from the Vercel
  domain(s) + localhost, so other sites can't use it.

### Alternatives considered (and why not)

| Option | Verdict |
|--------|---------|
| Firebase / Supabase Realtime | No server code to host, but you trade it for an SDK dependency, an account, security-rules config, and awkward turn-based semantics on top of a DB. More total complexity than 150 lines of `ws`. |
| WebRTC peer-to-peer | Still needs a signaling server, plus NAT pain. Strictly worse. |
| Colyseus / PartyKit | Real frameworks solving problems we don't have yet (rooms at scale, state sync DSLs). Revisit if this grows past one game mode. |

---

## 3. Match design (1v1)

### Turn structure

Straight alternation, as specced: **P1 shoots → P2 shoots → P1 → …**

- On your turn you get a trivia question with the 10s timer.
  Correct → goal. Wrong / timeout → miss.
- On the opponent's turn you **spectate**: the pitch scene stays on screen in
  an **idle state** — ball on the spot, goalie waiting — with a
  "waiting for <NAME>…" banner and a cosmetic mirrored timer, then plays the
  goal/miss animation when their result arrives. You never see their
  question or answers. **(Decided.)**
- **No keeper questions in 1v1 — shooter-only answers. (Decided.)** The CPU
  mode's "you're in goal" stage exists because there's no second human; here
  the other human *is* the opposition.

### Rules & engine reuse

`game/shootout.ts` already models exactly this: alternating kicks, best of 5,
sudden death, `applyAnswer(state, correct)`. Mapping for 1v1:

- My kick = existing `'shoot'` stage; my correct answer scores for me.
- Opponent's kick = existing `'keep'` stage; the server tells me whether they
  scored, and I feed `applyAnswer(state, /* correct = */ !theyScored)`.

So the rule engine needs **zero changes** — only the UI labels change
("YOU" vs their name instead of "CPU", "YOUR KICK" / "<NAME>'S KICK" instead
of shoot/keep). Server decides who is "P1" (goes first) with a coin flip.

### Timing & the clock

- The **shooter's client** owns the 10s countdown for their own kick and
  reports the outcome (correct/wrong/timeout) to the server, which relays it.
- The spectator shows an approximate mirrored countdown, cosmetic only.
- **Server safety timeout** per kick (~10s + animation + grace ≈ 20s): if no
  answer arrives (tab closed, network drop), the server rules it a miss and
  moves on. This is the anti-stall mechanism, not a cheat shield.
- Cheating (devtools, clock games) is out of scope — no stakes, no ranking.

### Disconnects

- Socket drops mid-match → other player gets a "<NAME> DISCONNECTED — YOU WIN"
  result screen. No reconnection/resume this phase.
- Disconnect while queued → just removed from the queue.

---

## 4. Screens

### 4.1 Intro screen (edit)

- Add a **1 V 1** button below/beside **1 V CPU**, same `PixelButton`/intro
  button styling. Navigates to the lobby. Nothing else changes.

### 4.2 Lobby screen (new — `features/lobby/`)

Same full-bleed blurred bg, overlay, vignette, scanlines as the intro
(reuse the same assets/CSS classes; extract shared bits only if it turns
out to be copy-paste of more than the background stack).

Layout, top to bottom:

- Small logo (or a "1 V 1" pixel title).
- **Name text box** — pixel-styled input.
  - Pre-filled with a randomised name, e.g. `TURBO KEEPER 42`
    (adjective + football noun + 2 digits from small local word lists).
  - A 🎲 re-roll affordance is a nice-to-have, not required.
  - Persisted to `localStorage` so returning players keep their name.
  - Max length ~16 chars, trimmed.
- **QUICK MATCH** button.
- **FRIENDLY MATCH** button — rendered disabled (greyed, not clickable,
  "COMING SOON" hint).
- **BACK** to intro.

**Validation:** if the name is empty/whitespace, Quick Match does nothing
except show a warning ("ENTER A NAME FIRST!") — shake/flash on the input in
the same retro style. Friendly stays disabled regardless.

**Matchmaking states** live on this screen (no extra route):

| State | UI |
|-------|-----|
| `idle` | form as above |
| `searching` | "FINDING MATCH…" + animated dots/spinner + CANCEL button |
| `found` | "MATCH FOUND — STARTING…" (short beat; opponent name appears) |
| `starting` | "YOU GO FIRST ⚽" or "<NAME> GOES FIRST 🧤", then **3… 2… 1…** countdown |
| → | hand off to the match screen |

Cancel while `searching` tells the server to dequeue and returns to `idle`.

### 4.3 Match screen (1v1 variant)

Same layout as the CPU match, with:

- Scoreboard: `YOU  n – n  <OPPONENT NAME>`, same kick dots.
- Turn banner: "⚽ YOUR KICK" / "⏳ <NAME>'S KICK…".
- Your turn: timer + question card exactly as today.
- Their turn: the `PitchScene` shown in a new **idle mode** (ball on the
  spot, keeper doing his idle animation) with "waiting for <NAME>…" and a
  cosmetic timer, transitioning into the existing goal/miss animation when
  their result arrives. No question card is rendered at all on their turn.
- Result: "🏆 YOU WIN" / "💀 YOU LOSE" + score + two buttons:
  - **REMATCH (0/2)** — see below.
  - **LOBBY** — leave the room, back to the lobby (name kept).
- Opponent-disconnected result state (§3).

### 4.4 Rematch flow

The room stays alive after the final kick, until both players leave.

- The result screen shows **REMATCH (0/2)**. Clicking it casts your vote:
  button becomes **REMATCH (1/2)** (and stops being clickable for you);
  the opponent's result screen updates to (1/2) live too.
- When **both** have voted (2/2), the server resets the room: **new coin
  flip** for who goes first, fresh question batch, then the full pre-match
  sequence replays *on the match screen*: "YOU GO FIRST ⚽" /
  "<NAME> GOES FIRST 🧤" → **3… 2… 1…** → kick off. Score/dots reset.
- Opponent leaves or disconnects at the result screen → rematch becomes
  unavailable: button is replaced with "<NAME> LEFT", only LOBBY remains.
  A pending 1/2 vote dies with the room.
- Rematch loops indefinitely — every rematch re-runs the same flow.

---

## 5. Architecture & file plan

Bottom-up layer order, per repo rules:

```
server/                        # NEW — own tsconfig, runs with tsx/node
  index.ts                     # ws server: queue, rooms, relay, safety timer
  matchmaking.ts               # pure: queue pairing logic (testable)
  room.ts                      # pure-ish: room state machine (testable)

src/
  types/
    multiplayer.ts             # NEW — ClientMessage / ServerMessage unions,
                               #   LobbyPhase, shared PROTOCOL constants
  services/
    multiplayer/
      socket.ts                # NEW — thin typed WS client wrapper:
                               #   connect, send(msg), onMessage, onClose
  features/
    lobby/
      LobbyScreen.tsx          # NEW — name form + matchmaking states + 3-2-1
      LobbyScreen.css
      randomName.ts            # NEW — pure name generator (testable)
      store.ts                 # NEW — lobby/connection state
      __tests__/
    match/
      store.ts                 # EDIT — add multiplayer mode: outcomes come
                               #   from server events instead of local submit
      MatchScreen.tsx          # EDIT — names, turn banner, spectate view
      components/PitchScene.*  # EDIT — add idle mode (ball + waiting keeper)
  App.tsx                      # EDIT — 'intro' | 'lobby' | 'match' switch
```

**Protocol sketch** (one discriminated union in `types/multiplayer.ts`,
imported by both client and server so they can never drift):

```
client → server: { type:'queue', name } | { type:'cancel' }
                 | { type:'kickResult', correct }
                 | { type:'rematchVote' } | { type:'leave' }
server → client: { type:'queued' }
                 | { type:'matched', opponentName, youGoFirst, questions }
                 | { type:'kickResolved', by:'you'|'opponent', scored }
                 | { type:'rematchVotes', count }        // 1 or 2
                 | { type:'rematchStart', youGoFirst, questions }
                 | { type:'opponentLeft' } | { type:'error', reason }
```

**Match store:** extend the existing store with a mode flag rather than a
second store — in `'1v1'` mode `submitAnswer` sends `kickResult` to the
server and applies state only when `kickResolved` comes back, so both clients
stay in lockstep off the same authoritative event stream.

### Tests (TDD, pure layers first)

- `randomName.test.ts` — shape, non-empty, respects max length.
- `server/matchmaking.test.ts` — two queued → paired; one queued → waits;
  cancel removes; first-mover assigned.
- `server/room.test.ts` — turn alternation, kick relay, safety timeout = miss,
  disconnect = forfeit, match end detection; rematch: one vote → count 1,
  both votes → room reset (fresh coin flip + questions, scores cleared),
  leave/disconnect at result kills a pending vote.
- Lobby store — name validation blocks queueing, state transitions
  idle → searching → found → starting.
- Match store 1v1 mode — `kickResolved` events drive the same `applyAnswer`
  path; no regression to CPU mode (existing tests must stay green).
- UI screens verified visually + existing testing-library patterns; WS mocked
  at the boundary (`socket.ts`) per repo mocking rules.

### Build order (atomic milestones)

Milestones group into four demoable phases + deploy. Each phase ends with
the repo green (typecheck + tests) and something you can actually see work,
so the work can pause/resume at any phase boundary.

- **Phase A — Foundations (1–5): ✅ done.** types, name generator, server logic +
  runnable WS server. *Verified: tests pass; server pairs two raw socket clients.*
- **Phase B — Lobby (6–9): ✅ done.** socket client, lobby screen, intro button,
  routing. *Verified: two browser tabs enter names, queue, get matched, see the
  3-2-1 countdown.*
- **Phase C — The match (10–11): ✅ done.** 1v1 match store mode + match screen UI.
  *Verified in-browser: pairing, names, turn banner, spectate view, kick relay,
  animations. Playing a match to its result is the user's to confirm.*
- **Phase D — Rematch & hardening (12–13): ✅ code done.** Rematch shipped in
  Phase C. Hardening added: server `send()` guards closed sockets; client
  surfaces `CONNECTION LOST` on an unexpected socket drop (server/own-network,
  distinct from the opponent leaving); fixed the LOBBY button routing to intro.
  The end-to-end *play* pass (milestone 13 — full match, both endings, rematch
  loop, disconnect, timeout) is the user's, per `CLAUDE.md`.
- **Deploy:** client → Vercel, server → Render/Railway, `VITE_WS_URL`, origin
  check. Needs your hosting account (§6) — everything before this is local.

1. `types/multiplayer.ts` — protocol + lobby types.
2. `randomName.ts` + tests.
3. Server: matchmaking pure logic + tests.
4. Server: room state machine + tests.
5. Server: `index.ts` wiring (`ws`), runnable via `npm run dev:server`.
6. Client `socket.ts` wrapper.
7. Lobby store + tests.
8. Lobby screen UI (form, validation warning, states, countdown).
9. Intro screen: add 1 V 1 button; App routing.
10. Match store 1v1 mode + tests.
11. Match screen 1v1 UI (names, turn banner, PitchScene idle spectate view,
    disconnect state).
    The "who goes first" + 3-2-1 countdown becomes a small shared component
    (lobby uses it for the first match, match screen for rematches).
12. Rematch: server vote handling + result-screen button (0/2 → 1/2 → restart).
13. End-to-end check: two browser windows, full match, both endings, a
    rematch loop, a disconnect, a timeout.

---

## 6. Things I need YOU to do

1. **Nothing to start development** — everything runs locally (Vite + local
   WS server, two browser tabs to test).
2. **For anyone to actually play online:** the client goes on **Vercel**
   (decided), but Vercel can't run the WS server — create an account on
   **Railway / Fly / Render** for it. I can write the deploy config; you
   provision the account and paste the resulting `wss://` URL into the
   Vercel project's `VITE_WS_URL` env var.
3. If the trivia source should differ for 1v1 (e.g. football-only bank when it
   exists), say so — otherwise the server uses the same OpenTDB batch fetch.

## 7. Things YOU still need to decide / address

> Resolved: shooter-only answers (no keeper questions); spectator sees the
> idle pitch scene (ball + waiting goalie), never the opponent's question.

1. **First-turn choice:** server coin flip — OK, or should it be something
   else (e.g. joiner always second)?
2. **Name rules:** any profanity filtering needed, or is anything-goes fine
   for now? (Plan: anything non-empty goes, 16-char cap.)
3. **Match abandonment stakes:** disconnect = instant win for the other
   player. Fine while there's no ranking; revisit if stats ever land.

---

## 8. Explicitly out of scope (future phases)

- Friendly match (invite a friend via code/link) — button ships disabled.
- Lobbies of >2, chat.
- Accounts, persistent stats, leaderboards, rankings.
- Reconnection/resume after network drops.
- Server-side anti-cheat.
- Scaling beyond one server process (needs sticky rooms/Redis — nowhere near
  needed at current scale).
