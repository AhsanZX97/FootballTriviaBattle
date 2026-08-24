import React from 'react';
import { AbsoluteFill, Easing, interpolate, staticFile } from 'remotion';
import { Stage, useStage } from '../theme';
import { GOLD, Headline } from './Headline';
import { SpriteGrid, SpriteStrip, loopFrame } from './SpriteStrip';
import { FlameTrail } from './FlameTrail';

/**
 * A frame-driven port of the game's PitchScene (src/features/match/components).
 * The actors are placed as percentages of a 16:9 "stage" sized exactly the way
 * `background-size: cover` sizes bg.jpg, so every coordinate below is the same
 * number the game's CSS uses — goal corner 39%/38%, penalty spot 50%/80%, and
 * so on.
 */

/**
 * The keepers, straight out of the game: the stock one and the shop's skins.
 * Each sheet came in its own shape, so every keeper carries its own cell
 * aspect and `scale` — the dive box is widened so the character renders at the
 * same native pixel scale as his own idle sheet and doesn't jump size when the
 * sheet swaps (the game's PitchScene.css does the identical sum: 1.184 = 94/134
 * for the stock keeper, 1.2523 = 402/321 for Green Wall).
 */
type KeeperArt = {
  idle: { src: string; cols: number; rows: number; frames: number; loop: number; aspect: number };
  dive: { src: string; frames: number; aspect: number; scale: number };
};

const KEEPERS: Record<'stock' | 'greenwall', KeeperArt> = {
  stock: {
    idle: { src: 'sprites/gk-idle-strip.png', cols: 16, rows: 1, frames: 16, loop: 48, aspect: 134 / 127 },
    dive: { src: 'sprites/gk-dive-strip.png', frames: 6, aspect: 94 / 83, scale: 1.184 },
  },
  // Green Wall (gk_green_wall, 200 coins). Idle is a 4x3 grid over 1.56s.
  greenwall: {
    idle: { src: 'sprites/gk-greenwall-idle.png', cols: 4, rows: 3, frames: 12, loop: 47, aspect: 321 / 311 },
    dive: { src: 'sprites/gk-greenwall-dive.png', frames: 6, aspect: 402 / 371, scale: 1.2523 },
  },
};

/** CSS `steps(n, end)`: hold each slice, then snap to the final value. */
const stepped = (t: number, n: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c >= 1 ? 1 : Math.floor(c * n) / n;
};

type Outcome = {
  ball: { to: [number, number]; frames: number; steps: number };
  keeper: { to: [number, number]; frames: number; steps: number; mirror: boolean };
  label: string;
};

const OUTCOMES: Record<'goal' | 'save', Outcome> = {
  // You score: ball into the top-left corner, keeper guesses right (dives the
  // other way) — the game's `.scene--goal.scene--goal-wrong-way`.
  goal: {
    ball: { to: [39, 38], frames: 21, steps: 7 },
    keeper: { to: [60, 52], frames: 21, steps: 7, mirror: false },
    label: 'GOAL!',
  },
  // You keep: the shot comes in low left and the keeper gets a glove on it —
  // `.scene--save`.
  save: {
    ball: { to: [39, 47], frames: 15, steps: 5 },
    keeper: { to: [40, 49], frames: 15, steps: 5, mirror: true },
    label: 'SAVED!',
  },
};

/** Where the ball sits at flight progress `p` (0 = spot, 1 = target), in canvas px.
 *  Smooth, unlike the stepped sprite — a camera tracking this never judders. */
export const ballAnchor = (stage: Stage, mode: 'goal' | 'save', p: number) => ({
  x: stage.x(interpolate(p, [0, 1], [50, OUTCOMES[mode].ball.to[0]])),
  y: stage.y(interpolate(p, [0, 1], [80, OUTCOMES[mode].ball.to[1]])),
});

type CameraOptions = {
  frame: number;
  stage: Stage;
  mode: 'goal' | 'save';
  /** Frame the ball is struck — the push-in starts here. */
  strike: number;
  /** Frame it arrives; the camera is at full zoom on it. */
  impact: number;
  /** Frames to hold the close shot after impact, then to pull back out. */
  hold?: number;
  out?: number;
  zoom?: number;
};

/**
 * A camera that rides the ball: it scales about the ball's position and dollies
 * that point to the middle of frame, so the shot fills the screen as it
 * arrives, then backs out for the HUD. Returns a style for a wrapper holding
 * the stadium and the pitch — keep text out of it, or the zoom bursts the frame.
 *
 * It tracks `ballAnchor`, the smooth position, not the stepped sprite: hopping
 * the origin in 7 hard steps would judder the whole world.
 */
export const ballCamera = ({
  frame,
  stage,
  mode,
  strike,
  impact,
  hold = 14,
  out = 20,
  zoom = 1.7,
}: CameraOptions): React.CSSProperties => {
  const keys = [strike, impact, impact + hold, impact + hold + out];
  const ease = {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  } as const;
  const scale = interpolate(frame, keys, [1, zoom, zoom, 1], ease);
  const pull = interpolate(frame, keys, [0, 1, 1, 0], ease);
  const track = interpolate(frame, [strike, impact], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const at = ballAnchor(stage, mode, track);

  return {
    transform: `translate(${(stage.width / 2 - at.x) * pull}px, ${(stage.height / 2 - at.y) * pull}px) scale(${scale})`,
    transformOrigin: `${at.x}px ${at.y}px`,
  };
};

type Props = {
  frame: number;
  mode: 'goal' | 'save';
  /** Frames the ball sits on the spot before it is struck. */
  suspense?: number;
  /** Set the shot on fire — pixel flames dragged behind the ball. */
  flames?: boolean;
  /** Which keeper mans the goal; 'greenwall' is the shop skin. */
  keeper?: keyof typeof KEEPERS;
  /** Render the GOAL!/SAVED! label. Off when a scene places it itself, e.g.
   *  outside a camera move that would blow it up with the pitch. */
  label?: boolean;
};

export const PitchScene: React.FC<Props> = ({
  frame,
  mode,
  suspense = 30,
  flames = false,
  label = true,
  keeper = 'stock',
}) => {
  const stage = useStage();
  const { x, y, keeperW: KEEPER_W, ballW: BALL_W } = stage;
  const o = OUTCOMES[mode];
  const t = frame - suspense; // 0 = the instant the ball leaves the foot
  const flying = t >= 0;

  // --- ball -----------------------------------------------------------------
  const ballP = flying ? stepped(t / o.ball.frames, o.ball.steps) : 0;
  const ballX = x(interpolate(ballP, [0, 1], [50, o.ball.to[0]]));
  const ballY = y(interpolate(ballP, [0, 1], [80, o.ball.to[1]]));
  // 4-frame spin, one full turn every 0.2s, only while the ball is in flight
  const spinIndex = loopFrame(Math.max(0, t), 4, 6);
  const spinning = flying && t < o.ball.frames;
  // Travel direction, from the spot to wherever this outcome sends the ball.
  const dx = x(o.ball.to[0]) - x(50);
  const dy = y(o.ball.to[1]) - y(80);
  const len = Math.hypot(dx, dy) || 1;
  // Fire catches over 3 frames, then gutters out in the 5 after the ball lands.
  const blaze = !flying
    ? 0
    : Math.min(1, (t + 1) / 3) * Math.max(0, 1 - Math.max(0, t - o.ball.frames) / 5);

  // --- keeper ---------------------------------------------------------------
  const diving = t >= 0;
  const art = KEEPERS[keeper];
  const diveW = KEEPER_W * art.dive.scale;
  const diveIndex = Math.min(art.dive.frames - 1, Math.floor(Math.max(0, t) / 3)); // over 0.6s
  const idleIndex = loopFrame(frame, art.idle.frames, art.idle.loop);
  const keeperP = diving ? stepped(t / o.keeper.frames, o.keeper.steps) : 0;
  const keeperX = x(interpolate(keeperP, [0, 1], [50, o.keeper.to[0]]));
  const keeperY = y(interpolate(keeperP, [0, 1], [51, o.keeper.to[1]]));

  const spriteShadow = 'drop-shadow(3px 3px 0 rgba(0, 0, 0, 0.6))';

  return (
    <AbsoluteFill style={{ overflow: 'hidden', imageRendering: 'pixelated' }}>
      {/* keeper */}
      <div
        style={{
          position: 'absolute',
          left: keeperX,
          top: keeperY,
          transform: `translate(-50%, -100%) scaleX(${o.keeper.mirror && diving ? -1 : 1})`,
          filter: spriteShadow,
        }}
      >
        {diving ? (
          <SpriteStrip
            src={art.dive.src}
            frames={art.dive.frames}
            index={diveIndex}
            width={diveW}
            height={diveW / art.dive.aspect}
          />
        ) : (
          <SpriteGrid
            src={art.idle.src}
            cols={art.idle.cols}
            rows={art.idle.rows}
            frames={art.idle.frames}
            index={idleIndex}
            width={KEEPER_W}
            height={KEEPER_W / art.idle.aspect}
          />
        )}
      </div>

      {flames && blaze > 0 && (
        <FlameTrail
          frame={frame}
          x={ballX}
          y={ballY}
          dir={[dx / len, dy / len]}
          ball={BALL_W}
          intensity={blaze}
        />
      )}

      {/* ball */}
      <div
        style={{
          position: 'absolute',
          left: ballX,
          top: ballY,
          transform: 'translate(-50%, -50%)',
          filter: spriteShadow,
        }}
      >
        {spinning ? (
          <SpriteStrip
            src="sprites/ball-spin-strip.png"
            frames={4}
            index={spinIndex}
            width={BALL_W}
            height={BALL_W}
          />
        ) : (
          <div
            style={{
              width: BALL_W,
              height: BALL_W,
              backgroundImage: `url(${staticFile('sprites/ball.png')})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
            }}
          />
        )}
      </div>

      {label && <OutcomeLabel frame={frame} mode={mode} suspense={suspense} />}
    </AbsoluteFill>
  );
};

type LabelProps = { frame: number; mode: 'goal' | 'save'; suspense?: number };

/** The GOAL!/SAVED! call, popped on the grass under the goal. */
export const OutcomeLabel: React.FC<LabelProps> = ({ frame, mode, suspense = 30 }) => {
  const { x, y, wide } = useStage();
  const labelT = frame - suspense - 18;
  const scale = labelT < 0 ? 0 : stepped(labelT / 9, 3);
  if (scale <= 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x(50),
        top: y(wide ? 62 : 58),
        transform: `translateX(-50%) scale(${scale})`,
      }}
    >
      <Headline size={wide ? 86 : 104} depth={16} outline={8} {...GOLD}>
        {OUTCOMES[mode].label}
      </Headline>
    </div>
  );
};
