import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stadium } from '../components/Stadium';
import { GOLD, Headline, Plate, SILVER, Sparks } from '../components/Headline';
import { PopIn } from '../components/PopIn';
import { SpriteStrip, loopFrame } from '../components/SpriteStrip';
import { shake } from '../anim';

/**
 * Opening hook, styled as an arcade poster: the ball drops, the headline pair
 * lands, a beat, then the challenge.
 */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const zoom = interpolate(frame, [0, 105], [1.16, 1.02], { extrapolateRight: 'clamp' });
  // Brighter than the in-game screens — this is a poster, not the HUD.
  const dim = interpolate(frame, [0, 24], [0.66, 0.47], { extrapolateRight: 'clamp' });

  const drop = spring({
    frame: frame - 4,
    fps,
    config: { damping: 8, mass: 0.7, stiffness: 130 },
  });
  const ballY = interpolate(drop, [0, 1], [-520, 0]);
  const landed = drop > 0.85;
  const bump = shake(frame, 22, 8, 9);

  return (
    <AbsoluteFill>
      <Stadium scale={zoom} dim={dim} filter="saturate(1.18) contrast(1.06)" />

      {/* one soft vignette, nothing banded — an even wash keeps the keyline
          doing the work of separating type from the net */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 46%, rgba(2,8,4,0.42) 100%)',
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translate(${bump.x}px, ${bump.y}px)`,
        }}
      >
        <div style={{ transform: `translateY(${ballY}px)`, marginBottom: 110 }}>
          <SpriteStrip
            src="sprites/ball-spin-strip.png"
            frames={4}
            index={loopFrame(frame, 4, landed ? 12 : 5)}
            width={186}
            height={186}
            style={{
              filter: [
                'drop-shadow(4px 0 0 #0a0a0a)',
                'drop-shadow(-4px 0 0 #0a0a0a)',
                'drop-shadow(0 4px 0 #0a0a0a)',
                'drop-shadow(0 -4px 0 #0a0a0a)',
                'drop-shadow(8px 12px 0 rgba(0,0,0,0.45))',
              ].join(' '),
            }}
          />
        </div>

        <PopIn frame={frame} delay={26} rise={-50} style={{ marginBottom: 58 }}>
          <Headline
            size={58}
            letterSpacing="0.03em"
            depth={9}
            outline={7}
            {...SILVER}
          >
            THINK YOU KNOW
          </Headline>
        </PopIn>

        <PopIn frame={frame} delay={36} rise={-50} style={{ marginBottom: 130 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <Headline
              size={92}
              depth={16}
              outline={8}
              {...GOLD}
            >
              FOOTBALL?
            </Headline>
            <Sparks side="left" scale={0.72} />
            <Sparks side="right" scale={0.72} />
          </div>
        </PopIn>

        <PopIn frame={frame} delay={62} rise={-36}>
          <Plate size={44}>PROVE IT.</Plate>
        </PopIn>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
