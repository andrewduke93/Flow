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

  // Beautiful new RSVP UX
  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-y-auto bg-gradient-to-br from-blue-50 to-indigo-100" style={{ color: theme.primaryText, pointerEvents: 'auto' }}>
      <div className="fixed top-0 left-0 w-full flex justify-between items-center p-4 z-50 bg-white/80 backdrop-blur-md shadow">
        <span className="font-bold text-xl text-indigo-700">Flow Reader</span>
        {!isRSVP ? (
          <button className="px-6 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-semibold shadow-lg hover:scale-105 transition" onClick={handleRSVP}>
            <span className="mr-2">▶️</span> Start Flow
          </button>
        ) : (
          <button className="px-6 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-red-500 text-white font-semibold shadow-lg hover:scale-105 transition" onClick={handleExitRSVP}>
            <span className="mr-2">⏹️</span> Exit Flow
          </button>
        )}
        {isRSVP && (
          <div className="flex items-center ml-4">
            <span className="mr-2 text-sm text-gray-600">Speed:</span>
            <input type="range" min="100" max="1000" value={rsvpSpeed} onChange={e => setRsvpSpeed(Number(e.target.value))} className="w-32" />
            <span className="ml-2 text-xs text-gray-700">{rsvpSpeed}ms</span>
          </div>
        )}
      </div>
      <div className="p-8 pt-24 max-w-3xl mx-auto">
        {tokens.length === 0 ? (
          <div className="text-center text-lg mt-32">No content available</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {tokens.map(token => (
              <span
                key={token.globalIndex}
                data-idx={token.globalIndex}
                className={token.globalIndex === activeIndex ? 'bg-gradient-to-r from-yellow-300 to-orange-200 text-black px-2 py-1 rounded shadow-lg font-bold transition-all scale-110' : 'hover:bg-blue-200 cursor-pointer px-2 py-1 rounded transition-all'}
                style={{ fontSize: settings.fontSize, marginRight: 2 }}
                onClick={() => handleWordTap(token.globalIndex)}
              >
                {token.originalText}
              </span>
            ))}
          </div>
        )}
        {isRSVP && tokens.length > 0 && (
          <div className="mt-12 flex flex-col items-center">
            <div className="text-4xl font-extrabold text-indigo-700 animate-pulse mb-4">{tokens[activeIndex]?.originalText}</div>
            <div className="text-sm text-gray-500">Flow mode: auto-advancing, tap Exit to return</div>
          </div>
        )}
      </div>
    </div>
  );
};