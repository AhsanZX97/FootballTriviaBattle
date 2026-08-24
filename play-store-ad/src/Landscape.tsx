import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Ad } from './Ad';

/**
 * 1920x1080 for the Play listing's promo video (a YouTube link — YouTube wants
 * 16:9). Same tree as the portrait cut, top to bottom: the scenes read the
 * composition size off `useStage()` and lay themselves out sideways, so this is
 * the identical 30 seconds rather than a second, differently-worded ad.
 */
export const Landscape: React.FC = () => (
  <AbsoluteFill style={{ background: '#04140b' }}>
    <Ad />
  </AbsoluteFill>
);
