# Sprite Transfer Plan — placeholder scene → real pixel art

> **Nature of this doc:** Companion to `Initial Plan.md`. Phase 1 shipped the
> match scene as a CSS/emoji placeholder (`PitchScene`). This plan describes
> how to swap in real pixel-art sprites later without touching game logic,
> the store, or the match screen layout.

---

## 1. What exists today (the contract to keep)

`src/features/match/components/PitchScene.tsx` is the **only** file that knows
what the scene looks like. Its props are the contract:

```ts
type Props = {
  stage: Stage                        // 'shoot' | 'keep' — who the user is this kick
  feedback: SceneFeedback | null      // 'goal' | 'miss' | 'save' | 'concede' | null (idle)
}
```

- `MatchScreen` drives the scene purely through these props. The feedback
  animation window is `FEEDBACK_MS` (1400ms) in `MatchScreen.tsx` — the sprite
  animations must fit inside it (or `FEEDBACK_MS` gets bumped, one constant).
- Everything else (store, shootout rules, timer, tests) is scene-agnostic.
  **The swap is: replace PitchScene's internals + CSS. Nothing else changes.**

## 2. Asset inventory

| Asset | Frames | Notes |
|---|---|---|
| Pitch background (penalty angle) | 1 | Goal centered, penalty spot foreground. Can reuse the intro `bg.jpg` style, unblurred, pixelated |
| Goal + net | 1 | Can stay baked into the background |
| Keeper — idle | 2–4 | Subtle sway loop while waiting |
| Keeper — dive left (save) | 4–6 | Plays on `feedback === 'save'` |
| Keeper — dive wrong way (concede) | 4–6 | Mirror/reuse dive frames if possible |
| Shooter — kick | 4–6 | Plays at the start of any `shoot`-stage feedback |
| Ball — flight to net corner (goal/concede) | 4–8 | Same frames, different end corner |
| Ball — over the bar (miss) | 4–8 | |
| FX — net ripple / dust (optional) | 2–4 | Nice-to-have, skip first pass |

Keep every sheet on a transparent background, consistent pixel density
(e.g. 32×32 or 48×48 per frame), exported as **horizontal strip PNG**.

## 3. Generation options (pick one, in order of least effort)

1. **AI pixel generators** — Retro Diffusion / PixelLab.ai: prompt per row of
   the table above ("pixel art goalkeeper diving left, 6-frame sprite sheet,
   side view, transparent background, 48x48 per frame").
2. **DesignSync / Claude Design project** — same route that produced the intro
   background (`Intro Background.dc.html`); good for the pitch background.
3. **Hand-touch-up** — Piskel (free, browser) to fix frames, align anchors,
   and re-export sheets. Aseprite if this becomes a habit.

Whichever tool: normalize all sheets to the same frame size before wiring.

## 4. The swap, step by step

1. Drop sheets into `src/assets/sprites/` (e.g. `keeper-dive.png`).
2. In `PitchScene.css`, replace each emoji element with a sprite div:
   ```css
   .scene__keeper {
     width: 48px;
     height: 48px;
     background: url(../../../assets/sprites/keeper-idle.png) 0 0 no-repeat;
     image-rendering: pixelated;
   }
   /* 6-frame strip: animate background-position with steps() */
   .scene--save .scene__keeper {
     background-image: url(../../../assets/sprites/keeper-dive.png);
     animation: keeper-dive 0.6s steps(6) forwards;
   }
   @keyframes keeper-dive {
     to { background-position: -288px 0; } /* 6 × 48px */
   }
   ```
   This is the same `steps()` technique the placeholder already uses — only
   the `@keyframes` targets change from `transform` to `background-position`.
3. Delete the emoji spans/CSS-drawn goal as each sprite lands. Partial swaps
   are fine (sprite keeper + emoji ball works).
4. Scale via CSS `transform: scale()` or width/height on `.scene`, never by
   resampling the PNG (keeps pixels crisp with `image-rendering: pixelated`).
5. Timing check: total sprite animation ≤ `FEEDBACK_MS`. If a dive needs
   longer, bump the one constant.

## 5. Definition of done

- [ ] All four feedback states play a sprite animation inside `FEEDBACK_MS`
- [ ] Idle state has a keeper loop (no frozen frame)
- [ ] `prefers-reduced-motion` still disables animations
- [ ] No changes outside `PitchScene.tsx` / `PitchScene.css` / `assets/`
- [ ] Existing tests still pass untouched (they assert labels, not visuals)

## 6. Explicitly out of scope

- PixiJS / canvas rendering — only if CSS sprite sheets hit a wall (per
  Initial Plan §6 recommendation).
- Sound effects (future phase, pairs naturally with this work).
- New feedback states — the four cover every shootout outcome.
