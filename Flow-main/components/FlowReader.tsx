import React, { useEffect, useRef, useState } from 'react';
import { Book } from '../types';
import { StreamEngine } from '../services/streamEngine';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { TitanStorage } from '../services/titanStorage';

interface FlowReaderProps {
  book: Book;
  onToggleChrome: () => void;
  isActive: boolean;
}

// Minimal ORP guess: center-ish character
function computeOrpIndex(word: string) {
  if (!word) return 0;
  const len = word.length;
  return Math.max(0, Math.floor((len - 1) / 2));
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const FlowReader: React.FC<FlowReaderProps> = ({ book, onToggleChrome, isActive }) => {
  const engine = StreamEngine.getInstance();
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();

  // Extract and clean text
  const chapters = book?.chapters ? [...book.chapters].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const textParts: string[] = [];
  for (const ch of chapters) {
    if (ch.content) {
      const clean = ch.content
        .replace(/<[^>]*>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (clean) textParts.push(clean);
    }
  }
  const fullText = textParts.join('\n\n');

  // Split into paragraphs
  const paragraphs = fullText.split(/\n{2,}/).filter(Boolean);

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ backgroundColor: theme.background }}>
      <div style={{ maxWidth: '65ch', margin: '0 auto', padding: '80px 24px 200px', fontSize: settings.fontSize, lineHeight: settings.lineHeight, fontFamily: settings.fontFamily, color: theme.primaryText }}>
        {paragraphs.map((para, idx) => (
          <p key={idx} style={{ marginBottom: '1.5em', textAlign: 'justify' }}>{para}</p>
        ))}
      </div>
    </div>
  );
}

