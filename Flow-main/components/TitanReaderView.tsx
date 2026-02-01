import React, { useEffect, useRef, useState, useMemo, memo, useCallback, useLayoutEffect } from 'react';
import { Book, RSVPToken } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { useTitanTheme, TitanThemeColors } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';

interface TitanReaderViewProps {
  book: Book;
  onToggleChrome: () => void;
  onRequestRSVP?: (startOffset: number, tokenIndex: number) => void; 
  isActive: boolean;
}

/**
 * StaticParagraph - Optimized for reading comfort
 * Book-like typography with proper justification and hyphenation
 */
const StaticParagraph = memo(({
    text,
    fontSize,
    lineHeight,
    paragraphSpacing,
    fontFamily,
    textColor,
    startTokenIndex,
    onParagraphClick
}: {
    text: string,
    fontSize: number,
    lineHeight: number,
    paragraphSpacing: number,
    fontFamily: string,
    textColor: string,
    startTokenIndex: number,
    onParagraphClick: (startTokenIndex: number) => void
}) => {
    return (
        <p
            id={`p-${startTokenIndex}`}
            data-start-index={startTokenIndex}
            onClick={() => onParagraphClick(startTokenIndex)}
            className="reader-paragraph cursor-pointer transition-opacity hover:opacity-100"
            style={{
                fontSize: `${fontSize}px`,
                lineHeight: lineHeight,
                marginBottom: `${paragraphSpacing}px`,
                fontFamily: fontFamily === 'New York' ? '"New York", "Iowan Old Style", Georgia, serif' : 
                           fontFamily === 'OpenDyslexic' ? '"OpenDyslexic", sans-serif' :
                           fontFamily === 'Atkinson Hyperlegible' ? '"Atkinson Hyperlegible", sans-serif' :
                           'system-ui, -apple-system, sans-serif',
                color: textColor,
                opacity: 0.92,
                // Book-quality typography
                textAlign: 'justify',
                textJustify: 'inter-word',
                hyphens: 'auto',
                WebkitHyphens: 'auto',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                // Optical adjustments
                letterSpacing: '-0.01em',
                wordSpacing: '0.02em',
                fontKerning: 'normal',
                fontVariantLigatures: 'common-ligatures',
                textRendering: 'optimizeLegibility',
                WebkitFontSmoothing: 'antialiased'
            }}
        >
            {text}
        </p>
    );
});

/**
 * ParagraphChunk - Interactive version with word highlighting
 */
const ParagraphChunk = memo(({ 
  tokens, 
  activeIndex, 
  onWordClick,
  fontSize,
  lineHeight,
  paragraphSpacing,
  fontFamily,
  theme,
  startTokenIndex
}: { 
  tokens: RSVPToken[], 
  activeIndex: number, 
  onWordClick: (index: number, startOffset: number) => void,
  fontSize: number,
  lineHeight: number,
  paragraphSpacing: number,
  fontFamily: string,
  theme: TitanThemeColors,
  startTokenIndex: number
}) => {
  
  const handleDelegatedClick = useCallback((e: React.MouseEvent<HTMLParagraphElement>) => {
      const target = e.target as HTMLElement;
      if (target.dataset.idx) {
          e.stopPropagation();
          const idx = parseInt(target.dataset.idx || "-1");
          const offset = parseInt(target.dataset.off || "0");
          if (idx >= 0) onWordClick(idx, offset);
      }
  }, [onWordClick]);

  return (
    <p 
      id={`p-${startTokenIndex}`}
      data-start-index={startTokenIndex}
      onClick={handleDelegatedClick}
      className="reader-paragraph"
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: lineHeight,
        marginBottom: `${paragraphSpacing}px`,
        fontFamily: fontFamily === 'New York' ? '"New York", "Iowan Old Style", Georgia, serif' : 
                   fontFamily === 'OpenDyslexic' ? '"OpenDyslexic", sans-serif' :
                   fontFamily === 'Atkinson Hyperlegible' ? '"Atkinson Hyperlegible", sans-serif' :
                   'system-ui, -apple-system, sans-serif',
        opacity: 0.92,
        textAlign: 'justify',
        textJustify: 'inter-word',
        hyphens: 'auto',
        WebkitHyphens: 'auto',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        letterSpacing: '-0.01em',
        wordSpacing: '0.02em',
        fontKerning: 'normal',
        fontVariantLigatures: 'common-ligatures',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased'
      }}
    >
      {tokens.map((token) => {
         const isActive = token.globalIndex === activeIndex;
         return (
           <React.Fragment key={token.id}>
             <span
               id={`w-${token.globalIndex}`} 
               data-idx={token.globalIndex}
               data-off={token.startOffset}
               className="inline rounded-sm cursor-pointer select-none transition-colors duration-150"
               style={{
                 backgroundColor: isActive ? theme.accent : 'transparent',
                 color: isActive ? '#FFFFFF' : 'inherit',
                 padding: isActive ? '0.1em 0.15em' : '0',
                 margin: isActive ? '-0.1em -0.15em' : '0',
                 boxDecorationBreak: 'clone',
                 WebkitBoxDecorationBreak: 'clone'
               }}
             >
               {token.originalText}
             </span>
             {" "}
           </React.Fragment>
         )
      })}
    </p>
  );
});

/**
 * ParagraphSection - Groups paragraphs for efficient rendering
 */
const ParagraphSection = memo(({ 
    sectionIndex,
    paragraphs, 
    activeParagraphIndex, 
    activeIndex, 
    onWordClick, 
    onParagraphClick,
    fontSize,
    lineHeight,
    paragraphSpacing,
    fontFamily,
    theme 
}: {
    sectionIndex: number,
    paragraphs: any[],
    activeParagraphIndex: number,
    activeIndex: number,
    onWordClick: any,
    onParagraphClick: any,
    fontSize: number,
    lineHeight: number,
    paragraphSpacing: number,
    fontFamily: string,
    theme: TitanThemeColors
}) => {
    return (
        <div>
            {paragraphs.map((p, i) => {
                const globalIndex = sectionIndex * 30 + i;
                const isActiveWindow = Math.abs(globalIndex - activeParagraphIndex) <= 1;

                if (isActiveWindow) {
                    return (
                        <ParagraphChunk 
                            key={globalIndex}
                            startTokenIndex={p.startIndex}
                            tokens={p.tokens} 
                            activeIndex={activeIndex}
                            onWordClick={onWordClick}
                            fontSize={fontSize}
                            lineHeight={lineHeight}
                            paragraphSpacing={paragraphSpacing}
                            fontFamily={fontFamily}
                            theme={theme}
                        />
                    );
                } else {
                    return (
                        <StaticParagraph 
                            key={globalIndex}
                            text={p.plainText}
                            fontSize={fontSize}
                            lineHeight={lineHeight}
                            paragraphSpacing={paragraphSpacing}
                            fontFamily={fontFamily}
                            textColor={theme.primaryText}
                            startTokenIndex={p.startIndex}
                            onParagraphClick={onParagraphClick}
                        />
                    );
                }
            })}
        </div>
    );
});

/**
 * TitanReaderView - Premium Reading Experience
 * 
 * Features:
 * - Book-quality typography with justification
 * - Universal pinch-to-zoom for text size
 * - Smooth scroll tracking
 * - Word-level interaction for RSVP entry
 */
export const TitanReaderView: React.FC<TitanReaderViewProps> = ({ book, onToggleChrome, onRequestRSVP, isActive }) => {
  const core = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const theme = useTitanTheme();
  const { settings, updateSettings } = useTitanSettings();
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);
  const [isReady, setIsReady] = useState(false); 
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isRestored, setIsRestored] = useState(false);
  const isProgrammaticScroll = useRef(false);

  // Pinch-to-zoom state
  const initialPinchDistance = useRef<number | null>(null);
  const initialFontSize = useRef<number>(settings.fontSize);

  const pendingJumpIndex = useRef<number | null>(null);

  const updateActiveIndex = useCallback((idx: number) => {
      setActiveIndex(idx);
      activeIndexRef.current = idx;
  }, []);

  // Scroll to token
  const scrollToToken = useCallback((index: number, smooth: boolean) => {
      if (!containerRef.current) return;
      
      let element = document.getElementById(`w-${index}`);
      
      if (!element) {
          const allParas = Array.from(containerRef.current.querySelectorAll('p[data-start-index]')) as HTMLElement[];
          let best: HTMLElement | null = null;
          let bestStart = -1;
          
          for (const p of allParas) {
              const s = parseInt(p.dataset.startIndex || "-1");
              if (s <= index && s > bestStart) {
                  best = p;
                  bestStart = s;
              }
          }
          element = best;
      }

      if (!element) {
          if (core.totalTokens > 0) {
             const ratio = index / core.totalTokens;
             const totalH = containerRef.current.scrollHeight;
             const targetY = totalH * ratio;
             containerRef.current.scrollTo({ top: targetY, behavior: smooth ? 'smooth' : 'instant' });
          }
          return;
      }

      isProgrammaticScroll.current = true;
      const container = containerRef.current;
      const opticalCenter = container.clientHeight * 0.15; 
      
      let offsetTop = element.offsetTop;
      let parent = element.offsetParent as HTMLElement;
      while (parent && parent !== container) {
          offsetTop += parent.offsetTop;
          parent = parent.offsetParent as HTMLElement;
      }

      const targetScroll = offsetTop - opticalCenter;
      container.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: smooth ? 'smooth' : 'instant'
      });

      setTimeout(() => {
          isProgrammaticScroll.current = false;
      }, smooth ? 600 : 100);
  }, []);

  // Pinch-to-zoom handlers
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance.current = Math.sqrt(dx * dx + dy * dy);
      initialFontSize.current = settings.fontSize;
    }
  }, [settings.fontSize]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      
      const scale = currentDistance / initialPinchDistance.current;
      const newFontSize = Math.round(Math.max(12, Math.min(40, initialFontSize.current * scale)));
      
      if (newFontSize !== settings.fontSize) {
        updateSettings({ fontSize: newFontSize });
      }
    }
  }, [settings.fontSize, updateSettings]);

  const handleTouchEnd = useCallback(() => {
    initialPinchDistance.current = null;
  }, []);

  // Setup pinch-to-zoom listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Initialization
  useEffect(() => {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    setIsReady(false); 
    setIsRestored(false); 
    isProgrammaticScroll.current = true;
    
    const coreIndex = (core.currentBook?.id === book.id) ? core.currentBook.lastTokenIndex : undefined;
    const initialIndex = coreIndex ?? book.lastTokenIndex;
    
    if (initialIndex !== undefined) {
        updateActiveIndex(initialIndex);
    }

    const progressUnsub = core.subscribe(() => {
        setLoadingProgress(core.loadingProgress);
    });
    
    const init = async () => {
      setIsReady(false);
      setIsRestored(false);
      setLoadingProgress(0);
      setTokens([]);

      if (!book.chapters || book.chapters.length === 0) {
          console.error("[TitanReaderView] Book has no chapters!", { bookId: book.id, title: book.title });
          setIsReady(true);
          setIsRestored(true);
          return;
      }

      try {
          await core.load(book);
          const fullText = core.contentStorage.string;
          await conductor.prepare(fullText, { progress: 0 }); 
      } catch (e) {
          console.error("[TitanReaderView] Initialization failed:", e);
      } finally {
          const loadedTokens = heartbeat.tokens;
          setTokens(loadedTokens);
          setIsReady(true);
          requestAnimationFrame(() => {
              setIsRestored(true);
          });
      }
    };

    init();
    return () => progressUnsub();
  }, [book.id, updateActiveIndex]);

  // Live sync
  useEffect(() => {
      const handleCoreUpdate = () => {
          const targetIndex = core.currentBook?.lastTokenIndex;
          if (targetIndex === undefined) return;
          
          const diff = Math.abs(targetIndex - activeIndexRef.current);
          
          if (diff > 0) {
              updateActiveIndex(targetIndex);
              if (diff > 10) {
                   const useSmooth = core.isRSVPMode;
                   scrollToToken(targetIndex, useSmooth);
              }
          }
      };

      const unsub = core.onJump(handleCoreUpdate);
      return () => unsub();
  }, [updateActiveIndex, scrollToToken]);

  // Initial scroll restoration
  useLayoutEffect(() => {
      if (!isReady || !isRestored || tokens.length === 0) return;
      
      const targetIndex = activeIndex >= 0 ? activeIndex : (book.lastTokenIndex ?? 0);
      if (targetIndex > 0) {
          requestAnimationFrame(() => {
              scrollToToken(targetIndex, false);
              isProgrammaticScroll.current = false;
          });
      } else {
          isProgrammaticScroll.current = false;
      }
  }, [isReady, isRestored, tokens.length]);

  // Scroll tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isRestored || tokens.length === 0) return;
    
    let ticking = false;

    const handleScroll = () => {
      if (isProgrammaticScroll.current || ticking) return;
      
      ticking = true;
      requestAnimationFrame(() => {
        if (!isProgrammaticScroll.current && container) {
          const scrollPct = container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight);
          const newIndex = Math.floor(scrollPct * (tokens.length - 1));
          
          if (Math.abs(newIndex - activeIndexRef.current) > 50) {
            updateActiveIndex(newIndex);
            core.saveProgress(newIndex);
          }
        }
        ticking = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isRestored, tokens.length, updateActiveIndex]);

  // Paragraph grouping
  const paragraphs = useMemo(() => {
    if (tokens.length === 0) return [];
    
    const result: { tokens: RSVPToken[], startIndex: number, plainText: string }[] = [];
    let currentPara: RSVPToken[] = [];
    let startIndex = -1;
    
    for (const token of tokens) {
      if (startIndex === -1) startIndex = token.globalIndex;
      currentPara.push(token);
      
      if (token.isParagraphEnd) {
        result.push({ 
            tokens: currentPara, 
            startIndex, 
            plainText: currentPara.map(t => t.originalText).join(" ") 
        });
        currentPara = [];
        startIndex = -1;
      }
    }
    if (currentPara.length > 0) {
        result.push({ 
            tokens: currentPara, 
            startIndex: startIndex === -1 ? 0 : startIndex,
            plainText: currentPara.map(t => t.originalText).join(" ")
        });
    }
    return result;
  }, [tokens]);
  
  const handleWordClick = useCallback((index: number, startOffset: number) => {
    updateActiveIndex(index);
    core.saveProgress(index);
    if (onRequestRSVP) onRequestRSVP(startOffset, index);
  }, [onRequestRSVP, updateActiveIndex]);

  const handleParagraphClick = useCallback((startIndex: number) => {
      updateActiveIndex(startIndex);
      core.saveProgress(startIndex);
  }, [updateActiveIndex]);
  
  const activeParagraphIndex = useMemo(() => {
      return paragraphs.findIndex(p => 
          activeIndex >= p.startIndex && 
          activeIndex < (p.startIndex + p.tokens.length)
      );
  }, [paragraphs, activeIndex]);

  const sections = useMemo(() => {
      const result = [];
      for (let i = 0; i < paragraphs.length; i += 30) {
          result.push(paragraphs.slice(i, i + 30));
      }
      return result;
  }, [paragraphs]);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-10 w-full h-full overflow-y-auto overflow-x-hidden custom-scrollbar"
      style={{ 
        backgroundColor: theme.background,
        color: theme.primaryText,
        scrollBehavior: 'auto', 
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y pinch-zoom',
        overscrollBehaviorY: 'contain',
        transform: 'translateZ(0)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onToggleChrome();
      }}
    >
      {/* Loading Overlay */}
      {!isReady && (
          <div 
              className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-auto"
              style={{ backgroundColor: theme.background }}
          >
              <div className="flex flex-col items-center gap-6">
                  <div className="w-12 h-12 relative">
                       <div className="absolute inset-0 rounded-full border-2 opacity-20" style={{ borderColor: theme.accent }} />
                       <div 
                          className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin" 
                          style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} 
                       />
                  </div>
                  <div className="flex flex-col items-center">
                      <span className="text-sm font-bold tracking-widest lowercase" style={{ color: theme.secondaryText }}>loading</span>
                      <span className="text-xs font-mono mt-1 opacity-50" style={{ color: theme.primaryText }}>{Math.floor(loadingProgress * 100)}%</span>
                  </div>
              </div>
          </div>
      )}

      {/* Empty State */}
      {isReady && tokens.length === 0 && (
          <div 
              className="fixed inset-0 flex items-center justify-center z-[50] pointer-events-auto"
              style={{ backgroundColor: theme.background }}
          >
              <div className="flex flex-col items-center gap-4 px-8 text-center">
                  <div className="text-4xl opacity-30">📖</div>
                  <span className="text-lg font-medium" style={{ color: theme.secondaryText }}>No content available</span>
                  <span className="text-sm opacity-60" style={{ color: theme.secondaryText }}>This book appears to be empty or failed to load.</span>
              </div>
          </div>
      )}

      {/* Content */}
      <div 
        className="w-full min-h-[100dvh] box-border relative"
        style={{
          // Optimal reading width with generous padding
          maxWidth: '680px',
          margin: '0 auto',
          padding: '80px 24px 160px 24px'
        }}
      >
           {sections.map((section, idx) => (
               <ParagraphSection 
                  key={idx}
                  sectionIndex={idx}
                  paragraphs={section}
                  activeParagraphIndex={activeParagraphIndex}
                  activeIndex={activeIndex}
                  onWordClick={handleWordClick}
                  onParagraphClick={handleParagraphClick}
                  fontSize={settings.fontSize}
                  lineHeight={settings.lineHeight}
                  paragraphSpacing={settings.paragraphSpacing}
                  fontFamily={settings.fontFamily}
                  theme={theme}
               />
           ))}
           <div className="h-[40vh]" /> 
      </div>

      {/* Font size indicator during pinch */}
      {initialPinchDistance.current !== null && (
        <div 
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 rounded-2xl shadow-2xl z-[200] backdrop-blur-xl"
          style={{ backgroundColor: `${theme.surface}ee`, border: `1px solid ${theme.borderColor}` }}
        >
          <span className="text-2xl font-bold" style={{ color: theme.primaryText }}>{settings.fontSize}px</span>
        </div>
      )}
    </div>
  );
};
