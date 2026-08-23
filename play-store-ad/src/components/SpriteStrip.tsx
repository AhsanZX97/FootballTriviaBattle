import React from 'react';
import { staticFile } from 'remotion';

type Props = {
  /** Path under public/, e.g. "sprites/ball.png". */
  src: string;
  /** Total frames packed left-to-right in the strip. */
  frames: number;
  /** Which frame to show; clamped into range. */
  index: number;
  width: number | string;
  height: number | string;
  style?: React.CSSProperties;
};

/**
 * One cell of a horizontal sprite sheet. Mirrors how the game does it in CSS
 * (background-size: <frames * 100>% 100%, position swept 0% -> 100%), just
 * driven by the render frame instead of a keyframe animation.
 */
export const SpriteStrip: React.FC<Props> = ({ src, frames, index, width, height, style }) => {
  const clamped = Math.max(0, Math.min(frames - 1, Math.floor(index)));
  const x = frames > 1 ? (clamped / (frames - 1)) * 100 : 0;
  return (
    <div
      style={{
        width,
        height,
        backgroundImage: `url(${staticFile(src)})`,
        backgroundSize: `${frames * 100}% 100%`,
        backgroundPosition: `${x}% 0`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
};

/** Looping helper: which cell a strip is on at `frame`, given a loop length. */
export const loopFrame = (frame: number, frames: number, loopDurationInFrames: number) =>
  Math.floor(((frame % loopDurationInFrames) / loopDurationInFrames) * frames);
