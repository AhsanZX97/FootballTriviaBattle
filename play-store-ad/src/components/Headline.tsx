import React from 'react';
import { COLOR, FONT } from '../theme';

/**
 * Arcade poster lettering: a hard black keyline, a solid 3D extrude falling
 * away underneath, a gradient face and an outer glow. Built as stacked copies
 * of the same string rather than text-shadow tricks, so the extrude is a real
 * continuous block instead of a smeared shadow.
 */

/** A ring of hard shadows approximating an N-px outline around the glyphs. */
const outlineRing = (width: number, color = '#0a0a0a') => {
  const parts: string[] = [];
  const rings = [width, width * 0.62];
  for (const r of rings) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      parts.push(`${(Math.cos(a) * r).toFixed(2)}px ${(Math.sin(a) * r).toFixed(2)}px 0 ${color}`);
    }
  }
  return parts.join(', ');
};

/** Mix two hex colours; used to fade the extrude from gold into near-black. */
const mix = (from: string, to: string, t: number) => {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const c = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${c(r1, r2)}, ${c(g1, g2)}, ${c(b1, b2)})`;
};

type Props = {
  children: string;
  size: number;
  /** Face gradient, top colour first. */
  gradient: [string, string, string];
  /** Extrude block, from the colour just under the face to the deepest step. */
  extrude?: [string, string];
  depth?: number;
  outline?: number;
  glow?: string;
  letterSpacing?: string;
  style?: React.CSSProperties;
};

export const Headline: React.FC<Props> = ({
  children,
  size,
  gradient,
  extrude = ['#8a5a08', '#241503'],
  depth = 14,
  outline = 7,
  glow,
  letterSpacing = '0em',
  style,
}) => {
  const base: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: size,
    letterSpacing,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    margin: 0,
  };
  const layer: React.CSSProperties = { ...base, position: 'absolute', left: 0, top: 0 };

  // Deepest step first so later (shallower) steps paint over it.
  const steps = Array.from({ length: depth }, (_, i) => depth - i);

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        filter: glow ? `drop-shadow(0 0 12px ${glow}) drop-shadow(0 0 30px ${glow})` : undefined,
        ...style,
      }}
    >
      {steps.map((d) => (
        <div
          key={d}
          aria-hidden
          style={{
            ...layer,
            transform: `translateY(${d}px)`,
            color: mix(extrude[0], extrude[1], d / depth),
            // only the far edge carries the keyline, so the block stays solid
            textShadow: d === depth ? outlineRing(outline) : undefined,
          }}
        >
          {children}
        </div>
      ))}

      {/* the keyline around the face itself */}
      <div aria-hidden style={{ ...layer, color: '#0a0a0a', textShadow: outlineRing(outline) }}>
        {children}
      </div>

      {/* in flow, so it sizes the box — and last, so it paints on top */}
      <div
        style={{
          ...base,
          position: 'relative',
          backgroundImage: `linear-gradient(180deg, ${gradient[0]} 0%, ${gradient[1]} 52%, ${gradient[2]} 100%)`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** The three faces the ad uses. Everything marketing-facing picks one of
 *  these so the lettering stays one system across all six scenes. */
export type Preset = {
  gradient: [string, string, string];
  extrude: [string, string];
  glow?: string;
};

export const GOLD: Preset = {
  gradient: ['#fff6c2', '#ffd12e', '#ef8a10'],
  extrude: ['#a35f06', '#2a1703'],
  glow: 'rgba(255, 168, 12, 0.5)',
};

export const SILVER: Preset = {
  gradient: ['#ffffff', '#ffffff', '#c9d3de'],
  extrude: ['#79838f', '#141920'],
};

export const GREEN: Preset = {
  gradient: ['#d8ffd0', '#5fd46f', '#1f8a35'],
  extrude: ['#176b28', '#04240c'],
  glow: 'rgba(64, 210, 96, 0.4)',
};

/** Multi-line headline; each line is its own block, since the face gradient
 *  has to run top-to-bottom per line rather than across the whole stack. */
export const HeadlineLines: React.FC<{
  lines: string[];
  size: number;
  preset: Preset;
  depth?: number;
  outline?: number;
  gap?: number;
  letterSpacing?: string;
  align?: 'center' | 'flex-start';
}> = ({ lines, size, preset, depth, outline, gap = 18, letterSpacing, align = 'center' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap }}>
    {lines.map((line) => (
      <Headline
        key={line}
        size={size}
        depth={depth}
        outline={outline}
        letterSpacing={letterSpacing}
        {...preset}
      >
        {line}
      </Headline>
    ))}
  </div>
);

/** Impact dashes flanking the big line, like a comic-book hit. */
export const Sparks: React.FC<{ side: 'left' | 'right'; scale?: number }> = ({
  side,
  scale = 1,
}) => {
  const bars = [
    { w: 54, top: -6, angle: -28 },
    { w: 74, top: 42, angle: 0 },
    { w: 54, top: 90, angle: 28 },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        [side]: -128 * scale,
        transform: `translateY(-50%) scale(${scale})`,
        width: 100,
        height: 130,
      }}
    >
      {bars.map((b) => (
        <div
          key={b.top}
          style={{
            position: 'absolute',
            top: b.top,
            [side === 'left' ? 'right' : 'left']: 0,
            width: b.w,
            height: 12,
            background: COLOR.yellow,
            boxShadow: '0 0 0 5px #0a0a0a',
            transform: `rotate(${side === 'left' ? -b.angle : b.angle}deg)`,
          }}
        />
      ))}
    </div>
  );
};

/** The dark gold-bordered plate the closing line sits on. */
export const Plate: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = 44,
}) => (
  <div
    style={{
      padding: '26px 52px',
      background: 'linear-gradient(180deg, #1b1710 0%, #0d0b07 100%)',
      border: `7px solid ${COLOR.yellow}`,
      boxShadow: [
        `inset 0 5px 0 0 rgba(255, 255, 255, 0.14)`,
        `0 0 0 7px #0a0a0a`,
        `0 14px 0 7px rgba(0, 0, 0, 0.75)`,
      ].join(', '),
    }}
  >
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '0.04em',
        color: '#ffffff',
        whiteSpace: 'nowrap',
        textShadow: outlineRing(5),
      }}
    >
      {children}
    </div>
  </div>
);
