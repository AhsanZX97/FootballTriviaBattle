import { random } from 'remotion';

/** CSS `steps(n, end)`: hold each slice, then snap to the final value. */
export const stepped = (t: number, n: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c >= 1 ? 1 : Math.floor(c * n) / n;
};

/**
 * The game's pop-in: scale 0 -> 1 in a handful of hard steps, never a smooth
 * ease. Returns 0 before `delay`, 1 once it has played out.
 */
export const popScale = (frame: number, delay: number, duration = 9, steps = 3) =>
  stepped((frame - delay) / duration, steps);

/** Fade that snaps in the same stepped way, for text that must not blur in. */
export const popOpacity = (frame: number, delay: number, duration = 6, steps = 3) =>
  stepped((frame - delay) / duration, steps);

/** Camera shake for impacts — deterministic, so renders are reproducible. */
export const shake = (frame: number, start: number, duration: number, amplitude: number) => {
  const t = frame - start;
  if (t < 0 || t > duration) return { x: 0, y: 0 };
  const decay = 1 - t / duration;
  return {
    x: (random(`sx${frame}`) - 0.5) * 2 * amplitude * decay,
    y: (random(`sy${frame}`) - 0.5) * 2 * amplitude * decay,
  };
};
