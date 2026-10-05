# Football Trivia Battle — Level Mode Plan

> **Nature of this doc:** The build plan for a solo level mode inspired by
> *Football Quiz! Ultimate Trivia*: a level list on the home screen, a grid of
> question cards per level, coins per correct answer, a shop item for clearing
> a level. Decisions below were agreed on 2026-10-05; tunable numbers are marked
> as such. The patterns come from that game; the content, art and copy are ours
> (see the guardrail in `Modernisation Direction.md`).

## 1. The player loop

```
Home -> tap Level N -> grid of question cards -> tap any card
     -> question + 4 answers (no timer)
     -> wrong: card stays open, try again, coin reward drops
     -> right: coins paid, card flips to "solved"
     -> all cards solved: level prize (fixed shop item or coin chest)
     -> total solved count unlocks further levels
```

At the top of Home, above the level list, a **Play vs Human** card goes to the
existing lobby (quick match / friendly). The shootout stays as the battle mode.

## 2. Decisions

| Topic | Decision |
|---|---|
| Wrong answer | Retry allowed; reward drops per wrong try |
| Timer | None |
| Unlocking | By **total questions solved** across all levels (never decreases) |
| Picture questions (`pp`/`pt`) | Included. The **card face** never shows a photo or crest, only a category icon; the image appears only once the question is opened, as in the shootout |
| Level prize | **Fixed** per level, shown on the level row |
| Level makeup | Mixed categories, difficulty ramps level by level |
| Card order inside a level | Any unlocked level's cards can be opened in any order |

## 3. Content: the level manifest

Levels are **not** sampled at runtime. A one-off script
(`scripts/buildLevels.ts`) builds `src/game/levels/manifest.ts`: an ordered list
of levels, each with its question ids, title and prize. The manifest is checked
in and **append-only**. Reordering it would move solved questions between
levels and break saved progress plus the server's seed data.

Build rules:
- Pool = the full `footballBank` (665 questions today).
- Sort by difficulty (easy → medium → hard), then deal round-robin across
  topics, so each level mixes categories and later levels are harder.
- **24 cards per level** → 27 full levels plus a short final level (17 cards).
  New questions added later become new levels at the end.
- Level titles are a career ladder in plain text, so no art is needed:
  *Sunday League, Academy, Reserves, First Team, Captain, ... , Ballon d'Or*.

Unlock threshold (tunable): `unlockAt(n) = round(0.75 * 24 * (n - 1))`.
Level 1 is open from the start, Level 2 opens at 18 solved, Level 3 at 36, and
so on. The level row shows "★ 37"-style requirements (using our coin/ball icon,
not a star).

## 4. Economy (tunable constants in `src/game/levels/rewards.ts`)

Per question, by wrong tries before the correct answer: **3 → 2 → 1 → 1**
(the floor is 1). A full no-mistakes run of all levels pays ~2,000 coins. That
is deliberately in line with the existing economy: a 1v1 win pays 3, a rewarded
ad 25, and shop items cost 100–200. The 10/6/3/1 suggestion would have paid out
~6,600 coins and made coin packs pointless. **Confirmed 2026-10-05**, along
with the 50-coin chest and the unlock curve. Tune after watching real numbers.

**Level prizes:** odd levels give a shop item, cheapest first. Even levels give
a coin chest (tunable, 50 coins).

| Level | Prize | Level | Prize |
|---|---|---|---|
| 1 | goal_horn | 15 | gk_coral_guard |
| 3 | ball_gold_trim | 17 | goooooooooal |
| 5 | gooal | 19 | ball_neon_streak |
| 7 | ball_carnival_swirl | 21 | gk_orange_blaze |
| 9 | gk_green_wall | 23 | video_game_sound |
| 11 | celebration_yell | 25 | ball_prism_panel |
| 13 | ball_crimson_block | 27 | gk_gold_standard |

If the player already **bought** the prize item, they get its shop price in
coins instead. A prize should never feel like nothing.

## 5. Trust and persistence

The bank ships in the APK, so answer correctness is client-trusted, like daily
challenges. The defence is the **bound**: every question pays at most once per
account, and every prize at most once. The server enforces both.

**Signed in (server-authoritative payouts)**, split across migrations
0019–0021 by phase (see §8):
- `level_questions(question_id pk, level int)` and
  `level_prizes(level pk, item_id null, coins int)`, seeded from the manifest
  (the script generates the seed SQL alongside the TS).
- `level_solves(user_id, question_id, wrong_tries, coins_paid, solved_at)`,
  unique on `(user_id, question_id)`.
- `level_prize_claims(user_id, level)`, unique.
- RPC `claim_level_question(question_id, wrong_tries)`: rejects unknown ids,
  computes coins **server-side** from the clamped `wrong_tries`, inserts, and
  calls `increment_coins`. A duplicate pays 0 and returns the existing row.
- RPC `claim_level_prize(level)`: checks that every question in the level has
  a `level_solves` row, then inserts into `owned_items`, or pays coins if it is
  a chest or the item is already owned. This is the first **free grant** path;
  `purchase_item` stays the only paid one.
- RPC `list_level_progress()`: solved ids and claimed prizes, for hydration.

**Signed out:** local store `ftb.levels` = `{ solved: { [qid]: wrongTries },
prizesClaimed: number[] }`.
- Coins go into `localProgressStore.addCoins`, so they are spendable in the
  local shop and fall under the existing `claim_local_progress` lifetime cap
  when claimed.
- On sign-in, a batch RPC `import_level_progress(jsonb)` records the solved ids
  with `coins_paid = 0` (progress only, no second payout) and grants any prize
  items earned offline.

## 6. Client architecture

- `src/game/levels/` (pure, tested): `manifest.ts`, `rewards.ts`
  (`coinsForTries`, `unlockAt`), `progress.ts` (`levelStatus`, `isUnlocked`,
  `isComplete`, `totalSolved`).
- `src/services/levels.ts`: API seam over the three RPCs (injectable, like
  `customizationApi`).
- `src/features/levels/store.ts`: `createLevelStore(deps)`, the same
  hand-rolled `{ getState, subscribe }` pattern. It holds solved/tries/prizes,
  `answer(qid, choice)`, and `claimPrize(level)`, and switches between the
  local and server paths on `authStore` status.
- Screens (plain co-located CSS, Press Start 2P, `PixelButton`, `Sprite`):
  - `HomeScreen` replaces `IntroScreen`'s button stack: logo, a Play vs Human
    card, then a scrollable level list. Each row shows the title, a progress
    bar `n/24`, the prize, or a lock with its requirement. Shop and Sign In
    move to a header row; the Play Games / sign-out rules are unchanged.
  - `LevelScreen`: header (back, title, progress bar), a 3-column card grid.
    A card shows the category icon and state: unsolved, solved (check), or
    tried-wrong (dimmed tick count).
  - `LevelQuestion`: prompt, picture if any, 4 answers, wrong shake and
    correct flash, "+3" coin pop, back to grid. Reuses the shootout's
    answer-button styling.
  - `LevelCompletePopup`: prize reveal; "equip now" for items.
- `App.tsx`: new `Screen` values `'level' | 'levelQuestion'` (or `level` with
  sub-state), same `useState<Screen>` pattern.
- Analytics: `level_question_answered`, `level_completed`, `level_prize_claimed`.
- Daily challenge `answer_15` also counts level answers.
- English only per `AGENTS.md`; new strings go through the i18n `en` table.

## 7. Assets (done)

All art is in `src/assets/levels/`: pixel-art PNGs on a transparent
background, with the existing sprites' dark outline and white sticker rim.
They were drawn in code and the generator scripts were deleted, so a change
means a redraw. Render them with `image-rendering: pixelated`.

| File | Size | Use |
|---|---|---|
| `category-world-cup.png` | 32×32 | Card face: gold trophy holding a ball |
| `category-european-cups.png` | 32×32 | Card face: silver big-eared cup |
| `category-leagues.png` | 32×32 | Card face: pennant |
| `category-players.png` | 32×32 | Card face: faceless bust in a jersey |
| `category-clubs.png` | 32×32 | Card face: blank split shield |
| `category-national-teams.png` | 32×32 | Card face: globe |
| `category-rules.png` | 32×32 | Card face: yellow and red referee cards |
| `category-records.png` | 32×32 | Card face: book |
| `category-picture-players.png` | 32×32 | Card face: bust with a "?" |
| `category-picture-teams.png` | 32×32 | Card face: dark shield with a "?" |
| `padlock.png` | 32×32 | Locked level row and locked prize |
| `chest-closed.png` | 32×32 | Coin-chest prize on a level row |
| `chest-open.png` | 32×32 | Prize reveal |
| `tick.png` | 32×32 | Solved card |
| `play-vs-human.png` | 96×48 | Play vs Human card |

There are no real crests, faces or kits. Map topic prefixes to icons as
`wc→world-cup, ec→european-cups, lg→leagues, pl→players, cl→clubs,
nt→national-teams, ru→rules, re→records, pp→picture-players,
pt→picture-teams`. Card frames, level rows and progress bars are CSS.
Correct/wrong answer sounds are skipped; existing sounds stand in.

**The only setup left on your side** is running each phase's Supabase
migration (see §8).

## 8. Build phases

Three phases. Each one is test-first (Vitest beside the code), ends with
`npm test` + `npm run typecheck` green, and finishes with you playing it on
the phone.

### Phase 1: Level 1, first question (vertical slice)

The whole loop, end to end, with one question.

- `src/game/levels/`: `coinsForTries` (3/2/1/1) and a hand-written
  manifest holding just **Level 1 with one question**.
- `createLevelStore`: open a card, answer it, track wrong tries, mark it
  solved, and pay coins. It persists to local `ftb.levels`.
- Coins: signed out goes to `localProgressStore.addCoins`. Signed in calls
  `claim_level_question`, from migration `0019_level_mode.sql` with
  `level_questions` seeded with that one id, `level_solves`, and the RPC.
- UI: `HomeScreen` with the **Play vs Human** card (→ existing lobby) and a
  Level 1 row. `LevelScreen` shows a one-card grid. `LevelQuestion` handles
  the wrong shake, retry, correct flash and "+3" coin pop.
- **Your check:** tap Level 1 → the card → a wrong answer, then the right one.
  Coins go up by 2. Reopening shows the card solved, and answering it again
  pays nothing. Do it signed out and signed in.
- **Your setup:** run `0019_level_mode.sql`.

### Phase 2: Level 1 complete, with rewards

Level 1 becomes a real 24-card level, and finishing it pays out.

- Manifest builder: a pure function (bank → levels) that is deterministic,
  24 per level, ramps difficulty and mixes categories. It generates the
  checked-in `manifest.ts` and the seed SQL. Only Level 1 is exposed for now.
- Level 1 prize (`goal_horn`) and the owned-item → coins fallback.
- Migration `0020_level_prizes.sql`: the full Level 1 seed, `level_prizes`,
  `level_prize_claims`, `claim_level_prize`, `list_level_progress`, and
  `import_level_progress`.
- Store: prize claim on both paths; hydrating from the server on sign-in;
  importing offline progress on sign-in without paying twice.
- UI: the 24-card grid with category icons, solved ticks and a progress bar
  `n/24`. The level row shows its prize. `LevelCompletePopup` reveals the
  prize with "equip now". The Level 2 row shows a padlock.
- Daily challenge `answer_15` counts level answers; analytics events.
- **Your check:** clear Level 1 signed out and get the goal horn. Then sign in
  and confirm the progress, coins and horn all carried over. Clear it on a
  second account that already **bought** the horn, and get 100 coins instead.
- **Your setup:** run `0020_level_prizes.sql`.

### Phase 3: all levels

The rest of the manifest goes live.

- Expose all ~28 levels, with titles (career ladder), `unlockAt(n)`, and the
  full prize table (odd levels give an item, even levels a 50-coin chest).
- Migration `0021_level_seed.sql`: every level's questions and prizes.
- UI: the full scrollable level list with lock states and "needs N solved".
  The chest sprite shows on even-level rows. Polish sprite sizing on phone
  screens.
- **Your check:** Level 2 unlocks at 18 solved, and an even level pays its
  chest. Scroll the list on a small phone.
- **Your setup:** run `0021_level_seed.sql`.

## 9. Out of scope for now

Hints and letter reveals (a natural coin sink, so it's the likely next step),
per-level star ratings, leaderboards, and the spin wheel / video / invite row
from the reference game.
