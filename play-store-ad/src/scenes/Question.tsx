import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Stadium } from '../components/Stadium';
import { CaptionBar, Scoreboard, StatusLine, TimerBar } from '../components/Hud';
import { Panel, PixelButton, PixelText } from '../components/Pixel';
import { GREEN, Headline } from '../components/Headline';
import { PopIn } from '../components/PopIn';
import { ClickBurst } from '../components/ClickBurst';
import { COLOR, useStage } from '../theme';
import { popOpacity } from '../anim';

const PROMPT = 'Pelé won his third World Cup with Brazil in which year?';
const ANSWERS = ['1974', '1970', '1966', '1962'];
const CORRECT = 1;

/** Frames, local to this scene. */
const TAP = 62;
const RELEASE = 70;
const TOTAL_SECONDS = 8;

/** The trivia half of a kick: clock running, four options, one tap. */
export const Question: React.FC = () => {
  const frame = useCurrentFrame();
  const { wide } = useStage();

  const answered = frame >= RELEASE;
  const clockFrame = Math.min(frame, RELEASE);
  const remaining = Math.max(0, TOTAL_SECONDS - Math.floor(clockFrame / 30));
  const progress = 1 - clockFrame / (TOTAL_SECONDS * 30);

  const press = frame >= TAP && frame < RELEASE ? 1 : 0;
  const flash = frame >= RELEASE ? Math.max(0, 1 - (frame - RELEASE) / 8) * 0.55 : 0;

  return (
    <AbsoluteFill>
      <Stadium scale={1.02} dim={0.74} />

      <AbsoluteFill
        style={{
          // 16:9 sets the board and the clock beside the question instead of
          // stacking them — the same pieces, turned on their side.
          padding: wide ? '40px 110px 150px' : '80px 60px 300px',
          display: 'flex',
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: wide ? 80 : 42,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: wide ? 30 : 42,
            width: wide ? 620 : '100%',
          }}
        >
          <PopIn frame={frame} delay={0} rise={-30}>
            <Scoreboard you={{ score: 0, taken: 0 }} cpu={{ score: 0, taken: 0 }} />
          </PopIn>

          <PopIn frame={frame} delay={4}>
            <StatusLine icon="ball">YOU'RE SHOOTING</StatusLine>
          </PopIn>

          <div style={{ width: '100%', opacity: popOpacity(frame, 6) }}>
            <TimerBar seconds={remaining} progress={progress} />
          </div>

          {/* the call lands under the clock in the wide cut, where the
              question column has no room left under the buttons */}
          {wide && answered && (
            <PopIn frame={frame} delay={RELEASE + 2}>
              <Headline size={48} depth={10} outline={6} {...GREEN}>
                CORRECT!
              </Headline>
            </PopIn>
          )}
        </div>

        <div
          style={{
            width: wide ? 940 : '100%',
            opacity: popOpacity(frame, 8),
            transform: `translateY(${(1 - popOpacity(frame, 8, 10)) * 60}px)`,
          }}
        >
          <Panel padding={48} style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
            <PixelText size={34} align="left" lineHeight={1.75} shadow={0}>
              {PROMPT}
            </PixelText>

            <div
              style={{
                display: 'grid',
                gap: 26,
                gridTemplateColumns: wide ? '1fr 1fr' : '1fr',
              }}
            >
              {ANSWERS.map((answer, i) => {
                const isCorrect = i === CORRECT;
                const dimmed = answered && !isCorrect;
                return (
                  <div key={answer} style={{ position: 'relative' }}>
                    <PixelButton
                      size={30}
                      press={isCorrect ? press : 0}
                      background={
                        answered && isCorrect ? COLOR.green : dimmed ? '#8a7a2e' : COLOR.yellow
                      }
                      color={answered && isCorrect ? '#04140b' : '#1a1206'}
                      style={{ opacity: dimmed ? 0.45 : 1 }}
                    >
                      {answer}
                    </PixelButton>

                    {/* the tap itself, thrown off the button */}
                    {isCorrect && <ClickBurst frame={frame} tap={TAP} style={{ left: '50%', top: '50%' }} />}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        {!wide && answered && (
          <PopIn frame={frame} delay={RELEASE + 2}>
            <Headline size={46} depth={10} outline={6} {...GREEN}>
              CORRECT!
            </Headline>
          </PopIn>
        )}
      </AbsoluteFill>

      <AbsoluteFill style={{ background: COLOR.white, opacity: flash, pointerEvents: 'none' }} />

      <CaptionBar lines={['ANSWER FAST OR', 'MISS YOUR SHOT']} />
    </AbsoluteFill>
  );
};
