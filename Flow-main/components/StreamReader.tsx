import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { Book } from '../types';
import { StreamEngine, WordSpan } from '../services/streamEngine';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface StreamReaderProps {
  book: Book;
  onToggleChrome: () => void;
  isActive: boolean;
}

// ============================================
// PARAGRAPH - Static by default, interactive on demand
// ============================================
const Paragraph = memo(({ 
  words, 
  startIndex, 
  activeIndex,
  isNearActive,
  fontSize, 
  lineHeight,
  paragraphSpacing,
  fontFamily, 
  textColor,
  accentColor,
  onWordTap
}: {
  words: WordSpan[];
  startIndex: number;
  activeIndex: number;
  isNearActive: boolean;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  fontFamily: string;
  textColor: string;
  accentColor: string;
  onWordTap: (index: number) => void;
}) => {
  const fontFamilyCSS = fontFamily === 'New York' 
    ? '"New York", "Iowan Old Style", Georgia, serif' 
    : fontFamily === 'OpenDyslexic' 
    ? '"OpenDyslexic", sans-serif'
    : fontFamily === 'Atkinson Hyperlegible' 
    ? '"Atkinson Hyperlegible", sans-serif'
    : 'system-ui, -apple-system, sans-serif';

  // PERFORMANCE: If not near active, render as plain text
  if (!isNearActive) {
    const plainText = words.map(w => w.text).join(' ');
    return (
      <p
        data-start={startIndex}
        onClick={() => onWordTap(startIndex)}
        style={{
          fontSize: `${fontSize}px`,
          lineHeight,
          marginBottom: `${paragraphSpacing}px`,
          fontFamily: fontFamilyCSS,
          color: textColor,
          textAlign: 'justify',
          hyphens: 'auto',
          WebkitHyphens: 'auto',
          cursor: 'pointer',
          opacity: 0.9
        }}
      >
        {plainText}
      </p>
    );
  }

  // INTERACTIVE: Render individual words when near active
  return (
    <p
      data-start={startIndex}
      style={{
        fontSize: `${fontSize}px`,
        lineHeight,
        marginBottom: `${paragraphSpacing}px`,
        fontFamily: fontFamilyCSS,
        color: textColor,
        textAlign: 'justify',
        hyphens: 'auto',
        WebkitHyphens: 'auto'
      }}
    >
      {words.map((word, i) => {
        const isActive = word.index === activeIndex;
        return (
          <React.Fragment key={word.index}>
            <span
              data-idx={word.index}
              onClick={(e) => {
                e.stopPropagation();
                onWordTap(word.index);
              }}
              style={{
                backgroundColor: isActive ? accentColor : 'transparent',
                color: isActive ? '#FFFFFF' : 'inherit',
                padding: isActive ? '2px 4px' : '0',
                margin: isActive ? '-2px -4px' : '0',
                borderRadius: isActive ? '4px' : '0',
                cursor: 'pointer',
                transition: 'background-color 0.1s ease'
              }}
            >
              {word.text}
            </span>
            {i < words.length - 1 ? ' ' : ''}
          </React.Fragment>
        );
      })}
    </p>
  );
});

// ============================================
// RSVP DISPLAY - Minimal, focused, fast
// ============================================
const RSVPDisplay = memo(({ 
  word, 
  fontSize,
  fontFamily,
  textColor,
  accentColor
}: {
  word: WordSpan | null;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  accentColor: string;
}) => {
  if (!word) return null;

  const fontFamilyCSS = fontFamily === 'New York' 
    ? '"New York", "Iowan Old Style", Georgia, serif' 
    : fontFamily === 'OpenDyslexic' 
    ? '"OpenDyslexic", sans-serif'
    : fontFamily === 'Atkinson Hyperlegible' 
    ? '"Atkinson Hyperlegible", sans-serif'
    : 'system-ui, -apple-system, sans-serif';

  // Find optimal recognition point (ORP) - slightly left of center
  const text = word.text;
  const orpIndex = text.length <= 1 ? 0 
    : text.length <= 5 ? 1 
    : text.length <= 9 ? 2 
    : text.length <= 13 ? 3 
    : 4;

  const before = text.slice(0, orpIndex);
  const pivot = text[orpIndex] || '';
  const after = text.slice(orpIndex + 1);

  const rsvpFontSize = Math.min(fontSize * 2.5, 72);

  return (
    <div 
      className="flex items-center justify-center select-none"
      style={{ 
        fontFamily: fontFamilyCSS,
        fontSize: `${rsvpFontSize}px`,
        fontWeight: 500,
        letterSpacing: '0.02em'
      }}
    >
      <span style={{ color: textColor, textAlign: 'right', minWidth: '40%' }}>{before}</span>
      <span style={{ color: accentColor, fontWeight: 700 }}>{pivot}</span>
      <span style={{ color: textColor, textAlign: 'left', minWidth: '40%' }}>{after}</span>
    </div>
  );
});

// ============================================
// STREAM READER - Unified scroll + RSVP
// ============================================
export const StreamReader: React.FC<StreamReaderProps> = ({ book, onToggleChrome, isActive }) => {
  const engine = StreamEngine.getInstance();
  const theme = useTitanTheme();
  const { settings, updateSettings } = useTitanSettings();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // State
  const [isReady, setIsReady] = useState(false);
  const [position, setPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalWords, setTotalWords] = useState(0);
  
  // Refs for scroll sync
  const isProgrammaticScroll = useRef(false);
  const lastScrollPosition = useRef(0);
  
  // Pinch zoom
  const pinchStart = useRef<number | null>(null);
  const pinchFontSize = useRef(settings.fontSize);

  // ============================================
  // INITIALIZATION
  // ============================================
  useEffect(() => {
    if (!book.chapters || book.chapters.length === 0) {
      setIsReady(true);
      return;
    }

    setIsReady(false);

    // Extract text from all chapters (fast)
    const chapters = [...book.chapters].sort((a, b) => a.sortOrder - b.sortOrder);
    const textParts: string[] = [];
    
    for (const chapter of chapters) {
      if (chapter.content) {
        // Strip HTML fast
        const clean = chapter.content
          .replace(/<[^>]*>/g, ' ')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (clean) textParts.push(clean);
      }
    }
    
    const fullText = textParts.join('\n\n');
    
    // Load into engine (one-time tokenization)
    engine.load(fullText);
    setTotalWords(engine.total);
    
    // Restore position
    if (book.lastTokenIndex !== undefined && book.lastTokenIndex > 0) {
      engine.position = book.lastTokenIndex;
    } else if (book.bookmarkProgress && book.bookmarkProgress > 0) {
      engine.progress = book.bookmarkProgress;
    }
    
    // Restore WPM
    engine.wpm = settings.wpm || 300;
    
    setPosition(engine.position);
    setIsReady(true);
    
    // Scroll to position after render
    requestAnimationFrame(() => {
      scrollToPosition(engine.position, false);
    });
  }, [book.id]);

  // ============================================
  // ENGINE SUBSCRIPTIONS
  // ============================================
  useEffect(() => {
    const unsubPos = engine.onPosition((pos) => {
      setPosition(pos);
      
      // Auto-scroll during RSVP playback
      if (engine.isPlaying) {
        scrollToPosition(pos, true);
      }
      
      // Save progress
      book.lastTokenIndex = pos;
      book.bookmarkProgress = engine.progress;
    });
    
    const unsubPlay = engine.onPlayState((playing) => {
      setIsPlaying(playing);
    });
    
    return () => {
      unsubPos();
      unsubPlay();
    };
  }, []);

  // ============================================
  // SCROLL SYNC
  // ============================================
  const scrollToPosition = useCallback((pos: number, smooth: boolean) => {
    if (!scrollRef.current || totalWords === 0) return;
    
    isProgrammaticScroll.current = true;
    
    // Find the paragraph containing this position
    const element = scrollRef.current.querySelector(`[data-start="${pos}"]`) as HTMLElement;
    
    if (element) {
      const container = containerRef.current;
      if (container) {
        const targetY = element.offsetTop - (container.clientHeight * 0.3);
        container.scrollTo({
          top: Math.max(0, targetY),
          behavior: smooth ? 'smooth' : 'instant'
        });
      }
    } else {
      // Fallback: estimate scroll position
      const container = containerRef.current;
      if (container) {
        const progress = pos / totalWords;
        const targetY = progress * (container.scrollHeight - container.clientHeight);
        container.scrollTo({
          top: targetY,
          behavior: smooth ? 'smooth' : 'instant'
        });
      }
    }
    
    setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, smooth ? 500 : 50);
  }, [totalWords]);

  // Scroll tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isReady) return;
    
    let ticking = false;
    
    const handleScroll = () => {
      if (isProgrammaticScroll.current || ticking) return;
      
      ticking = true;
      requestAnimationFrame(() => {
        if (!isProgrammaticScroll.current && container) {
          const scrollPct = container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight);
          const newPos = Math.floor(scrollPct * (totalWords - 1));
          
          // Only update if significant change
          if (Math.abs(newPos - position) > 20) {
            engine.position = newPos;
          }
        }
        ticking = false;
      });
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isReady, totalWords, position]);

  // ============================================
  // TOUCH GESTURES
  // ============================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStart.current = Math.sqrt(dx * dx + dy * dy);
        pinchFontSize.current = settings.fontSize;
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStart.current !== null) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = dist / pinchStart.current;
        const newSize = Math.round(Math.max(12, Math.min(40, pinchFontSize.current * scale)));
        if (newSize !== settings.fontSize) {
          updateSettings({ fontSize: newSize });
        }
      }
    };
    
    const handleTouchEnd = () => {
      pinchStart.current = null;
    };
    
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [settings.fontSize, updateSettings]);

  // ============================================
  // HANDLERS
  // ============================================
  const handleWordTap = useCallback((index: number) => {
    RSVPHapticEngine.impactLight();
    engine.position = index;
    scrollToPosition(index, true);
  }, [scrollToPosition]);

  const handlePlayToggle = useCallback(() => {
    RSVPHapticEngine.impactMedium();
    engine.toggle();
  }, []);

  // ============================================
  // PARAGRAPH DATA
  // ============================================
  const paragraphs = useMemo(() => {
    if (totalWords === 0) return [];
    return engine.getParagraphs(0, 10000); // Get all paragraphs
  }, [totalWords, isReady]);

  // ============================================
  // RENDER
  // ============================================
  if (!isReady) {
    return (
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: theme.background }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 rounded-full animate-spin" 
               style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
          <span className="text-sm lowercase tracking-wider" style={{ color: theme.secondaryText }}>loading</span>
        </div>
      </div>
    );
  }

  if (totalWords === 0) {
    return (
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: theme.background }}
      >
        <div className="text-center px-8">
          <div className="text-4xl mb-4">📖</div>
          <p style={{ color: theme.secondaryText }}>No content available</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-y-auto overflow-x-hidden"
      style={{ 
        backgroundColor: theme.background,
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onToggleChrome();
      }}
    >
      {/* RSVP Overlay - Shows when playing */}
      {isPlaying && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: theme.background }}
          onClick={handlePlayToggle}
        >
          <RSVPDisplay
            word={engine.getCurrentWord()}
            fontSize={settings.fontSize}
            fontFamily={settings.fontFamily}
            textColor={theme.primaryText}
            accentColor={theme.accent}
          />
          
          {/* Progress bar */}
          <div className="absolute bottom-8 left-8 right-8">
            <div 
              className="h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: `${theme.primaryText}20` }}
            >
              <div 
                className="h-full rounded-full transition-all duration-200"
                style={{ 
                  backgroundColor: theme.accent,
                  width: `${engine.progress * 100}%`
                }}
              />
            </div>
          </div>
          
          {/* Tap hint */}
          <div className="absolute bottom-16 left-0 right-0 text-center">
            <span className="text-xs opacity-40" style={{ color: theme.secondaryText }}>tap to pause</span>
          </div>
        </div>
      )}

      {/* Scroll Content */}
      <div 
        ref={scrollRef}
        className="w-full min-h-full"
        style={{
          maxWidth: '680px',
          margin: '0 auto',
          padding: '80px 24px 200px 24px'
        }}
      >
        {paragraphs.map((para, idx) => {
          const isNearActive = Math.abs(para.startIndex - position) < 500;
          return (
            <Paragraph
              key={para.startIndex}
              words={para.words}
              startIndex={para.startIndex}
              activeIndex={position}
              isNearActive={isNearActive}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              paragraphSpacing={settings.paragraphSpacing}
              fontFamily={settings.fontFamily}
              textColor={theme.primaryText}
              accentColor={theme.accent}
              onWordTap={handleWordTap}
            />
          );
        })}
      </div>
    </div>
  );
};

export default StreamReader;
