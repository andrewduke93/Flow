import React, { useEffect, useRef, useState } from 'react';
import { Book, RSVPToken } from '../types';
import { useTitanTheme, TitanThemeColors } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPProcessor } from '../services/rsvpProcessor';

interface TitanReaderViewProps {
  book: Book;
  onToggleChrome: () => void;
  onRequestRSVP?: (startOffset: number, tokenIndex: number) => void;
  isActive: boolean;
}

export const TitanReaderView: React.FC<TitanReaderViewProps> = ({ book, onToggleChrome, isActive }) => {
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isRSVP, setIsRSVP] = useState(false);
  const [rsvpSpeed, setRsvpSpeed] = useState(300);

  useEffect(() => {
    // Load and process tokens from book content
    const processBook = async () => {
      if (!book.chapters || book.chapters.length === 0) {
        setTokens([]);
        return;
      }

      try {
        // Combine all chapter content and strip HTML tags
        const fullContent = book.chapters
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(ch => {
            // Strip HTML tags from content
            const div = document.createElement('div');
            div.innerHTML = ch.content;
            return div.textContent || div.innerText || '';
          })
          .join('\n\n');

        // Process content into RSVP tokens
        const processedTokens = await RSVPProcessor.process(fullContent);

        // Add globalIndex to each token
        const tokensWithIndex = processedTokens.map((token, index) => ({
          ...token,
          globalIndex: index
        }));

        setTokens(tokensWithIndex);
        setActiveIndex(0);
      } catch (error) {
        console.error('Failed to process book tokens:', error);
        setTokens([]);
      }
    };

    processBook();
  }, [book]);

  // Integrate with global RSVP engine and add robust click-delegation
  useEffect(() => {
    // Capture-phase listener: logs pointerdown and delegates token clicks even when overlays exist
    const root = containerRef.current;
    if (!root) return;

    const onPointerDown = (ev: PointerEvent) => {
      // useful for QA when investigating blocked input
      // find the nearest token element
      const tokenEl = (ev.target as HTMLElement)?.closest?.('[data-idx]') as HTMLElement | null;
      if (tokenEl) {
        const idx = Number(tokenEl.dataset.idx);
        if (!Number.isNaN(idx)) {
          // handle immediately (capture-phase) to be robust to other handlers
          setActiveIndex(idx);
          ev.stopPropagation();
          ev.preventDefault();
        }
      }
    };

    root.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => root.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, [containerRef, tokens]);

  const handleExitRSVP = () => {
    setIsRSVP(false);
    // best-effort stop of global engine
    try {
      // dynamic import to avoid circular deps at module-eval
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { RSVPConductor } = require('../services/rsvpConductor');
      RSVPConductor.getInstance().shutdown(true);
    } catch (err) {
      /* ignore - engine may not be initialized */
    }
  };

  // Highlight sync in RSVP mode (local visual fallback)
  useEffect(() => {
    if (!isRSVP) return;
    if (tokens.length === 0) return;
    // Advance highlight every rsvpSpeed ms
    const interval = setInterval(() => {
      setActiveIndex(idx => Math.min(tokens.length - 1, idx + 1));
    }, rsvpSpeed);
    return () => clearInterval(interval);
  }, [isRSVP, tokens, rsvpSpeed]);

  // Scroll to highlighted word
  useEffect(() => {
    if (!containerRef.current) return;
    const elem = containerRef.current.querySelector(`[data-idx="${activeIndex}"]`);
    if (elem) {
      (elem as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeIndex]);

  // Tap a word to highlight only (kept for direct handlers)
  const handleWordTap = (idx: number) => {
    setActiveIndex(idx);
  };

  // Start RSVP and connect to the global conductor (ensures Flow mode actually starts)
  const handleRSVP = async () => {
    // If there are no tokens, try to prepare them first
    if (tokens.length === 0) {
      console.warn('No tokens available to start RSVP');
      return;
    }

    setIsRSVP(true);
    try {
      const { RSVPConductor } = await import('../services/rsvpConductor');
      const conductor = RSVPConductor.getInstance();

      // Prepare using plain text (conductor will dedupe if already prepared)
      const text = tokens.map(t => t.originalText).join(' ');
      await conductor.prepare(text, { index: Math.max(0, activeIndex) });
      conductor.play();
    } catch (err) {
      console.error('Failed to start RSVP conductor:', err);
      // fallback to local visual RSVP (already handled by isRSVP)
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-y-auto"
      style={{ color: theme.primaryText, pointerEvents: 'auto' }}
    >
      <div className="p-8 pt-24 max-w-3xl mx-auto pb-48">
        {tokens.length === 0 ? (
          <div className="text-center text-lg mt-32 opacity-50">No content available</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {tokens.map(token => (
              <span
                key={token.globalIndex}
                data-idx={token.globalIndex}
                className={token.globalIndex === activeIndex ? 'px-2 py-1 rounded transition-all font-bold' : 'hover:bg-black/5 cursor-pointer px-2 py-1 rounded transition-all'}
                style={{
                  fontSize: settings.fontSize,
                  marginRight: 2,
                  color: token.globalIndex === activeIndex ? theme.accent : undefined
                }}
                onClick={() => handleWordTap(token.globalIndex)}
              >
                {token.originalText}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};