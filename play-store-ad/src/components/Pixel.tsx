import React from 'react';
import { COLOR, FONT, panelShadow } from '../theme';

type TextProps = {
  children: React.ReactNode;
  size?: number;
  color?: string;
  /** px of hard offset shadow; the game uses 2–3px at UI sizes. */
  shadow?: number;
  lineHeight?: number;
  letterSpacing?: string;
  align?: React.CSSProperties['textAlign'];
  style?: React.CSSProperties;
};

/** Every word in the ad is set in the in-game pixel font with a hard shadow. */
export const PixelText: React.FC<TextProps> = ({
  children,
  size = 32,
  color = COLOR.white,
  shadow = 4,
  lineHeight = 1.6,
  letterSpacing = '0.06em',
  align = 'center',
  style,
}) => (
  <div
    style={{
      fontFamily: FONT,
      fontSize: size,
      color,
      lineHeight,
      letterSpacing,
      textAlign: align,
      textShadow: shadow ? `${shadow}px ${shadow}px 0 #000` : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

type PanelProps = {
  children?: React.ReactNode;
  spread?: number;
  padding?: number | string;
  background?: string;
  style?: React.CSSProperties;
};

/** The game's dark-green card: flat fill, hard outline, offset block shadow. */
export const Panel: React.FC<PanelProps> = ({
  children,
  spread = 6,
  padding = 32,
  background = COLOR.panel,
  style,
}) => (
  <div
    style={{
      background,
      padding,
      boxShadow: panelShadow(spread),
      ...style,
    }}
  >
    {children}
  </div>
);

type ButtonProps = {
  children: React.ReactNode;
  background?: string;
  color?: string;
  size?: number;
  /** 0 = resting, 1 = fully pressed into the shadow. */
  press?: number;
  style?: React.CSSProperties;
};

/** Answer-button look: bevelled inset highlights over a flat yellow fill. */
export const PixelButton: React.FC<ButtonProps> = ({
  children,
  background = COLOR.yellow,
  color = '#1a1206',
  size = 30,
  press = 0,
  style,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '30px 24px',
      background,
      color,
      fontFamily: FONT,
      fontSize: size,
      lineHeight: 1.5,
      letterSpacing: '0.04em',
      textAlign: 'center',
      transform: `translate(${press * 4}px, ${press * 4}px)`,
      boxShadow: [
        'inset 5px 5px 0 0 rgba(255, 255, 255, 0.55)',
        'inset -5px -5px 0 0 rgba(0, 0, 0, 0.45)',
        `0 0 0 4px ${COLOR.ink}`,
        `${6 - press * 4}px ${6 - press * 4}px 0 4px ${COLOR.shadow}`,
      ].join(', '),
      ...style,
    }}
  >
    {children}
  </div>
);
