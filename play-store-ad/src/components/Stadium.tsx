import React from 'react';
import { AbsoluteFill, staticFile } from 'remotion';
import { COLOR } from '../theme';

type Props = {
  /** 1 = the game's own framing; >1 punches in. */
  scale?: number;
  /** 0 = full brightness (the pitch scene), 0.72 = the in-game UI dimmer. */
  dim?: number;
  /** Extra grade on the photo itself, e.g. 'saturate(1.2) contrast(1.05)'. */
  filter?: string;
  children?: React.ReactNode;
};

/**
 * The match background: bg.jpg cover-fitted, the same dark scrim the match
 * screen paints over it, plus CRT scanlines to sell the pixel look.
 */
export const Stadium: React.FC<Props> = ({ scale = 1, dim = 0.72, filter, children }) => (
  <AbsoluteFill style={{ background: COLOR.night, overflow: 'hidden' }}>
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile('bg.jpg')})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        imageRendering: 'pixelated',
        transform: `scale(${scale})`,
        filter,
      }}
    />
    <AbsoluteFill style={{ background: `rgba(2, 10, 6, ${dim})` }} />
    <AbsoluteFill
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, rgba(0,0,0,0.16) 0 2px, rgba(0,0,0,0) 2px 6px)',
        opacity: 0.7,
      }}
    />
    {children}
  </AbsoluteFill>
);
