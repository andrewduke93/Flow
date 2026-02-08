import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Book } from '../types';
import { StreamEngine } from '../services/streamEngine';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { TitanStorage } from '../services/titanStorage';
import { FlowBookProcessor, FlowBook, FlowWord, FlowParagraph } from '../services/flowBookProcessor';

interface FlowReaderProps {
  book: Book;
  onToggleChrome: () => void;
  isActive: boolean;
  showGhostWords?: boolean;
}

// ============================================
// PROPRIETARY FLOW WORD DISPLAY
// ============================================
const FlowWordSpan = React.memo(({
  word,
  fontSize,
  fontFamily,
  textColor,
  accentColor,
  isHighlighted,
  onClick
}: {
  word: FlowWord;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  accentColor: string;
  isHighlighted: boolean;
  onClick: (wordIndex: number) => void;
}) => {
  const text = word.text;

  // Use precomputed ORP
  const before = text.slice(0, word.orpIndex);
  const pivot = text[word.orpIndex] || '';
  const after = text.slice(word.orpIndex + 1);

  return (
    <span
      data-index={word.index}
      onClick={(e) => { e.stopPropagation(); onClick(word.index); }}
      className={`flow-word ${isHighlighted ? 'highlighted' : ''}`}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        marginRight: '0.25ch',
        padding: '0 0.15ch',
        borderRadius: 4,
        transition: 'all 0.15s ease',
        backgroundColor: isHighlighted ? 'rgba(255,215,0,0.08)' : 'transparent',
        fontSize: `${fontSize}px`,
        fontFamily,
        color: textColor,
        lineHeight: 1.4
      }}
    >
      <span style={{ color: textColor, opacity: 0.8 }}>{before}</span>
      <span style={{ color: accentColor, fontWeight: 700 }}>{pivot}</span>
      <span style={{ color: textColor, opacity: 0.8 }}>{after}</span>
    </span>
  );
});

// ============================================
// VIRTUAL PARAGRAPH - Only renders visible content
// ============================================
const VirtualParagraph = React.memo(({
  paragraph,
  fontSize,
  lineHeight,
  paragraphSpacing,
  fontFamily,
  textColor,
  accentColor,
  currentWordIndex,
  onWordClick
}: {
  paragraph: FlowParagraph;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  fontFamily: string;
  textColor: string;
  accentColor: string;
  currentWordIndex: number;
  onWordClick: (wordIndex: number) => void;
}) => {
  const isCurrentPara = currentWordIndex >= paragraph.startIndex && currentWordIndex <= paragraph.endIndex;

  return (
    <p
      data-start={paragraph.startIndex}
      className="flow-paragraph"
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
        opacity: isCurrentPara ? 1 : 0.85,
        transition: 'opacity 0.2s ease',
        cursor: 'text'
      }}
    >
      {paragraph.words.map((word) => (
        <FlowWordSpan
          key={word.index}
          word={word}
          fontSize={fontSize}
          fontFamily={fontFamily}
          textColor={textColor}
          accentColor={accentColor}
          isHighlighted={word.index === currentWordIndex}
          onClick={onWordClick}
        />
      ))}
    </p>
  );
});

// ============================================
// FLOW RSVP DISPLAY - Precomputed ORP, GPU accelerated
// ============================================
const FlowRSVP = React.memo(({
  currentWord,
  fontSize,
  fontFamily,
  textColor,
  accentColor
}: {
  currentWord: FlowWord | null;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  accentColor: string;
}) => {
  if (!currentWord) return null;

  const text = currentWord.text;

  // Use precomputed ORP - instant rendering
  const before = text.slice(0, currentWord.orpIndex);
  const pivot = text[currentWord.orpIndex] || '';
  const after = text.slice(currentWord.orpIndex + 1);

  return (
    <div
      className="flow-rsvp-display"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'baseline',
        fontFamily,
        fontSize: `${fontSize}px`,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        width: '100%',
        maxWidth: '90vw',
        willChange: 'transform', // GPU acceleration hint
        transform: 'translateZ(0)' // Force GPU layer
      }}
    >
      <span style={{ color: textColor, textAlign: 'right', paddingRight: '2px' }}>
        {before}
      </span>
      <span style={{
        color: accentColor,
        fontWeight: 700,
        textShadow: `0 0 8px ${accentColor}20` // Subtle glow effect
      }}>
        {pivot}
      </span>
      <span style={{ color: textColor, textAlign: 'left', paddingLeft: '2px' }}>
        {after}
      </span>
    </div>
  );
});

// ============================================
// MAIN FLOW READER - Proprietary high-performance implementation
// ============================================
export const FlowReader: React.FC<FlowReaderProps> = ({
  book,
  onToggleChrome,
  isActive,
  showGhostWords = true
}) => {
  const engine = StreamEngine.getInstance();
  const processor = FlowBookProcessor.getInstance();
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Core state - minimal updates
  const [flowBook, setFlowBook] = useState<FlowBook | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWord, setCurrentWord] = useState<FlowWord | null>(null);
  const [visibleParagraphs, setVisibleParagraphs] = useState<FlowParagraph[]>([]);
  
  // Loading state
  const [loadingPhase, setLoadingPhase] = useState<'extracting' | 'tokenizing' | 'optimizing' | 'ready'>('extracting');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);

  // Refs for performance
  const isPlayingRef = useRef(false);
  const positionRef = useRef(0);
  const ignoreScrollRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Virtual scrolling state
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Font configuration
  const fontFamilyCSS = {
    'New York': '"New York", "Iowan Old Style", Palatino, Georgia, serif',
    'SF Pro': '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'OpenDyslexic': '"OpenDyslexic", "Comic Sans MS", sans-serif',
    'Atkinson Hyperlegible': '"Atkinson Hyperlegible", Verdana, sans-serif'
  }[settings.fontFamily] || '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  const rsvpFontSize = Math.min(settings.fontSize * 2.5, 60);

  // ============================================
  // BOOK PROCESSING - Expensive but one-time
  // ============================================
  useEffect(() => {
    if (!book.chapters || book.chapters.length === 0) {
      setIsReady(true);
      return;
    }

    setIsReady(false);
    setLoadingPhase('extracting');
    setLoadingProgress(0);

    // Estimate processing time based on content length
    const totalContentLength = book.chapters.reduce((sum, ch) => sum + (ch.content?.length || 0), 0);
    const estimatedMs = Math.min(5000, Math.max(1000, totalContentLength * 0.1)); // 0.1ms per char, min 1s, max 5s
    setEstimatedTime(estimatedMs);

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
    setLoadingProgress(10);

    // Process with FlowBookProcessor - this is the expensive part
    processor.processBook(
      book.id, 
      book.title || 'Untitled', 
      fullText,
      (phase, progress) => {
        setLoadingPhase(phase as any);
        setLoadingProgress(progress);
      }
    ).then((processedBook) => {
      setFlowBook(processedBook);
      setLoadingProgress(100);
      setLoadingPhase('ready');

      engine.wpm = settings.rsvpSpeed || 300;
      positionRef.current = engine.position;
      setCurrentWord(processor.getWord(processedBook, engine.position));
      setIsReady(true);

      // Initial virtual scroll update
      updateVisibleParagraphs(processedBook, engine.position);
    });
  }, [book.id]);

  // ============================================
  // VIRTUAL SCROLLING - Only render visible paragraphs
  // ============================================
  const updateVisibleParagraphs = useCallback((book: FlowBook, currentPos: number) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const viewportHeight = container.clientHeight;
    const scrollTop = container.scrollTop;

    // Calculate which paragraphs are visible
    const paraHeight = settings.fontSize * settings.lineHeight + settings.paragraphSpacing;
    const visibleCount = Math.ceil(viewportHeight / paraHeight) + 2; // +2 for buffer

    const currentParaIndex = book.paragraphs.findIndex(p =>
      currentPos >= p.startIndex && currentPos <= p.endIndex
    );

    const startPara = Math.max(0, currentParaIndex - Math.floor(visibleCount / 2));
    const endPara = Math.min(book.paragraphs.length, startPara + visibleCount);

    const visible = book.paragraphs.slice(startPara, endPara);
    setVisibleParagraphs(visible);
  }, [settings.fontSize, settings.lineHeight, settings.paragraphSpacing]);

  // ============================================
  // ENGINE SUBSCRIPTION - Optimized listeners
  // ============================================
  useEffect(() => {
    if (!isReady || !flowBook) return;

    const handlePosition = (pos: number) => {
      positionRef.current = pos;
      const word = processor.getWord(flowBook, pos);
      setCurrentWord(word);

      // Update virtual scrolling
      updateVisibleParagraphs(flowBook, pos);

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
  }, [isReady, flowBook, updateVisibleParagraphs, book]);

  // ============================================
  // HANDLERS
  // ============================================
  const handleWordTap = useCallback((wordIndex: number) => {
    RSVPHapticEngine.impactLight();
    engine.position = wordIndex;
    engine.play();
  }, []);

  const handleRSVPTap = useCallback(() => {
    RSVPHapticEngine.impactMedium();
    engine.toggle();
  }, []);

  const handleBackgroundTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.flow-word')) return;
    onToggleChrome();
  }, [onToggleChrome]);

  const handleScroll = useCallback(() => {
    if (ignoreScrollRef.current || isPlaying || !flowBook) return;

    const container = containerRef.current;
    if (!container) return;

    const newScrollTop = container.scrollTop;
    setScrollTop(newScrollTop);

    // Calculate current position based on scroll
    const paraHeight = settings.fontSize * settings.lineHeight + settings.paragraphSpacing;
    const scrolledParas = Math.floor(newScrollTop / paraHeight);

    const targetPara = flowBook.paragraphs[scrolledParas];
    if (targetPara && targetPara.startIndex !== engine.position) {
      engine.position = targetPara.startIndex;
    }
  }, [flowBook, isPlaying, settings.fontSize, settings.lineHeight, settings.paragraphSpacing]);

  // ============================================
  // RENDER: LOADING
  // ============================================
  if (!isReady) {
    const phaseMessages = {
      extracting: 'Extracting text from chapters...',
      tokenizing: 'Analyzing word patterns...',
      optimizing: 'Optimizing for speed...',
      ready: 'Ready to read!'
    };

    const phaseIcons = {
      extracting: '📖',
      tokenizing: '🔍',
      optimizing: '⚡',
      ready: '✨'
    };

    return (
      <div
        className="absolute inset-0 flex items-center justify-center p-8"
        style={{ backgroundColor: theme.background }}
      >
        <div className="w-full max-w-md mx-auto">
          {/* Book Info Card */}
          <div
            className="bg-opacity-50 backdrop-blur-sm rounded-2xl p-6 mb-8 border"
            style={{
              backgroundColor: theme.surface || theme.background,
              borderColor: theme.borderColor,
              boxShadow: `0 8px 32px ${theme.accent}10`
            }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-16 bg-gradient-to-br rounded-lg flex items-center justify-center text-2xl"
                   style={{ background: `linear-gradient(135deg, ${theme.accent}20, ${theme.accent}40)` }}>
                📚
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate" style={{ color: theme.primaryText }}>
                  {book.title || 'Untitled Book'}
                </h3>
                {book.author && (
                  <p className="text-sm opacity-75 truncate" style={{ color: theme.secondaryText }}>
                    by {book.author}
                  </p>
                )}
                {book.chapters && (
                  <p className="text-xs opacity-60 mt-1" style={{ color: theme.secondaryText }}>
                    {book.chapters.length} chapter{book.chapters.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Processing Status */}
          <div className="text-center mb-8">
            <div className="text-4xl mb-4">{phaseIcons[loadingPhase]}</div>
            <h4 className="text-lg font-medium mb-2" style={{ color: theme.primaryText }}>
              {phaseMessages[loadingPhase]}
            </h4>
            {estimatedTime && loadingPhase !== 'ready' && (
              <p className="text-sm opacity-70" style={{ color: theme.secondaryText }}>
                ~{Math.ceil(estimatedTime / 1000)}s remaining
              </p>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-xs mb-2" style={{ color: theme.secondaryText }}>
              <span>Progress</span>
              <span>{loadingProgress}%</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: theme.borderColor }}
            >
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${loadingProgress}%`,
                  backgroundColor: theme.accent,
                  boxShadow: `0 0 10px ${theme.accent}40`
                }}
              />
            </div>
          </div>

          {/* Tips */}
          <div className="text-center">
            <p className="text-xs opacity-60 leading-relaxed" style={{ color: theme.secondaryText }}>
              First-time setup optimizes your book for lightning-fast reading.
              Future loads will be instant! ⚡
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: EMPTY
  // ============================================
  if (!flowBook || flowBook.paragraphs.length === 0) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: theme.background }}
      >
        <div className="text-center px-8">
          <div className="text-6xl mb-4">⚡</div>
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
        <FlowRSVP
          currentWord={currentWord}
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
  // RENDER: SCROLL MODE (Paused) - Virtual scrolling
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
      onScroll={handleScroll}
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
        {visibleParagraphs.map((para) => (
          <VirtualParagraph
            key={para.startIndex}
            paragraph={para}
            fontSize={settings.fontSize}
            lineHeight={settings.lineHeight}
            paragraphSpacing={settings.paragraphSpacing}
            fontFamily={fontFamilyCSS}
            textColor={theme.primaryText}
            accentColor={theme.accent}
            currentWordIndex={engine.position}
            onWordClick={handleWordTap}
          />
        ))}
      </div>
    </div>
  );
};

