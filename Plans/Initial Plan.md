# Football Trivia Battle — Phase 1 Plan

> **Nature of this doc:** This is a living plan, not a contract. The app is being
> vibe-coded and will grow across multiple phases. Anything below can be torn up
> when a better idea shows up — the goal of Phase 1 is to get a *playable*
> 1 v CPU penalty-shootout trivia match on screen, looking decent on both
> desktop and phone. Polish, extra modes, and content depth come later.

---

## 1. What Phase 1 ships

A single-page web app with two states:

1. **Intro screen** — logo centered over a blurred football-pitch background
   (shot from the penalty-taker's angle). One button/mode: **1 v CPU**.
2. **Match screen** — a penalty shootout driven by trivia questions, played to
   real football shootout rules, ending on a win/lose result that returns you
   to the intro.

That's the whole loop. No accounts, no persistence, no settings, no other modes.

---

## 2. Decisions locked for Phase 1

| Area | Decision |
|------|----------|
| **Stack** | Vite + React + TypeScript |
| **Styling** | Deferred — design to be figured out later (likely via Claude design tooling). Code keeps styling decoupled so it can be dropped in without restructuring components. |
| **Questions** | ~~OpenTDB Sports category~~ **Superseded:** a bundled **football-only question bank** (~400 hand-written questions across 8 topics in `services/trivia/bank/`). No network, no rate limits, works offline. Still served through the same `questionSource` seam. |
| **Shootout rules** | Real football: best-of-5 each, then sudden death if level. |
| **Timer** | **10 seconds** per question. Built as a configurable value (single constant / store field) so it can be changed or made user-selectable in a future phase. Timeout counts as a wrong answer. |
| **Difficulty** | **Mixed** — request all difficulties from OpenTDB (don't pin `difficulty=`). |
| **API failure** | No longer applicable — questions are bundled with the app, so there is no API to fail. `getQuestions()` never throws. |
| **Target screens** | Responsive — desktop *and* mobile. Mobile-first layout. |

### Question bank notes (replaced OpenTDB)
OpenTDB was used in Phase 1 but had no football-only category, was rate-limited,
and could fail mid-session. It has been fully replaced by a bundled bank:

- **~400 football-only questions** in `src/services/trivia/bank/`, split by topic:
  World Cup, European cups, leagues, players, clubs, national teams,
  rules & tactics, records & history. Each entry has easy/medium/hard difficulty.
- **Sampler** (`sampler.ts`): draws a non-repeating random batch per match and
  shuffles the four answers at draw time (correct answer never in a fixed slot).
- **Repeat avoidance** (`recentIds.ts`): the last ~120 served question ids are
  kept in localStorage so back-to-back matches don't reuse questions.
  Best-effort — silently skipped on the server / private browsing.
- **Multiplayer:** the WS server samples a shared 30-question batch per room
  from the same bank (pure functions, Node-safe — no DOM APIs).
- Adding questions = appending entries to a topic file. Ids stay stable as long
  as existing entries keep their order.

---

## 3. Match design

### Round structure
A shootout proceeds in **kicks**, alternating who the user is each kick:

- **Stage A — User shoots (attacker):**
  - Correct answer → **goal scored**, user +1.
  - Wrong / timeout → **penalty missed**, no point.
- **Stage B — User is keeper (defender):**
  - Correct answer → **save**, no point for CPU.
  - Wrong / timeout → **CPU scores**, CPU +1.

The match alternates A, B, A, B… exactly like both teams taking turns in a real
shootout (user's attack = their team's kick; user's save = the CPU team's kick).

### Win logic (real rules)
1. Standard phase: each side gets up to **5 kicks**.
2. *(Optional, Phase 1.5)* End early when the result is mathematically decided
   (e.g. 3–0 after 3 each can't be caught). Phase 1 can simply play all 5.
3. If level after 5 each → **sudden death**: one kick each per round; first round
   that ends with a lead wins.
4. Result screen: **WIN / LOSE**, final score, "Play Again" → back to intro.

A small pure function (`resolveShootoutState`) owns all of this so it's unit-testable
with fixed inputs and no UI involved.

---

## 4. Architecture (build bottom-up)

Following the project's layer order — types → logic → state → tests → UI → wiring.
Skip nothing in this order; UI comes last.

```
src/
  types/
    trivia.ts          # Question, Answer, Difficulty
    match.ts           # ShootoutState, Kick, Stage, MatchResult
  services/
    trivia/
      bank/             # football-only question bank, one file per topic
      sampler.ts        # non-repeating draw + per-draw answer shuffle
      recentIds.ts      # localStorage-backed cross-match repeat avoidance
      questionSource.ts # abstraction: getQuestions(count) -> Question[]
  game/
    shootout.ts        # resolveShootoutState(), isMatchOver(), nextStage()
    scoring.ts         # pure point/result helpers
  features/
    match/
      store.ts          # match state (questions, score, current kick, stage)
      components/        # QuestionCard, AnswerButtons, Scoreboard, PitchScene...
      MatchScreen.tsx
    intro/
      IntroScreen.tsx
  App.tsx               # screen switch: intro <-> match
  main.tsx
__tests__/              # adjacent to source per repo convention
```

### State management
A lightweight store (Zustand is a good fit, or plain `useReducer` + context).
Keep match logic *out* of the store — the store calls the pure `game/` functions
and holds the result. This keeps the rules testable without React.

### Testing (TDD per repo rules)
Write tests first for the pure layers:
- `shootout.test.ts` — score transitions, when sudden death triggers, win/lose
  detection, level-after-5 case, attacker vs keeper point assignment.
- `questionSource.test.ts` — HTML-entity decoding, shaping API rows into
  `Question`, empty/failed-fetch fallback.
- Mock only the boundary (the `fetch`/network call), not our own modules.

---

## 5. Screens & UX

### Intro screen
- Full-bleed background: **blurred pitch from the penalty angle** (goal ahead,
  penalty spot foreground). Heavy blur + slight dark overlay so the logo pops.
- Logo centered.
- **1 v CPU** button below/over the logo. (Leave visual room for future modes —
  don't hardcode a single-button layout that can't grow into a menu.)

### Match screen
- **Pitch scene** at top (the animated pixel-art penalty view): keeper, goal,
  ball, shooter.
- **Scoreboard**: user vs CPU, with the classic shootout dots (⚽ scored / ❌ missed)
  per kick.
- **Question card**: prompt + multiple-choice answer buttons.
- **Stage indicator**: "You're shooting" / "You're in goal".
- **10s per-question timer** (configurable) — on expiry the answer is treated as
  wrong, driving the "timeout = miss / concede" path.
- After answer: short **animation** (ball hits net / keeper saves), then advance.
- End → **result overlay** (WIN/LOSE + score + Play Again).

### Responsiveness
- Mobile-first. Single column on phones: scene on top, question below.
- Desktop: more breathing room, larger pitch scene, possibly scene + question
  side-by-side. Use CSS breakpoints; avoid fixed pixel widths.

---

## 6. Pixel art & animation — AI tool suggestions

You said you'll figure out the design; here are tools that fit pixel-art + web:

**Generating pixel art / sprites**
- **Aseprite** — the standard for hand-made pixel art + sprite-sheet animation
  (paid, one-time). Exports sprite sheets + JSON frames.
- **Piskel** (free, web) — quick browser-based sprite + animation editor.
- **Retro Diffusion** / **PixelLab.ai** — AI pixel-art generators if you want to
  prompt sprites (keeper poses, ball, crowd) rather than draw them.
- **Claude / image models** for concept art and the blurred pitch background, then
  downscale/quantize to a pixel look.

**Animating in React**
- **CSS sprite-sheet animation** (`steps()` + `background-position`) — cheapest,
  perfect for looping pixel frames; no dependency.
- **Framer Motion** — for transitions (screen swaps, ball trajectory, scoreboard pop).
- **PixiJS** — if the pitch scene gets ambitious (particles, smooth ball physics);
  heavier, consider only if CSS/Framer hits a wall.

**Recommendation for Phase 1:** start with **CSS sprite-sheet animations + Framer
Motion** to stay lightweight, and reach for PixiJS later only if the scene demands it.

Keep `image-rendering: pixelated` on sprite assets so they stay crisp when scaled.

---

## 7. Build order (atomic milestones)

1. **Scaffold** — Vite + React + TS project, run dev server, blank App. ✅ when it boots.
2. **Types** — `trivia.ts`, `match.ts`.
3. **Question source** — OpenTDB client + decode + abstraction, with tests.
4. **Shootout logic** — pure functions, fully unit-tested (TDD first).
5. **Match store** — wires logic; no UI yet, verifiable via tests/console.
6. **Intro screen** — logo + blurred background + 1 v CPU button (placeholder art ok).
7. **Match screen (static)** — question card, answer buttons, scoreboard, stage label.
8. **Wire the loop** — intro → match → result → intro.
9. **Animations & pixel polish** — sprite scenes, transitions, timer.
10. **Responsive pass** — verify desktop + mobile layouts.

Each milestone is independently demonstrable. Stop and re-plan if any one balloons.

---

## 8. Explicitly out of scope (future phases)

- Other modes (1 v 1 local/online, tournaments). *(1 v 1 online since shipped.)*
- ~~Football-only curated question bank.~~ *(Shipped — see question bank notes above.)*
- Difficulty selection, categories, custom rounds.
- Accounts, leaderboards, stats persistence.
- Sound design.
- Early mathematical termination of the shootout (nice-to-have).

---

## 9. Resolved details

- **Timer:** 10 seconds per question, configurable (single constant / store field for
  future user-selectable timers). Timeout = wrong answer.
- **Difficulty:** mixed — the bank sampler draws across easy/medium/hard.
- **Resilience:** questions ship with the app; `getQuestions()` never throws and
  needs no network, so the game can't hard-fail on question fetch.
- **Answer options:** 4 multiple-choice — kept as is.
