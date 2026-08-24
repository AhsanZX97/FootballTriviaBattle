import { useMemo } from 'react';
import { useVideoConfig } from 'remotion';

/**
 * Palette and layout constants lifted straight from the game so the ad and the
 * app read as the same product. Colours come from MatchScreen.css /
 * PitchScene.css; the geometry constants mirror the .scene__stage maths.
 */

export const COLOR = {
  yellow: '#ffcf1a',
  yellowHi: '#fff04a',
  panel: '#0a2416',
  ink: '#0a0a0a',
  night: '#04140b',
  white: '#ffffff',
  red: '#ff4a4a',
  green: '#3fbf5a',
  shadow: 'rgba(0, 0, 0, 0.85)',
} as const;

export const FONT = "'Press Start 2P', ui-monospace, Consolas, monospace";

/** Design canvas. Every scene is authored at this size; the landscape
 *  composition scales the whole thing down and frames it. */
export const CANVAS = { width: 1080, height: 1920 } as const;

export const FPS = 30;

/** The chunky offset-block shadow the game puts under every panel. */
export const panelShadow = (spread = 4) =>
  `0 0 0 ${spread}px ${COLOR.ink}, ${spread + 2}px ${spread + 2}px 0 ${spread}px ${COLOR.shadow}`;

/**
 * Scene lengths, in frames at 30 fps. This is the only place timing lives —
 * `TIMELINE` derives every start frame from the order below, so stretching one
 * scene shifts the rest instead of needing six numbers kept in sync by hand.
 */
const ORDER = ['hook', 'question', 'kick', 'online', 'save', 'cta'] as const;

export type SceneId = (typeof ORDER)[number];

const DURATION: Record<SceneId, number> = {
  hook: 105,
  question: 120,
  kick: 100,
  online: 120,
  save: 150,
  cta: 195,
};

export const TIMELINE = ORDER.reduce(
  (acc, id) => {
    acc.map[id] = { from: acc.at, duration: DURATION[id] };
    acc.at += DURATION[id];
    return acc;
  },
  { at: 0, map: {} as Record<SceneId, { from: number; duration: number }> },
).map;

export const TOTAL_FRAMES = ORDER.reduce((n, id) => n + DURATION[id], 0);

/**
 * The 16:9 "stage" every pitch coordinate is measured against, sized exactly
 * the way `background-size: cover` sizes bg.jpg into the frame — so the same
 * percentages the game's CSS uses land in the same place at any aspect ratio.
 * In portrait the stage overflows the sides (the crop the game shows on a
 * phone); at 16:9 it is the frame itself.
 */
export type Stage = {
  width: number;
  height: number;
  /** True for the 1920x1080 cut; scenes lay themselves out sideways. */
  wide: boolean;
  x: (pct: number) => number;
  y: (pct: number) => number;
  /** --keeper-w: 4.9% of the stage. Everything on the pitch derives from it. */
  keeperW: number;
  ballW: number;
};

export const makeStage = (width: number, height: number): Stage => {
  const w = Math.max(width, (height * 16) / 9);
  const h = (w * 9) / 16;
  const left = (width - w) / 2;
  const top = (height - h) / 2;
  const keeperW = w * 0.049;
  return {
    width,
    height,
    wide: width > height,
    x: (pct) => left + (pct / 100) * w,
    y: (pct) => top + (pct / 100) * h,
    keeperW,
    ballW: keeperW * 0.45,
  };
};

/** `makeStage` for the composition currently rendering. */
export const useStage = (): Stage => {
  const { width, height } = useVideoConfig();
  return useMemo(() => makeStage(width, height), [width, height]);
};
