import React, { useMemo } from 'react';
import { RSVPToken } from '../types';
import { RSVPAligner } from '../services/rsvpAligner';
import { useTitanTheme } from '../services/titanTheme';

interface RSVPTokenViewProps {
  token: RSVPToken | null;
  screenCenter: number;
}

/**
 * RSVPTokenView (Material Variant)
 * Ensures consistent centering logic across all RSVP view implementations.
 */
export const RSVPTokenView: React.FC<RSVPTokenViewProps> = ({ token, screenCenter }) => {
  const theme = useTitanTheme();


  // Dynamic font size and spacing based on word length/type
  const fullWord = token ? (token.leftSegment + token.centerCharacter + token.rightSegment) : '';
  const wordLen = fullWord.length;
  let fontSize = 48;
  let letterSpacing = 0;
  if (wordLen <= 3) fontSize = 54;
  else if (wordLen <= 5) fontSize = 50;
  else if (wordLen >= 10) fontSize = 44;
  else if (wordLen >= 14) fontSize = 40;
  if (wordLen >= 12) letterSpacing = 0.5;
  if (wordLen <= 3) letterSpacing = 0.1;

  const layoutConfig = useMemo(() => ({
    fontFamily: 'serif',
    fontSize,
    leftWeight: 500,
    centerWeight: 700,
    letterSpacing,
    screenCenter
  }), [screenCenter, fontSize, letterSpacing]);

  const xOffset = useMemo(() => {
    if (!token || screenCenter === 0) return 0;
    return RSVPAligner.calculateOffset(token, layoutConfig);
  }, [token, layoutConfig]);

  if (!token) return <div />;

  // Colors
  const primaryColor = theme.primaryText || '#EBEBF5';
  const secondaryColor = theme.secondaryText || '#8E8E93';
  // Enforce Ember Red for the focus character in ribbons as well
  const emberColor = '#E25822'; 

  // Adaptive ORP: highlight the most visually stable character
  let orpIdx = 0;
  if (token) {
    const full = token.leftSegment + token.centerCharacter + token.rightSegment;
    orpIdx = RSVPAligner.getAdaptiveORP(full);
  }

  return (
    <div
      className="flex items-baseline justify-start whitespace-nowrap will-change-transform backface-hidden"
      style={{
        transform: `translateX(${screenCenter + xOffset}px)`,
        transition: 'none',
      }}
    >
      {/* Left segment */}
      <span
        className="font-serif leading-none"
        style={{
          color: primaryColor,
          fontSize,
          fontWeight: 500,
          letterSpacing: letterSpacing,
        }}
      >
        {token && (token.leftSegment || '')}
      </span>

      {/* Focus (ORP) character with micro-kerning and highlight */}
      <span
        className="font-serif leading-none"
        style={{
          color: emberColor,
          fontSize,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textShadow: '0 1px 8px #E2582240',
        }}
      >
        {token && (token.centerCharacter || '')}
      </span>

      {/* Right segment */}
      <span
        className="font-serif leading-none"
        style={{
          color: primaryColor,
          fontSize,
          fontWeight: 500,
          letterSpacing: letterSpacing,
        }}
      >
        {token && (token.rightSegment || '')}
      </span>

      {/* Punctuation */}
      {token && token.punctuation && (
        <span
          className="font-serif leading-none"
          style={{
            color: secondaryColor,
            fontSize,
            fontWeight: 300,
            opacity: 0.7,
          }}
        >
          {token.punctuation}
        </span>
      )}
    </div>
  );
};