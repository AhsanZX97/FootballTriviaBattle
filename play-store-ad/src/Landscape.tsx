import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { Ad } from './Ad';
import { PixelText } from './components/Pixel';
import { PopIn } from './components/PopIn';
import { CANVAS, COLOR, TIMELINE } from './theme';

const FRAME_H = 960;
const SCALE = FRAME_H / CANVAS.height;
const FRAME_W = CANVAS.width * SCALE;

/** The line that runs alongside the phone, changing with the scene. */
const HEADLINES: { from: number; text: React.ReactNode }[] = [
  { from: TIMELINE.hook.from, text: <>THINK YOU KNOW FOOTBALL?</> },
  { from: TIMELINE.question.from, text: <>ANSWER FAST OR MISS YOUR SHOT</> },
  { from: TIMELINE.kick.from, text: <>EVERY RIGHT ANSWER IS A PENALTY</> },
  { from: TIMELINE.online.from, text: <>LIVE 1V1 vs REAL PLAYERS</> },
  { from: TIMELINE.save.from, text: <>SUDDEN DEATH DECIDES IT</> },
  { from: TIMELINE.cta.from, text: <>PLAY FREE ON GOOGLE PLAY</> },
];

const CHIPS = ['NO SIGN-UP', 'NO ADS MID-MATCH', 'FREE TO PLAY'];

/** 1920x1080 for the store listing / YouTube: the phone cut, framed and captioned. */
export const Landscape: React.FC = () => {
  const frame = useCurrentFrame();
  const current = HEADLINES.filter((h) => frame >= h.from).pop() ?? HEADLINES[0];

  return (
    <AbsoluteFill style={{ background: COLOR.night, overflow: 'hidden' }}>
      {/* stadium wash behind everything */}
      <AbsoluteFill
        style={{
          backgroundImage: `url(${staticFile('bg.jpg')})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(14px) saturate(0.85)',
          transform: 'scale(1.12)',
        }}
      />
      <AbsoluteFill style={{ background: 'rgba(2, 10, 6, 0.86)' }} />
      <AbsoluteFill
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(0,0,0,0.2) 0 2px, rgba(0,0,0,0) 2px 6px)',
        }}
      />

      {/* left: the pitch of the message */}
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 0,
          width: 1000,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 44,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <img
            src={staticFile('logo.png')}
            width={132}
            height={132}
            style={{ imageRendering: 'pixelated', display: 'block' }}
          />
          <PixelText size={34} color={COLOR.yellow} shadow={4} align="left" lineHeight={1.6}>
            FOOTBALL QUIZ
            <br />
            TRIVIA BATTLE
          </PixelText>
        </div>

        {/* keyed so each scene's line pops in fresh */}
        <PopIn key={current.from} frame={frame} delay={current.from} rise={26}>
          <PixelText size={54} shadow={7} align="left" lineHeight={1.55}>
            {current.text}
          </PixelText>
        </PopIn>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {CHIPS.map((chip) => (
            <div
              key={chip}
              style={{
                padding: '16px 24px',
                background: '#0d2c1b',
                boxShadow: `0 0 0 4px ${COLOR.ink}, 5px 5px 0 4px ${COLOR.shadow}`,
              }}
            >
              <PixelText size={20} shadow={0} letterSpacing="0.1em">
                {chip}
              </PixelText>
            </div>
          ))}
        </div>

        {/* the ask stays on screen for the whole 30s in this cut */}
        <div
          style={{
            alignSelf: 'flex-start',
            padding: '26px 40px',
            background: COLOR.yellow,
            transform: `scale(${1 + Math.sin((frame / 30) * 4) * 0.015})`,
            boxShadow: [
              'inset 5px 5px 0 0 rgba(255, 255, 255, 0.55)',
              'inset -5px -5px 0 0 rgba(0, 0, 0, 0.45)',
              `0 0 0 4px ${COLOR.ink}`,
              `7px 7px 0 4px ${COLOR.shadow}`,
            ].join(', '),
          }}
        >
          <PixelText
            size={26}
            color="#1a1206"
            shadow={0}
            letterSpacing="0.08em"
            style={{ whiteSpace: 'nowrap' }}
          >
            PLAY FREE ON GOOGLE PLAY
          </PixelText>
        </div>
      </div>

      {/* right: the phone cut, in the game's chunky frame */}
      <div
        style={{
          position: 'absolute',
          right: 150,
          top: (1080 - FRAME_H) / 2,
          width: FRAME_W,
          height: FRAME_H,
          background: COLOR.ink,
          boxShadow: `0 0 0 10px ${COLOR.white}, 0 0 0 16px ${COLOR.ink}, 18px 18px 0 16px rgba(0,0,0,0.85)`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: CANVAS.width,
            height: CANVAS.height,
            transform: `scale(${SCALE})`,
            transformOrigin: 'top left',
          }}
        >
          <Ad />
        </div>
      </div>
    </AbsoluteFill>
  );
};
