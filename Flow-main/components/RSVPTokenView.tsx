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

  const layoutConfig = useMemo(() => ({
    fontFamily: 'serif',
    fontSize: 48,
    leftWeight: 500,
    centerWeight: 700,
    letterSpacing: 0,
    screenCenter
  }), [screenCenter]);

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

  return (
    <div 
      className="flex items-baseline justify-start whitespace-nowrap will-change-transform backface-hidden"
      style={{
        transform: `translateX(${screenCenter + xOffset}px)`,
        transition: 'none', 
      }}
    >
      <span 
          className="font-serif text-[48px] font-medium leading-none"
          style={{ color: primaryColor }}
      >
        {token.leftSegment}
      </span>

      <span 
          className="font-serif text-[48px] font-bold leading-none"
          style={{ color: emberColor }}
      >
        {token.centerCharacter}
      </span>

      <span 
          className="font-serif text-[48px] font-medium leading-none"
          style={{ color: primaryColor }}
      >
        {token.rightSegment}
      </span>

      {token.punctuation && (
        <span 
          className="font-serif text-[48px] font-light leading-none"
          style={{ color: secondaryColor }}
        >
          {token.punctuation}
        </span>
      )}
    </div>
  );
};