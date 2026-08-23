import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Hook } from './scenes/Hook';
import { Question } from './scenes/Question';
import { Kick } from './scenes/Kick';
import { Online } from './scenes/Online';
import { Save } from './scenes/Save';
import { Cta } from './scenes/Cta';
import { CANVAS, TIMELINE, TOTAL_FRAMES } from './theme';

/** Where the ball is struck / hits, on the master timeline — the sound cues. */
const WHISTLE = TIMELINE.question.from; // kick-off blows as the question comes up
const KICK_STRIKE = TIMELINE.kick.from + 30;
const KICK_IMPACT = TIMELINE.kick.from + 51;
const SAVE_STRIKE = TIMELINE.save.from + 34;
const SAVE_STOP = TIMELINE.save.from + 49;
const SAVE_WIN = TIMELINE.save.from + 92;

/** A one-frame black beat on every cut, the way an arcade game wipes screens. */
const CutFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const boundaries = Object.values(TIMELINE)
    .map((s) => s.from)
    .filter((f) => f > 0);
  const near = boundaries.some((b) => frame >= b - 2 && frame < b);
  return near ? <AbsoluteFill style={{ background: '#000', opacity: 0.85 }} /> : null;
};

/**
 * The 30-second cut. Everything is authored at 1080x1920; the landscape
 * composition reuses this exact tree inside a framed panel.
 */
export const Ad: React.FC = () => (
  <AbsoluteFill
    style={{
      width: CANVAS.width,
      height: CANVAS.height,
      background: '#04140b',
      overflow: 'hidden',
      imageRendering: 'pixelated',
    }}
  >
    <Sequence from={TIMELINE.hook.from} durationInFrames={TIMELINE.hook.duration}>
      <Hook />
    </Sequence>
    <Sequence from={TIMELINE.question.from} durationInFrames={TIMELINE.question.duration}>
      <Question />
    </Sequence>
    <Sequence from={TIMELINE.kick.from} durationInFrames={TIMELINE.kick.duration}>
      <Kick />
    </Sequence>
    <Sequence from={TIMELINE.online.from} durationInFrames={TIMELINE.online.duration}>
      <Online />
    </Sequence>
    <Sequence from={TIMELINE.save.from} durationInFrames={TIMELINE.save.duration}>
      <Save />
    </Sequence>
    <Sequence from={TIMELINE.cta.from} durationInFrames={TIMELINE.cta.duration}>
      <Cta />
    </Sequence>

    <CutFlash />

    {/* --- audio, all of it the game's own --- */}
    <Audio
      src={staticFile('sounds/theme.mp3')}
      volume={(f) => (f > TOTAL_FRAMES - 45 ? Math.max(0, (TOTAL_FRAMES - f) / 45) * 0.26 : 0.26)}
    />
    <Sequence from={WHISTLE} durationInFrames={45}>
      <Audio src={staticFile('sounds/whistle.mp3')} volume={0.7} />
    </Sequence>
    <Sequence from={KICK_STRIKE} durationInFrames={30}>
      <Audio src={staticFile('sounds/kick.mp3')} volume={0.9} />
    </Sequence>
    <Sequence from={KICK_IMPACT} durationInFrames={30}>
      <Audio src={staticFile('sounds/net-ripple.ogg')} volume={0.9} />
    </Sequence>
    <Sequence from={KICK_IMPACT + 2} durationInFrames={45}>
      <Audio src={staticFile('sounds/cheer.mp3')} volume={0.55} />
    </Sequence>
    <Sequence from={SAVE_STRIKE} durationInFrames={30}>
      <Audio src={staticFile('sounds/kick.mp3')} volume={0.9} />
    </Sequence>
    <Sequence from={SAVE_STOP} durationInFrames={40}>
      <Audio src={staticFile('sounds/crowd-shocked.mp3')} volume={0.6} />
    </Sequence>
    <Sequence from={SAVE_WIN} durationInFrames={150}>
      <Audio src={staticFile('sounds/cheer.mp3')} volume={0.6} />
    </Sequence>
  </AbsoluteFill>
);
