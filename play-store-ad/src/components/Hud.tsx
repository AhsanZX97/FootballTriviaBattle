import React from 'react';
import { staticFile } from 'remotion';
import { COLOR, FONT, panelShadow, useStage } from '../theme';
import { PixelText } from './Pixel';
import { GOLD, HeadlineLines } from './Headline';

/** One kick slot on the scoreboard: a ball once taken and scored, a dot until then. */
const Dots: React.FC<{ scored: number; taken: number; size?: number }> = ({
  scored,
  taken,
  size = 26,
}) => (
  <div style={{ display: 'flex', gap: size * 0.38, alignItems: 'center', height: size + 2 }}>
    {Array.from({ length: 5 }, (_, i) => {
      if (i < scored) {
        return (
          <img
            key={i}
            src={staticFile('sprites/ball.png')}
            width={size}
            height={size}
            style={{ imageRendering: 'pixelated', display: 'block' }}
          />
        );
      }
      return (
        <div
          key={i}
          style={{
            width: size,
            textAlign: 'center',
            fontFamily: FONT,
            fontSize: size * 0.85,
            color: i < taken ? COLOR.red : COLOR.white,
            opacity: i < taken ? 1 : 0.85,
          }}
        >
          {i < taken ? 'x' : '·'}
        </div>
      );
    })}
  </div>
);

type ScoreboardProps = {
  you: { score: number; taken: number };
  cpu: { score: number; taken: number };
  opponentName?: string;
  /** 1 = resting, >1 = the score-pop the game plays when a kick goes in. */
  youPop?: number;
};

export const Scoreboard: React.FC<ScoreboardProps> = ({
  you,
  cpu,
  opponentName = 'CPU',
  youPop = 1,
}) => {
  const { wide } = useStage();
  // Height is the scarce axis at 16:9, so the wide cut builds the board a size
  // down rather than scaling it — a transform would leave an empty box behind.
  const t = wide
    ? { gap: 70, padding: '26px 42px', label: 22, score: 58, dot: 20, dash: 34, stack: 12 }
    : { gap: 96, padding: '36px 54px', label: 26, score: 78, dot: 26, dash: 46, stack: 18 };
  return (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: t.gap,
      padding: t.padding,
      background: COLOR.panel,
      boxShadow: panelShadow(6),
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: t.stack }}>
      <PixelText size={t.label} color={COLOR.yellow} shadow={0}>
        YOU
      </PixelText>
      <PixelText
        size={t.score}
        shadow={5}
        style={{ transform: `scale(${youPop})`, color: youPop > 1.05 ? COLOR.yellow : COLOR.white }}
      >
        {you.score}
      </PixelText>
      <Dots scored={you.score} taken={you.taken} size={t.dot} />
    </div>

    <PixelText size={t.dash} shadow={4} style={{ alignSelf: 'center' }}>
      –
    </PixelText>

    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: t.stack }}>
      <PixelText size={t.label} color={COLOR.yellow} shadow={0}>
        {opponentName}
      </PixelText>
      <PixelText size={t.score} shadow={5}>
        {cpu.score}
      </PixelText>
      <Dots scored={cpu.score} taken={cpu.taken} size={t.dot} />
    </div>
  </div>
  );
};

/** "⚽ YOU'RE SHOOTING" — the stage line under the scoreboard. */
export const StatusLine: React.FC<{ icon: 'ball' | 'glove'; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
    <img
      src={staticFile(icon === 'ball' ? 'sprites/ball.png' : 'sprites/glove.png')}
      width={34}
      height={34}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
    <PixelText size={30} color={COLOR.yellow} shadow={3} letterSpacing="0.1em">
      {children}
    </PixelText>
  </div>
);

/** The answer clock: seconds remaining plus a draining bar. */
export const TimerBar: React.FC<{ seconds: number; progress: number }> = ({
  seconds,
  progress,
}) => {
  const low = seconds <= 3;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%' }}>
      <PixelText
        size={36}
        shadow={3}
        color={low ? COLOR.red : COLOR.white}
        align="right"
        style={{ minWidth: 60 }}
      >
        {seconds}
      </PixelText>
      <div
        style={{
          flex: 1,
          height: 30,
          background: COLOR.panel,
          boxShadow: `0 0 0 5px ${COLOR.ink}`,
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
            height: '100%',
            background: low ? COLOR.red : COLOR.yellow,
          }}
        />
      </div>
    </div>
  );
};

/** The strip along the bottom, set in the same gold poster type as the hook. */
export const CaptionBar: React.FC<{ lines: string[]; size?: number }> = ({ lines, size }) => {
  const { wide } = useStage();
  // The wide cut has the room to run the caption as one line, and needs the
  // height back; the portrait cut stacks it.
  const shown = wide ? [lines.join(' ')] : lines;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: wide ? '26px 40px 34px' : '44px 40px 58px',
        background: 'rgba(6, 22, 13, 0.95)',
        borderTop: `6px solid ${COLOR.yellow}`,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <HeadlineLines
        lines={shown}
        size={size ?? (wide ? 40 : 46)}
        preset={GOLD}
        depth={10}
        outline={6}
        gap={22}
      />
    </div>
  );
};
