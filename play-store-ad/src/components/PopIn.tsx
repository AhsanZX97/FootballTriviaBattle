import React from 'react';
import { popScale } from '../anim';

type Props = {
  frame: number;
  delay: number;
  duration?: number;
  steps?: number;
  /** Also slide up into place while popping. */
  rise?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

/** Wraps children in the game's stepped scale-up entrance. */
export const PopIn: React.FC<Props> = ({
  frame,
  delay,
  duration = 9,
  steps = 3,
  rise = 0,
  children,
  style,
}) => {
  // Scale to 0 rather than unmounting: an absent box would let the parent
  // column re-centre every time a line pops in, and the whole stack would jump.
  const p = popScale(frame, delay, duration, steps);
  return (
    <div
      style={{
        transform: `translateY(${(1 - p) * rise}px) scale(${p})`,
        transformOrigin: 'center',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
