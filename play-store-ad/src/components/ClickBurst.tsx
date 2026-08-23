import React from 'react';
import { COLOR } from '../theme';
import { stepped } from '../anim';

/**
 * The tap itself: six hard pixel ticks thrown off the point of contact, one
 * every 60 degrees, shrinking as they fly out. Stepped in four hard frames so
 * it snaps like the rest of the UI instead of easing.
 */

const ANGLES = [15, 75, 135, 195, 255, 315];

type Props = {
  frame: number;
  /** Frame the tap lands. */
  tap: number;
  /** Frames the burst takes to play out. */
  duration?: number;
  /** Pixel unit the tick geometry derives from. */
  unit?: number;
  style?: React.CSSProperties;
};

export const ClickBurst: React.FC<Props> = ({ frame, tap, duration = 10, unit = 4.4, style }) => {
  const t = stepped((frame - tap) / duration, 4);
  if (frame < tap || t >= 1) return null;

  return (
    <div style={{ position: 'absolute', pointerEvents: 'none', ...style }}>
      {ANGLES.map((angle) => (
        <div
          key={angle}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: unit * 6 * (1 - t),
            height: unit * 2,
            marginTop: -unit,
            background: COLOR.white,
            boxShadow: `0 0 0 ${unit / 2}px ${COLOR.ink}`,
            opacity: 1 - t,
            transformOrigin: '0 50%',
            transform: `rotate(${angle}deg) translateX(${unit * (3 + t * 12)}px)`,
          }}
        />
      ))}
    </div>
  );
};
