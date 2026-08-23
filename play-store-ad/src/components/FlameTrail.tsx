import React from 'react';
import { random } from 'remotion';

/**
 * Pixel fire dragged behind the ball. Flat square puffs, no gradients and no
 * rounding — the palette steps white-hot -> gold -> orange -> ember the further
 * back it goes, and every puff re-rolls its jitter each frame so the fire
 * flickers instead of sliding.
 */

const PALETTE = ['#fff6c2', '#ffe066', '#ffb020', '#ff6a12', '#d92b0c'];

type Props = {
  /** Any integer that advances once per frame; seeds the flicker. */
  frame: number;
  /** Ball centre in canvas px. */
  x: number;
  y: number;
  /** Unit vector the ball is travelling along. */
  dir: [number, number];
  /** Ball width in px; the whole trail scales off it. */
  ball: number;
  /** 0 = out, 1 = full blaze. */
  intensity?: number;
  count?: number;
};

export const FlameTrail: React.FC<Props> = ({
  frame,
  x,
  y,
  dir,
  ball,
  intensity = 1,
  count = 8,
}) => {
  if (intensity <= 0) return null;

  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const back = (i + 1) / count;
        const flicker = random(`flame-${frame}-${i}`);
        const sway = (random(`sway-${frame}-${i}`) - 0.5) * ball * 1.1 * back;

        // Puffs sit progressively further down the tail, off to one side.
        const dist = ball * (0.45 + i * 0.62);
        const px = x - dir[0] * dist - dir[1] * sway;
        const py = y - dir[1] * dist + dir[0] * sway;

        const size = ball * (1.25 - back * 0.75) * (0.75 + flicker * 0.5);
        const shade = Math.min(PALETTE.length - 1, Math.floor(back * 4 + flicker * 1.2));

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: px,
              top: py,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              background: PALETTE[shade],
              opacity: (1 - back * 0.7) * intensity,
            }}
          />
        );
      })}
    </>
  );
};
