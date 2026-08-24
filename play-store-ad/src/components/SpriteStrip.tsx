import React from 'react';
import { staticFile } from 'remotion';

type GridProps = {
  /** Path under public/, e.g. "sprites/ball.png". */
  src: string;
  /** Sheet shape. A horizontal strip is simply rows = 1. */
  cols: number;
  rows: number;
  /** Which cell to show, in reading order; clamped into range. */
  index: number;
  /** Cells actually packed, if the last row is short. Defaults to cols * rows. */
  frames?: number;
  width: number | string;
  height: number | string;
  style?: React.CSSProperties;
};

/**
 * One cell of a sprite sheet. Mirrors how the game does it in CSS
 * (background-size: <cols * 100>% <rows * 100>%, position swept to the cell),
 * just driven by the render frame instead of a keyframe animation.
 */
export const SpriteGrid: React.FC<GridProps> = ({
  src,
  cols,
  rows,
  index,
  frames,
  width,
  height,
  style,
}) => {
  const total = frames ?? cols * rows;
  const clamped = Math.max(0, Math.min(total - 1, Math.floor(index)));
  const col = clamped % cols;
  const row = Math.floor(clamped / cols);
  return (
    <div
      style={{
        width,
        height,
        backgroundImage: `url(${staticFile(src)})`,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${
          rows > 1 ? (row / (rows - 1)) * 100 : 0
        }%`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
};

type StripProps = Omit<GridProps, 'cols' | 'rows' | 'frames'> & {
  /** Total frames packed left-to-right in the strip. */
  frames: number;
};

/** A sheet that is one row tall — the common case. */
export const SpriteStrip: React.FC<StripProps> = ({ frames, ...rest }) => (
  <SpriteGrid cols={frames} rows={1} {...rest} />
);

/** Looping helper: which cell a sheet is on at `frame`, given a loop length. */
export const loopFrame = (frame: number, frames: number, loopDurationInFrames: number) =>
  Math.floor(((frame % loopDurationInFrames) / loopDurationInFrames) * frames);
