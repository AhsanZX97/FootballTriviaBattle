import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Stadium } from '../components/Stadium';
import { Panel, PixelText } from '../components/Pixel';
import { GOLD, HeadlineLines, Plate } from '../components/Headline';
import { PopIn } from '../components/PopIn';

const CHIPS = ['NO SIGN-UP NEEDED', 'NO ADS MID-MATCH', 'FREE TO PLAY'];

/** Closing card: the icon, the name, the promises, the ask. */
export const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoIn = spring({
    frame: frame - 2,
    fps,
    config: { damping: 10, mass: 0.8, stiffness: 120 },
  });
  const logoScale = interpolate(logoIn, [0, 1], [0.2, 1]);

  // The button breathes so the end card never sits completely still.
  const pulse = 1 + Math.sin((frame / fps) * 4) * 0.02;

  return (
    <AbsoluteFill>
      <Stadium scale={1.1} dim={0.86} />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 52,
          padding: '0 70px',
        }}
      >
        <img
          src={staticFile('logo.png')}
          width={420}
          height={420}
          style={{
            imageRendering: 'pixelated',
            transform: `scale(${logoScale})`,
            filter: 'drop-shadow(10px 10px 0 rgba(0,0,0,0.6))',
          }}
        />

        <PopIn frame={frame} delay={16}>
          <HeadlineLines
            lines={['FOOTBALL QUIZ', 'TRIVIA BATTLE']}
            size={58}
            preset={GOLD}
            depth={12}
            outline={7}
            gap={24}
          />
        </PopIn>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
          {CHIPS.map((chip, i) => (
            <PopIn key={chip} frame={frame} delay={30 + i * 8} duration={6}>
              <Panel padding="20px 32px" spread={4} style={{ background: '#0d2c1b' }}>
                <PixelText size={26} shadow={0} letterSpacing="0.1em">
                  {chip}
                </PixelText>
              </Panel>
            </PopIn>
          ))}
        </div>

        {/* same plate as the hook's PROVE IT., so the ad opens and closes
            on the same button */}
        <PopIn frame={frame} delay={62}>
          <div style={{ transform: `scale(${pulse})` }}>
            <Plate size={30}>PLAY FREE ON GOOGLE PLAY</Plate>
          </div>
        </PopIn>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
