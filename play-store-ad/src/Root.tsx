import React from 'react';
import { Composition } from 'remotion';
import './fonts';
import { Portrait } from './Portrait';
import { Landscape } from './Landscape';
import { FPS, TOTAL_FRAMES } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    {/* Google Ads app campaigns, Shorts, and anywhere vertical. */}
    <Composition
      id="Portrait"
      component={Portrait}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
    />
    {/* The Play listing's promo video is a YouTube link — that wants 16:9. */}
    <Composition
      id="Landscape"
      component={Landscape}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  </>
);
