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
  question: 180,
  kick: 150,
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
