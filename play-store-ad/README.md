# play-store-ad

A 30-second promo video for **Football Quiz: Trivia Battle**, built with
[Remotion](https://remotion.dev). Self-contained: its own `package.json` and
`node_modules`, nothing in the game's build touches it.

## Render

```bash
npm install          # once
npm run dev          # Remotion Studio, scrub the timeline at localhost:3000
npm run render       # -> out/football-trivia-battle-portrait.mp4  (1080x1920)
npm run render:landscape  # -> out/...-landscape.mp4               (1920x1080)
npm run render:all
```

## The two cuts

| Composition | Size | Where it goes |
| --- | --- | --- |
| `Portrait` | 1080x1920 | Google Ads app campaigns, Shorts/Reels, anywhere vertical |
| `Landscape` | 1920x1080 | The Play listing's promo video (a YouTube link — YouTube wants 16:9) |

Both play the *same* 30s cut: everything is authored on one 1080x1920 canvas
(`src/Ad.tsx`), and `Landscape` scales that canvas into a framed phone panel
with a headline column beside it that changes with each scene.

## Timeline

30 fps, 900 frames. Scene boundaries live in one place, `TIMELINE` in
`src/theme.ts` — move a number there and the sequences, the cut flashes and the
landscape headlines all follow.

| Frames | Scene | Beat |
| --- | --- | --- |
| 0–74 | `Hook` | "Think you know football? Prove it." |
| 75–254 | `Question` | Real question, clock draining, the tap lands on 1970 |
| 255–404 | `Kick` | Penalty, keeper goes the wrong way, GOAL! |
| 405–524 | `Online` | Quick match pairs you with a live opponent |
| 525–674 | `Save` | Sudden death, you're in goal, SAVED! → YOU WIN |
| 675–899 | `Cta` | Icon, name, promises, the ask |

## Why it looks like the game

Nothing here is a screen recording. `src/components/PitchScene.tsx` is a
frame-driven port of the game's own `src/features/match/components/PitchScene`:
the actors sit on a 16:9 "stage" sized exactly the way `background-size: cover`
sizes `bg.jpg`, so every coordinate is the number the game's CSS already uses
(penalty spot 50%/80%, top corner 39%/38%, goal line 51%). The HUD in
`src/components/Hud.tsx` mirrors `MatchScreen.css`. Sprites, the pixel font and
every sound in `public/` are copies of the game's own assets.

Changing the game's art or geometry will not update this folder — the copies in
`public/` are snapshots. Re-copy from `src/assets/` if the pitch is reworked.

## Copy

Every claim on screen is one the store listing already makes: no sign-up, no ads
mid-match, free to play, live 1v1. The trivia question is a real one out of
`src/services/trivia/bank/worldCup.ts`. Keep it that way.
