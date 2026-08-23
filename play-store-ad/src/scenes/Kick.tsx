import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Stadium } from '../components/Stadium';
import { OutcomeLabel, PitchScene, ballCamera } from '../components/PitchScene';
import { CaptionBar, Scoreboard } from '../components/Hud';
import { PopIn } from '../components/PopIn';
import { shake, stepped } from '../anim';

const SUSPENSE = 30; // frames the ball sits on the spot before the strike
const IMPACT = SUSPENSE + 21; // the ball hits the net

/** The reward half of a kick: right answer, penalty, back of the net. */
export const Kick: React.FC = () => {
  const frame = useCurrentFrame();

  // The match screen lifts its dark scrim the moment the scene takes over.
  const dim = interpolate(frame, [0, 8], [0.5, 0], { extrapolateRight: 'clamp' });
  const kickShake = shake(frame, IMPACT, 14, 16);

  // Short hold and a quick pull-out: the goal reads, then the scene cuts.
  const camera = ballCamera({ frame, mode: 'goal', strike: SUSPENSE, impact: IMPACT, hold: 10, out: 16 });

  const scored = frame >= IMPACT + 3;
  const pop = scored ? 1 + (1 - stepped((frame - IMPACT - 3) / 9, 3)) * 0.5 : 1;

  return (
    <AbsoluteFill
      style={{ transform: `translate(${kickShake.x}px, ${kickShake.y}px)`, overflow: 'hidden' }}
    >
      <AbsoluteFill style={camera}>
        <Stadium dim={dim} />
        <PitchScene frame={frame} mode="goal" suspense={SUSPENSE} flames label={false} />
      </AbsoluteFill>

      {/* the call stays out of the camera move — zoomed it would burst the frame */}
      <OutcomeLabel frame={frame} mode="goal" suspense={SUSPENSE} />

      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 80 }}>
        <PopIn frame={frame} delay={0} rise={-30}>
          <Scoreboard
            you={{ score: scored ? 1 : 0, taken: scored ? 1 : 0 }}
            cpu={{ score: 0, taken: 0 }}
            youPop={pop}
          />
        </PopIn>
      </AbsoluteFill>

      <CaptionBar lines={['ANSWER RIGHT.', 'BURY THE PENALTY.']} />
    </AbsoluteFill>
  );
};
