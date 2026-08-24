import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Stadium } from '../components/Stadium';
import { CaptionBar } from '../components/Hud';
import { Panel, PixelText } from '../components/Pixel';
import { GOLD, Headline, SILVER } from '../components/Headline';
import { PopIn } from '../components/PopIn';
import { SpriteStrip, loopFrame } from '../components/SpriteStrip';
import { COLOR, useStage } from '../theme';
import { shake, stepped } from '../anim';

const SLAM = 46; // the frame the two cards meet in the middle

const PlayerCard: React.FC<{ name: string; label: string; highlight?: boolean }> = ({
  name,
  label,
  highlight,
}) => (
  <Panel
    padding={36}
    style={{
      width: 400,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 20,
      background: highlight ? '#123a22' : COLOR.panel,
    }}
  >
    <PixelText size={22} color={COLOR.yellow} shadow={0} letterSpacing="0.14em">
      {label}
    </PixelText>
    <PixelText size={30} shadow={3}>
      {name}
    </PixelText>
  </Panel>
);

/** Quick match: the pairing that makes every game a live head-to-head. */
export const Online: React.FC = () => {
  const frame = useCurrentFrame();
  const { wide } = useStage();

  const slide = stepped(frame / SLAM, 6);
  const left = interpolate(slide, [0, 1], [-700, 0]);
  const right = interpolate(slide, [0, 1], [700, 0]);
  const met = frame >= SLAM;
  const slam = shake(frame, SLAM, 10, 12);

  return (
    <AbsoluteFill>
      <Stadium scale={1.06} dim={0.78} />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: wide ? 46 : 68,
          paddingBottom: wide ? 120 : 90,
          transform: `translate(${slam.x}px, ${slam.y}px)`,
        }}
      >
        <PopIn frame={frame} delay={0}>
          <Headline size={38} depth={8} outline={6} letterSpacing="0.06em" {...SILVER}>
            {met ? 'OPPONENT FOUND' : 'QUICK MATCH...'}
          </Headline>
        </PopIn>

        <div style={{ display: 'flex', alignItems: 'center', gap: wide ? 64 : 40 }}>
          <div style={{ transform: `translateX(${left}px)` }}>
            <PlayerCard label="YOU" name="READY" highlight />
          </div>

          <PopIn frame={frame} delay={SLAM} duration={6}>
            <Headline size={62} depth={12} outline={7} {...GOLD}>
              VS
            </Headline>
          </PopIn>

          <div style={{ transform: `translateX(${right}px)` }}>
            <PlayerCard label="OPPONENT" name={met ? 'PLAYER_2481' : '?????'} />
          </div>
        </div>

        <PopIn frame={frame} delay={SLAM + 10}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <SpriteStrip
              src="sprites/ball-spin-strip.png"
              frames={4}
              index={loopFrame(frame, 4, 8)}
              width={48}
              height={48}
            />
            <PixelText size={26} shadow={3} letterSpacing="0.1em">
              MATCHED IN SECONDS
            </PixelText>
          </div>
        </PopIn>
      </AbsoluteFill>

      <CaptionBar lines={['REAL PLAYERS.', 'REAL TIME.']} />
    </AbsoluteFill>
  );
};
