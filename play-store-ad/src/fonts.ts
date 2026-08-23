import { continueRender, delayRender, staticFile } from 'remotion';

/**
 * Press Start 2P, self-hosted from the game's own woff2. Rendering must not
 * start before the face is ready or the first frames come out in a fallback
 * font, so the load is wrapped in delayRender.
 */
const handle = delayRender('Loading Press Start 2P');

const face = new FontFace(
  'Press Start 2P',
  `url(${staticFile('fonts/press-start-2p-latin.woff2')}) format('woff2')`,
);

face
  .load()
  .then((loaded) => {
    // lib.dom in this TS version types FontFaceSet without `add`.
    (document.fonts as FontFaceSet & { add(font: FontFace): void }).add(loaded);
    continueRender(handle);
  })
  .catch((err) => {
    // A missing font should not take the whole render down — fall back.
    console.error('Font failed to load', err);
    continueRender(handle);
  });

export {};
