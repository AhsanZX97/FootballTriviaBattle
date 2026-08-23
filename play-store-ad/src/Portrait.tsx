import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Ad } from './Ad';

/** 1080x1920 — the design canvas one-to-one. */
export const Portrait: React.FC = () => (
  <AbsoluteFill style={{ background: '#04140b' }}>
    <Ad />
  </AbsoluteFill>
);
