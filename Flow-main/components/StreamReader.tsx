import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import { Book } from '../types';
import { StreamEngine, WordSpan } from '../services/streamEngine';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { TitanStorage } from '../services/titanStorage';

interface StreamReaderProps {
  book: Book;
  onToggleChrome: () => void;
  isActive: boolean;
  showGhostWords?: boolean;
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
        style={{
          fontSize: `${fontSize}px`,
          lineHeight,
          marginBottom: `${paragraphSpacing}px`,
          fontFamily: fontFamilyCSS,
          color: textColor,
          textAlign: 'justify',
          hyphens: 'auto',
          WebkitHyphens: 'auto',
          textRendering: 'optimizeLegibility',
          WebkitFontSmoothing: 'antialiased'
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
        WebkitHyphens: 'auto',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased'
      }}
    >
      {words.map((word, i) => {
        const isActive = word.index === activeIndex;
        return (
          <React.Fragment key={word.index}>
            <span
              data-idx={word.index}
              style={{
                backgroundColor: isActive ? accentColor : 'transparent',
                color: isActive ? '#FFFFFF' : 'inherit',
                padding: isActive ? '3px 6px' : '0',
                margin: isActive ? '-3px -6px' : '0',
                borderRadius: isActive ? '6px' : '0',
                transition: 'all 0.15s ease-out',
                boxShadow: isActive ? `0 2px 8px ${accentColor}40` : 'none'
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
// RSVP DISPLAY - Clean ORP with single focus line
// ============================================
const RSVPDisplay = memo(({ 
  word, 
  nextWords,
  prevWords,
  fontSize,
  fontFamily,
  textColor,
  accentColor,
  showGhost
}: {
  word: WordSpan | null;
  nextWords: WordSpan[];
  prevWords: WordSpan[];
  fontSize: number;
  fontFamily: string;
  textColor: string;
  accentColor: string;
  showGhost: boolean;
}) => {
  if (!word) return null;

  const fontFamilyCSS = fontFamily === 'New York' 
    ? '"New York", "Iowan Old Style", Georgia, serif' 
    : fontFamily === 'OpenDyslexic' 
    ? '"OpenDyslexic", sans-serif'
    : fontFamily === 'Atkinson Hyperlegible' 
    ? '"Atkinson Hyperlegible", sans-serif'
    : 'system-ui, -apple-system, sans-serif';

  const rsvpFontSize = Math.min(fontSize * 2.2, 56);

  // Find optimal recognition point (ORP) for current word
  const text = word.text;
  const orpIndex = text.length <= 1 ? 0 
    : text.length <= 5 ? 1 
    : text.length <= 9 ? 2 
    : text.length <= 13 ? 3 
    : 4;

  const before = text.slice(0, orpIndex);
  const pivot = text[orpIndex] || '';
  const after = text.slice(orpIndex + 1);

  // Book-style layout with LOCKED focus word - context flows around the centered word
  if (showGhost) {
    const contextFontSize = rsvpFontSize * 0.5;
    const verticalGap = rsvpFontSize * 0.9;
    
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center select-none overflow-hidden">
        {/* Previous words - above, flowing right-to-left into focus */}
        {prevWords.length > 0 && (
          <div 
            className="absolute text-right px-6"
            style={{ 
              bottom: `calc(50% + ${verticalGap}px)`,
              right: '50%',
              marginRight: `${rsvpFontSize * 0.15}px`,
              fontFamily: fontFamilyCSS,
              fontSize: `${contextFontSize}px`,
              color: textColor,
              opacity: 0.3,
              maxWidth: '45vw',
              lineHeight: 1.5,
              textAlign: 'justify'
            }}
          >
            {prevWords.map(w => w.text).join(' ')}
          </div>
        )}

        {/* LOCKED Main word with ORP alignment */}
        <div className="relative flex items-center justify-center w-full">
          {/* Word positioned so ORP aligns with center */}
          <div 
            className="flex items-baseline relative"
            style={{ 
              fontFamily: fontFamilyCSS,
              fontSize: `${rsvpFontSize}px`,
              fontWeight: 500,
              letterSpacing: '0.01em'
            }}
          >
            <span 
              className="text-right"
              style={{ 
                color: textColor,
                minWidth: '42vw',
                paddingRight: '3px'
              }}
            >
              {before}
            </span>
            <span className="relative" style={{ color: accentColor, fontWeight: 700 }}>
              {pivot}
              {/* Focus dot under pivot */}
              <span 
                className="absolute left-1/2 -translate-x-1/2 rounded-full"
                style={{
                  bottom: `-${rsvpFontSize * 0.25}px`,
                  width: `${Math.max(4, rsvpFontSize * 0.12)}px`,
                  height: `${Math.max(4, rsvpFontSize * 0.12)}px`,
                  backgroundColor: accentColor,
                  boxShadow: `0 0 8px ${accentColor}60, 0 0 16px ${accentColor}30`
                }}
              />
            </span>
            <span 
              className="text-left"
              style={{ 
                color: textColor,
                minWidth: '42vw',
                paddingLeft: '3px'
              }}
            >
              {after}
            </span>
          </div>
        </div>

        {/* Next words - below, flowing left-to-right from focus */}
        {nextWords.length > 0 && (
          <div 
            className="absolute text-left px-6"
            style={{ 
              top: `calc(50% + ${verticalGap}px)`,
              left: '50%',
              marginLeft: `${rsvpFontSize * 0.15}px`,
              fontFamily: fontFamilyCSS,
              fontSize: `${contextFontSize}px`,
              color: textColor,
              opacity: 0.25,
              maxWidth: '45vw',
              lineHeight: 1.5,
              textAlign: 'justify'
            }}
          >
            {nextWords.map(w => w.text).join(' ')}
          </div>
        )}
      </div>
    );
  }

  // Classic RSVP mode (ghost disabled) - single word with ORP
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center select-none overflow-hidden">
      {/* Main word display with ORP alignment */}
      <div className="relative flex items-center justify-center w-full">
        {/* Word positioned so ORP aligns with center */}
        <div 
          className="flex items-baseline relative"
          style={{ 
            fontFamily: fontFamilyCSS,
            fontSize: `${rsvpFontSize}px`,
            fontWeight: 500,
            letterSpacing: '0.01em'
          }}
        >
          {/* Before ORP - right-aligned */}
          <span 
            className="text-right"
            style={{ 
              color: textColor,
              minWidth: '42vw',
              paddingRight: '3px'
            }}
          >
            {before}
          </span>
          
          {/* Pivot letter with focus dot */}
          <span 
            className="relative"
            style={{ 
              color: accentColor, 
              fontWeight: 700
            }}
          >
            {pivot}
            {/* Focus dot under pivot */}
            <span 
              className="absolute left-1/2 -translate-x-1/2 rounded-full"
              style={{
                bottom: `-${rsvpFontSize * 0.25}px`,
                width: `${Math.max(4, rsvpFontSize * 0.12)}px`,
                height: `${Math.max(4, rsvpFontSize * 0.12)}px`,
                backgroundColor: accentColor,
                boxShadow: `0 0 8px ${accentColor}60, 0 0 16px ${accentColor}30`
              }}
            />
          </span>
          
          {/* After ORP - left-aligned */}
          <span 
            className="text-left"
            style={{ 
              color: textColor,
              minWidth: '42vw',
              paddingLeft: '3px'
            }}
          >
            {after}
          </span>
        </div>
      </div>
    </div>
  );
});

// ============================================
// STREAM READER - Unified scroll + RSVP
// ============================================
export const StreamReader: React.FC<StreamReaderProps> = ({ book, onToggleChrome, isActive, showGhostWords = true }) => {
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
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  
  useEffect(() => {
    const unsubPos = engine.onPosition((pos) => {
      setPosition(pos);
      
      // Auto-scroll during RSVP playback
      if (engine.isPlaying) {
        scrollToPosition(pos, true);
      }
      
      // Save progress to book object
      book.lastTokenIndex = pos;
      book.bookmarkProgress = engine.progress;
      
      // Debounced save to storage
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        TitanStorage.getInstance().saveBook({
          ...book,
          lastTokenIndex: pos,
          bookmarkProgress: engine.progress,
          lastOpened: new Date()
        });
      }, 500);
    });
    
    const unsubPlay = engine.onPlayState((playing) => {
      setIsPlaying(playing);
      
      // When RSVP stops, center the current word in scroll view and save immediately
      if (!playing) {
        setTimeout(() => {
          scrollToPosition(engine.position, true);
        }, 100);
        
        // Immediate save when stopping
        TitanStorage.getInstance().saveBook({
          ...book,
          lastTokenIndex: engine.position,
          bookmarkProgress: engine.progress,
          lastOpened: new Date()
        });
      }
    });
    
    return () => {
      unsubPos();
      unsubPlay();
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [book.id]);

  // ============================================
  // SCROLL SYNC
  // ============================================
  const scrollToPosition = useCallback((pos: number, smooth: boolean) => {
    if (!scrollRef.current || totalWords === 0) return;
    
    isProgrammaticScroll.current = true;
    
    const container = containerRef.current;
    if (!container) return;
    
    // Find the paragraph containing this position
    const element = scrollRef.current.querySelector(`[data-start="${pos}"]`) as HTMLElement;
    
    if (element) {
      // Center the element in the viewport
      const elementTop = element.offsetTop;
      const elementHeight = element.offsetHeight;
      const containerHeight = container.clientHeight;
      const targetY = elementTop - (containerHeight / 2) + (elementHeight / 2);
      
      container.scrollTo({
        top: Math.max(0, targetY),
        behavior: smooth ? 'smooth' : 'instant'
      });
    } else {
      // Fallback: estimate scroll position and center
      const progress = pos / totalWords;
      const targetY = progress * (container.scrollHeight - container.clientHeight);
      container.scrollTo({
        top: targetY,
        behavior: smooth ? 'smooth' : 'instant'
      });
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
  
  // Track tap vs drag for better interaction
  const touchStartPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleWordTap = useCallback((index: number) => {
    RSVPHapticEngine.impactLight();
    engine.position = index;
    // Start playing from this word
    engine.play();
  }, []);

  const handlePlayToggle = useCallback(() => {
    RSVPHapticEngine.impactMedium();
    engine.toggle();
  }, []);
  
  // Universal tap handler - works on text and empty space
  const handleTapStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartPos.current = { x: clientX, y: clientY, time: Date.now() };
    
    // Long press detection (for word selection)
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      // Long press - could select word for later features
      RSVPHapticEngine.impactLight();
    }, 500);
  }, []);
  
  const handleTapEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (!touchStartPos.current) return;
    
    const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
    const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;
    
    const dx = Math.abs(clientX - touchStartPos.current.x);
    const dy = Math.abs(clientY - touchStartPos.current.y);
    const dt = Date.now() - touchStartPos.current.time;
    
    // It's a tap if: short duration, small movement
    const isTap = dt < 400 && dx < 20 && dy < 20;
    
    if (isTap) {
      // Check if we're clicking on a word (has data-idx) - walk up the DOM tree
      let target = e.target as HTMLElement | null;
      let wordIndex: string | undefined;
      
      while (target && !wordIndex) {
        wordIndex = target.dataset?.idx;
        target = target.parentElement;
      }
      
      if (wordIndex !== undefined) {
        // Tapped on a word - jump to this position and start RSVP
        e.preventDefault();
        e.stopPropagation();
        handleWordTap(parseInt(wordIndex));
      } else {
        // Tapped on empty space - toggle chrome
        onToggleChrome();
      }
    }
    
    touchStartPos.current = null;
  }, [handleWordTap, onToggleChrome]);
  
  const handleTapCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
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
          <div className="text-5xl mb-4 animate-bounce">🍃</div>
          <p className="text-lg font-medium" style={{ color: theme.secondaryText }}>nothing here yet~</p>
          <p className="text-sm mt-2 opacity-60" style={{ color: theme.secondaryText }}>this book seems empty!</p>
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
      onTouchStart={handleTapStart}
      onTouchEnd={handleTapEnd}
      onTouchCancel={handleTapCancel}
      onMouseDown={handleTapStart}
      onMouseUp={handleTapEnd}
    >
      {/* RSVP Overlay - Shows when playing */}
      {isPlaying && (
        <div 
          className="fixed inset-0 z-50"
          style={{ backgroundColor: theme.background }}
          onClick={handlePlayToggle}
        >
          {/* Subtle film grain overlay for cozy reading vibe */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat'
            }}
          />
          
          <RSVPDisplay
            word={engine.getCurrentWord()}
            nextWords={engine.getRange(position + 1, 6)}
            prevWords={engine.getRange(Math.max(0, position - 4), 4)}
            fontSize={settings.fontSize}
            fontFamily={settings.fontFamily}
            textColor={theme.primaryText}
            accentColor={theme.accent}
            showGhost={showGhostWords}
          />
          
          {/* Breathing progress indicator */}
          <div className="absolute bottom-6 left-6 right-6 pointer-events-none">
            <div 
              className="h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: `${theme.primaryText}08` }}
            >
              <div 
                className="h-full rounded-full"
                style={{ 
                  backgroundColor: theme.accent,
                  opacity: 0.5,
                  width: `${engine.progress * 100}%`,
                  transition: 'width 0.15s ease-out',
                  boxShadow: `0 0 12px ${theme.accent}40`
                }}
              />
            </div>
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
