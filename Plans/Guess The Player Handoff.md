# Guess The Player - handoff

> Goal for the next agent: take the working 10-player prototype to a full
> "guess the player from a picture" mode. Read `Modernisation Direction.md`
> first (rights guardrail applies), then `CLAUDE.md`.

## What exists (done and tested)

**Asset pipeline** - `scripts/players/`

- `fetchPlayers.ts [--limit N] [--dry-run]`: Wikidata ranks footballers by
Wikipedia sitelink count (must have "country for sport" P1532 to exclude
non-footballers). For each, Commons licence is checked; only CC0 / public
domain / CC BY / CC BY-SA photos pass. Downloads to `.cache/raw/` (gitignored)
and writes `.cache/candidates.json`. Throttled, identifying User-Agent.
- `stylise.ts [--grid 40] [--colours 12]`: crops via `crops.json`, median
smooths, shrinks to a pixel grid, palette-reduces, upscales nearest-neighbour
to 384px lossless WebP in `src/assets/players/`, writes
`src/assets/players/players.json` (name, country, positions, credit) and a
before/after `.cache/contact-sheet.jpg`.
- `crops.json` is **hand-authored per player** as fractions
(`x`, `y` of the image, `size` of the width). This is the only manual step and
does not scale. Replace it with face detection or a segmentation model.

**Game wiring** - 10 players: Messi, Ronaldo, Pelé, Maradona, Neymar, Zidane,
Beckham, Mbappé, Cruyff, Totti.

- `src/services/trivia/bank/pictures.ts`: bank topic `pp` ("Picture Players").
`image` is a portrait **key** (file stem), not a URL, because the Node server
loads the same bank and cannot import `.webp`. Distractors are other pack
players picked by fixed stride.
- `BankEntry.image` / `Question.image` (`src/types/trivia.ts`); carried through
`sampler.ts` and `questionFromRef` in `bank/localised.ts`.
- `src/features/match/playerPortrait.ts`: key -> URL via `import.meta.glob`.
- `MatchScreen.tsx` and `TestModeScreen.tsx` render `.match__picture`
(`MatchScreen.css`). Test mode has a **Picture** button (Ronaldo).
- Tests: `bank/__tests__/pictures.test.ts`, plus picture cases in
`testMode/__tests__/TestModeScreen.test.tsx`.

Picture questions are in **solo play, the on-device bot fallback, and online
1v1 when both players' builds support them**, mixed with text questions at random.

## Scope for the next agent

**Job: fill the question bank.** Gather many more player portraits and turn
them into picture questions. Nothing else.

**Out of scope (decided, do not build):** silhouette/clue mode, tap-the-letters
input, analytics events, Supabase-hosted image packs, non-English prompts, a
Credits screen.

### Do

1. Scale `fetchPlayers.ts` to a few hundred players (raise `--limit`; widen the
   SPARQL pool; keep the request throttling). Add `--skip name,name` so bad
   results spotted on the contact sheet can be dropped and the next-ranked
   player drawn instead.
2. Automate the crop (face detection or segmentation) and, if feasible, put
   every player on one flat background. Hand-written `crops.json` does not scale.
   Busy backgrounds currently eat the 12-colour palette (Ronaldo, Maradona,
   Beckham look muddier than Pelé, Zidane).
3. Generate `src/services/trivia/bank/pictures.ts` from `players.json` instead
   of the hand-typed list. **Append only**: ids are `pp-<index>`; reordering or
   inserting breaks recent-question history and in-flight matches.
4. Give each question 3 plausible wrong answers (same era / country / position
   from the pack), not the current fixed-stride names. Set `difficulty` by fame
   rank (sitelinks): top ranks `easy`, the tail `hard`.
5. Keep the APK in check: 384px lossless WebP x hundreds is large. Measure, and
   switch to lossy WebP around 256px if it grows too much. All `.webp` in
   `src/assets/players` is bundled by the glob in `playerPortrait.ts`.
6. Update `pictures.test.ts` (it asserts >= 10 entries) and keep
   `npm run typecheck`, `npm run lint` and `npm test` green.

### Caveats to be aware of (no action needed)

- **Credits:** CC BY / CC BY-SA require crediting photographers. `players.json`
  keeps `credit` per player (author, licence, source URL), so keep that intact
  when regenerating. The Credits screen itself is separate work and **must ship
  before a release containing these images.**
- Wikidata `positions` are noisy (Neymar is "wing half"); do not use them for
  anything user-facing.
- Commons licensing covers photo copyright, not likeness/endorsement rights or
  Google Play's "professional images of public figures" policy. Flag it to the
  user; do not try to solve it.
- Online 1v1 only includes pictures when both players' builds send
  `?pictures=1` (`socket.ts` -> `Connection.supportsPictures` ->
  `bankForMatch`). Already done; leave it alone.

## Verification

`npm run typecheck`, `npm run lint`, `npm test`. Per `CLAUDE.md`, do not play
the game yourself - ask the user to open Test Mode > Picture, or start a solo
match, and look.
