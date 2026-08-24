import React from 'react';
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Stadium } from '../components/Stadium';
import { OutcomeLabel, PitchScene, ballCamera } from '../components/PitchScene';
import { CaptionBar, Scoreboard, StatusLine } from '../components/Hud';
import { Panel } from '../components/Pixel';
import { GOLD, Headline, SILVER } from '../components/Headline';
import { PopIn } from '../components/PopIn';
import { shake } from '../anim';
import { useStage } from '../theme';

const SUSPENSE = 34;
const IMPACT = SUSPENSE + 15; // the keeper's glove reaches the ball
const WIN = 92;

/** Sudden death, the other side of the ball: you are the keeper. */
export const Save: React.FC = () => {
  const frame = useCurrentFrame();
  const stage = useStage();

  const dim = interpolate(frame, [0, 8], [0.5, 0], { extrapolateRight: 'clamp' });
  const hit = shake(frame, IMPACT, 12, 12);

  const camera = ballCamera({ frame, stage, mode: 'save', strike: SUSPENSE, impact: IMPACT });
  const won = frame >= WIN;

  return (
    <AbsoluteFill
      style={{ transform: `translate(${hit.x}px, ${hit.y}px)`, overflow: 'hidden' }}
    >
      <AbsoluteFill style={camera}>
        <Stadium dim={dim} />
        <PitchScene
          frame={frame}
          mode="save"
          suspense={SUSPENSE}
          flames
          label={false}
          keeper="greenwall"
        />
      </AbsoluteFill>

      {/* the call stays out of the camera move — zoomed it would burst the frame */}
      <OutcomeLabel frame={frame} mode="save" suspense={SUSPENSE} />

      <AbsoluteFill
        style={{ alignItems: 'center', paddingTop: stage.wide ? 30 : 80, gap: stage.wide ? 18 : 30 }}
      >
        <PopIn frame={frame} delay={0} rise={-30}>
          <Scoreboard
            you={{ score: 4, taken: 5 }}
            cpu={{ score: 4, taken: 5 }}
            opponentName="P_2481"
          />
        </PopIn>

        <PopIn frame={frame} delay={2}>
          <Headline size={32} depth={7} outline={5} letterSpacing="0.1em" {...SILVER}>
            SUDDEN DEATH
          </Headline>
        </PopIn>

        <PopIn frame={frame} delay={6}>
          <StatusLine icon="glove">YOU'RE IN GOAL</StatusLine>
        </PopIn>
      </AbsoluteFill>

      {won && (
        <AbsoluteFill
          style={{
            alignItems: 'center',
            // Portrait has room above SAVED!; at 16:9 the goalmouth is there,
            // so the win lands under the call instead, just over the caption.
            justifyContent: stage.wide ? 'flex-end' : 'center',
            paddingBottom: stage.wide ? 152 : 200,
          }}
        >
          <PopIn frame={frame} delay={WIN}>
            <Panel
              padding={stage.wide ? '30px 56px' : '44px 72px'}
              style={{ display: 'flex', alignItems: 'center', gap: stage.wide ? 26 : 32 }}
            >
              <img
                src={staticFile('sprites/trophy.png')}
                width={stage.wide ? 76 : 92}
                height={stage.wide ? 73 : 88}
                style={{ imageRendering: 'pixelated', display: 'block' }}
              />
              <Headline size={stage.wide ? 52 : 64} depth={12} outline={7} {...GOLD}>
                YOU WIN!
              </Headline>
            </Panel>
          </PopIn>
        </AbsoluteFill>
      )}

      <CaptionBar
        lines={won ? ['WIN IT.', 'THEN REMATCH.'] : ['SAVE IT. THE', 'GAME IS YOURS.']}
      />
    </AbsoluteFill>
  );
};
