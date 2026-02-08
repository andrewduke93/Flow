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
// FONT CONFIGURATION
// ============================================
const FONT_STACKS: Record<string, string> = {
  'New York': '"New York", "Iowan Old Style", Palatino, Georgia, serif',
  'SF Pro': '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'OpenDyslexic': '"OpenDyslexic", "Comic Sans MS", sans-serif',
  'Atkinson Hyperlegible': '"Atkinson Hyperlegible", Verdana, sans-serif'
};

// ============================================
// SIMPLE RSVP DISPLAY - Stable, no state conflicts
// ============================================
const RSVPWord = memo(({ 
  word, 
  fontSize, 
  fontFamily, 
  textColor, 
  accentColor 
}: {
  word: WordSpan;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  accentColor: string;
}) => {
  const text = word.text;
  
  // ORP calculation
  const orpIndex = text.length <= 1 ? 0 
    : text.length <= 5 ? 1 
    : text.length <= 9 ? 2 
    : text.length <= 13 ? 3 
    : Math.floor(text.length * 0.35);

  const before = text.slice(0, orpIndex);
  const pivot = text[orpIndex] || '';
  const after = text.slice(orpIndex + 1);

  return (
    <div 
      style={{ 
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'baseline',
        fontFamily,
        fontSize: `${fontSize}px`,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        width: '100%',
        maxWidth: '90vw'
      }}
    >
      <span style={{ color: textColor, textAlign: 'right', paddingRight: '2px' }}>
        {before}
      </span>
      <span style={{ color: accentColor, fontWeight: 700 }}>
        {pivot}
      </span>
      <span style={{ color: textColor, textAlign: 'left', paddingLeft: '2px' }}>
        {after}
      </span>
    </div>
  );
});

// ============================================
// SIMPLE PARAGRAPH - Minimal re-renders
// ============================================
const SimpleParagraph = memo(({ 
  text, 
  startIndex,
  isHighlighted,
  fontSize, 
  lineHeight,
  paragraphSpacing,
  fontFamily, 
  textColor,
  onClick
}: {
  text: string;
  startIndex: number;
  isHighlighted: boolean;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  fontFamily: string;
  textColor: string;
  onClick: () => void;
}) => {
  return (
    <p
      data-start={startIndex}
      onClick={onClick}
      style={{
        fontSize: `${fontSize}px`,
        lineHeight,
        marginBottom: `${paragraphSpacing}px`,
        marginTop: 0,
        fontFamily,
        color: textColor,
        textAlign: 'justify',
        hyphens: 'auto',
        WebkitHyphens: 'auto',
        textRendering: 'optimizeLegibility',
        cursor: 'pointer',
        opacity: isHighlighted ? 1 : 0.85,
        transition: 'opacity 0.2s ease'
      }}
    >
      {text}
    </p>
  );
});

// ============================================
// MAIN COMPONENT
// ============================================
export const StreamReader: React.FC<StreamReaderProps> = ({
  book,
  onToggleChrome,
  isActive,
  showGhostWords = true
}) => {
  const engine = StreamEngine.getInstance();
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Core state - minimal updates
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWord, setCurrentWord] = useState<WordSpan | null>(null);
  const [highlightedParagraph, setHighlightedParagraph] = useState(-1);
  
  // Refs to avoid stale closures
  const isPlayingRef = useRef(false);
  const positionRef = useRef(0);
  const ignoreScrollRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Font family CSS
  const fontFamilyCSS = FONT_STACKS[settings.fontFamily] || FONT_STACKS['SF Pro'];
  const rsvpFontSize = Math.min(settings.fontSize * 2.5, 60);

  // ============================================
  // PARAGRAPHS - Computed once on load
  // ============================================
  const paragraphs = useMemo(() => {
    if (!isReady) return [];
    
    const result: { text: string; startIndex: number }[] = [];
    const words = engine.getRange(0, engine.total);
    
    if (words.length === 0) return result;
    
    let currentPara: string[] = [];
    let currentStart = 0;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (currentPara.length === 0) {
        currentStart = word.index;
      }
      currentPara.push(word.text);
      
      // Check for paragraph break
      if (word.trailingPause === 3 || i === words.length - 1) {
        result.push({
          text: currentPara.join(' '),
          startIndex: currentStart
        });
        currentPara = [];
      }
    }
    
    return result;
  }, [isReady]);

  // ============================================
  // INITIALIZATION
  // ============================================
  useEffect(() => {
    if (!book.chapters || book.chapters.length === 0) {
      setIsReady(true);
      return;
    }

    setIsReady(false);

    // Extract text from chapters
    const chapters = [...book.chapters].sort((a, b) => a.sortOrder - b.sortOrder);
    const textParts: string[] = [];
    
    for (const chapter of chapters) {
      if (chapter.content) {
        const clean = chapter.content
          .replace(/<[^>]*>/g, ' ')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (clean) textParts.push(clean);
      }
    }
    
    const fullText = textParts.join('\n\n');
    engine.load(fullText);
    
    // Restore position
    if (book.lastTokenIndex !== undefined && book.lastTokenIndex > 0) {
      engine.position = Math.min(book.lastTokenIndex, engine.total - 1);
    } else if (book.bookmarkProgress && book.bookmarkProgress > 0) {
      engine.progress = book.bookmarkProgress;
    }
    
    engine.wpm = settings.rsvpSpeed || 300;
    positionRef.current = engine.position;
    setCurrentWord(engine.getCurrentWord());
    setIsReady(true);
    
    // Initial scroll
    requestAnimationFrame(() => {
      scrollToWord(engine.position, false);
    });
  }, [book.id]);

  // ============================================
  // ENGINE SUBSCRIPTION - Single listener
  // ============================================
  useEffect(() => {
    if (!isReady) return;

    const handlePosition = (pos: number) => {
      positionRef.current = pos;
      const word = engine.getWord(pos);
      setCurrentWord(word);
      
      // Find which paragraph this belongs to
      const paraIndex = paragraphs.findIndex((p, i) => {
        const nextStart = paragraphs[i + 1]?.startIndex ?? Infinity;
        return pos >= p.startIndex && pos < nextStart;
      });
      setHighlightedParagraph(paraIndex);
      
      // Save progress (debounced)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        TitanStorage.getInstance().saveBook({
          ...book,
          lastTokenIndex: pos,
          bookmarkProgress: engine.progress,
          lastOpened: new Date()
        });
      }, 500);
    };

    const handlePlayState = (playing: boolean) => {
      isPlayingRef.current = playing;
      setIsPlaying(playing);
      
      if (!playing) {
        // Immediate save when stopping
        TitanStorage.getInstance().saveBook({
          ...book,
          lastTokenIndex: engine.position,
          bookmarkProgress: engine.progress,
          lastOpened: new Date()
        });
      }
    };

    const unsubPos = engine.onPosition(handlePosition);
    const unsubPlay = engine.onPlayState(handlePlayState);
    
    // Sync initial state
    handlePosition(engine.position);
    handlePlayState(engine.isPlaying);
    
    return () => {
      unsubPos();
      unsubPlay();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [isReady, paragraphs, book]);

  // ============================================
  // SCROLL HELPERS
  // ============================================
  const scrollToWord = useCallback((pos: number, smooth: boolean) => {
    if (!scrollRef.current || !containerRef.current) return;
    
    ignoreScrollRef.current = true;
    
    // Find paragraph containing this position
    const paraIndex = paragraphs.findIndex((p, i) => {
      const nextStart = paragraphs[i + 1]?.startIndex ?? Infinity;
      return pos >= p.startIndex && pos < nextStart;
    });
    
    if (paraIndex >= 0) {
      const element = scrollRef.current.children[paraIndex] as HTMLElement;
      if (element) {
        const container = containerRef.current;
        const elementTop = element.offsetTop;
        const elementHeight = element.offsetHeight;
        const containerHeight = container.clientHeight;
        const targetY = elementTop - (containerHeight / 2) + (elementHeight / 2);
        
        container.scrollTo({
          top: Math.max(0, targetY),
          behavior: smooth ? 'smooth' : 'instant'
        });
      }
    }
    
    setTimeout(() => {
      ignoreScrollRef.current = false;
    }, smooth ? 400 : 50);
  }, [paragraphs]);

  // ============================================
  // HANDLERS
  // ============================================
  const handleParagraphTap = useCallback((startIndex: number) => {
    RSVPHapticEngine.impactLight();
    engine.position = startIndex;
    engine.play();
  }, []);

  const handleRSVPTap = useCallback(() => {
    RSVPHapticEngine.impactMedium();
    engine.toggle();
  }, []);

  const handleBackgroundTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Only toggle chrome if tapping on the background, not on paragraphs
    if ((e.target as HTMLElement).dataset?.start === undefined) {
      onToggleChrome();
    }
  }, [onToggleChrome]);

  // ============================================
  // RENDER: LOADING
  // ============================================
  if (!isReady) {
    return (
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: theme.background }}
      >
        <div className="flex flex-col items-center gap-4">
          <div 
            className="w-10 h-10 border-2 rounded-full animate-spin" 
            style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} 
          />
          <span className="text-sm lowercase tracking-wider" style={{ color: theme.secondaryText }}>
            loading
          </span>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: EMPTY
  // ============================================
  if (paragraphs.length === 0) {
    return (
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: theme.background }}
      >
        <div className="text-center px-8">
          <div className="text-5xl mb-4">📚</div>
          <p className="text-lg font-medium" style={{ color: theme.secondaryText }}>
            no content found
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: RSVP MODE (Playing)
  // ============================================
  if (isPlaying && currentWord) {
    return (
      <div 
        className="absolute inset-0 flex items-center justify-center select-none"
        style={{ backgroundColor: theme.background }}
        onClick={handleRSVPTap}
      >
        <RSVPWord
          word={currentWord}
          fontSize={rsvpFontSize}
          fontFamily={fontFamilyCSS}
          textColor={theme.primaryText}
          accentColor={theme.accent}
        />
        
        {/* Progress bar */}
        <div 
          className="absolute left-8 right-8 bottom-8 h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: theme.borderColor }}
        >
          <div 
            className="h-full rounded-full"
            style={{ 
              width: `${engine.progress * 100}%`,
              backgroundColor: theme.accent,
              opacity: 0.6,
              transition: 'width 100ms linear'
            }}
          />
        </div>
        
        {/* Tap to pause hint */}
        <div 
          className="absolute top-8 left-1/2 -translate-x-1/2 text-xs uppercase tracking-widest"
          style={{ color: theme.secondaryText, opacity: 0.4 }}
        >
          tap to pause
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: SCROLL MODE (Paused)
  // ============================================
  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-y-auto overflow-x-hidden"
      style={{ 
        backgroundColor: theme.background,
        WebkitOverflowScrolling: 'touch'
      }}
      onClick={handleBackgroundTap}
    >
      <div 
        ref={scrollRef}
        className="w-full min-h-full"
        style={{
          maxWidth: '65ch',
          margin: '0 auto',
          padding: '80px 24px 200px'
        }}
      >
        {paragraphs.map((para, idx) => (
          <SimpleParagraph
            key={para.startIndex}
            text={para.text}
            startIndex={para.startIndex}
            isHighlighted={idx === highlightedParagraph}
            fontSize={settings.fontSize}
            lineHeight={settings.lineHeight}
            paragraphSpacing={settings.paragraphSpacing}
            fontFamily={fontFamilyCSS}
            textColor={theme.primaryText}
            onClick={() => handleParagraphTap(para.startIndex)}
          />
        ))}
      </div>
    </div>
  );
};

export default StreamReader;
