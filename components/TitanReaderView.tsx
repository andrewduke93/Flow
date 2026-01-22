import React, { useEffect, useRef, useState, useMemo, memo, useCallback, useLayoutEffect } from 'react';
import { Book, RSVPToken } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { useTitanTheme, TitanThemeColors } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { motion, AnimatePresence } from 'framer-motion';

interface TitanReaderViewProps {
  book: Book;
  onToggleChrome: () => void;
  onRequestRSVP?: (startOffset: number, tokenIndex: number) => void; 
}

/**
 * LightweightWord
 * Renders a single interactive word token.
 */
const LightweightWord = memo(({ 
  token, 
  isActive, 
  theme
}: { 
  token: RSVPToken, 
  isActive: boolean, 
  theme: TitanThemeColors
}) => {
  return (
    <span
      id={`w-${token.globalIndex}`} 
      data-idx={token.globalIndex}
      data-off={token.startOffset}
      className={`inline py-0.5 rounded-[2px] cursor-pointer select-none transition-colors duration-200 ${isActive ? '' : 'hover:opacity-60'}`}
      style={{
          backgroundColor: isActive ? theme.accent : 'transparent',
          color: isActive ? '#FFFFFF' : 'inherit',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone'
      }}
    >
      {token.originalText}
    </span>
  );
});

/**
 * StaticParagraph
 * Optimization: Renders text as a simple string for paragraphs outside the active window.
 * Added: Text Justification and Hyphenation for book-like rendering.
 */
const StaticParagraph = memo(({
    text,
    settings,
    startTokenIndex,
    onParagraphClick
}: {
    text: string,
    settings: any,
    startTokenIndex: number,
    onParagraphClick: (startTokenIndex: number) => void
}) => {
    return (
        <p
            id={`p-${startTokenIndex}`}
            data-start-index={startTokenIndex}
            onClick={() => onParagraphClick(startTokenIndex)}
            className="max-w-[60ch] mx-auto box-border relative cursor-pointer hover:opacity-100 transition-opacity scroll-mt-32"
            style={{
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                marginBottom: settings.paragraphSpacing,
                fontFamily: settings.fontFamily === 'New York' ? 'serif' : 'sans-serif',
                color: 'inherit',
                opacity: 0.9,
                whiteSpace: 'pre-line', 
                textAlign: 'justify',
                hyphens: 'auto',
                WebkitHyphens: 'auto',
                contentVisibility: 'auto',
                containIntrinsicSize: '0 100px'
            }}
        >
            {text}
        </p>
    );
});

/**
 * ParagraphChunk
 * The expensive, interactive version.
 */
const ParagraphChunk = memo(({ 
  tokens, 
  activeIndex, 
  onWordClick,
  settings,
  theme,
  startTokenIndex
}: { 
  tokens: RSVPToken[], 
  activeIndex: number, 
  onWordClick: (index: number, startOffset: number) => void,
  settings: any,
  theme: TitanThemeColors,
  startTokenIndex: number
}) => {
  
  const handleDelegatedClick = useCallback((e: React.MouseEvent<HTMLParagraphElement>) => {
      const target = e.target as HTMLElement;
      if (target.dataset.idx) {
          e.stopPropagation();
          const idx = parseInt(target.dataset.idx || "-1");
          const offset = parseInt(target.dataset.off || "0");
          if (idx >= 0) {
              onWordClick(idx, offset);
          }
      }
  }, [onWordClick]);

  return (
    <p 
      id={`p-${startTokenIndex}`}
      data-start-index={startTokenIndex}
      onClick={handleDelegatedClick}
      className="max-w-[60ch] mx-auto box-border relative scroll-mt-32"
      style={{
        fontSize: `${settings.fontSize}px`,
        lineHeight: settings.lineHeight,
        marginBottom: settings.paragraphSpacing,
        fontFamily: settings.fontFamily === 'New York' ? 'serif' : 'sans-serif',
        opacity: 0.9,
        whiteSpace: 'pre-line',
        textAlign: 'justify',
        hyphens: 'auto',
        WebkitHyphens: 'auto',
      }}
    >
      {tokens.map((token, i) => {
         return (
           <React.Fragment key={token.id}>
             <LightweightWord 
                token={token} 
                isActive={token.globalIndex === activeIndex} 
                theme={theme}
             />
             {" "}
           </React.Fragment>
         )
      })}
    </p>
  );
});

/**
 * TitanReaderView (Nuclear Option Edition)
 */
export const TitanReaderView: React.FC<TitanReaderViewProps> = ({ book, onToggleChrome, onRequestRSVP }) => {
  const core = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1); // Stable ref
  const [isReady, setIsReady] = useState(false); 
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  const [isRestored, setIsRestored] = useState(false);
  const isProgrammaticScroll = useRef(false);
  
  // Intersection Observer for Smooth Scroll Tracking
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Sync Ref signal
  const pendingJumpIndex = useRef<number | null>(null);

  const updateActiveIndex = useCallback((idx: number) => {
      setActiveIndex(idx);
      activeIndexRef.current = idx;
  }, []);

  // SCROLL ENGINE: The critical piece for navigation
  const scrollToToken = useCallback((index: number, smooth: boolean) => {
      if (!containerRef.current) return;
      
      // 1. Try to find the specific word span (only exists if near active window)
      let element = document.getElementById(`w-${index}`);
      
      // 2. FALLBACK: If word not rendered (StaticParagraph), find the paragraph container
      if (!element) {
          // We look for the paragraph with the largest start-index that is <= index
          const allParas = Array.from(containerRef.current.querySelectorAll('p[data-start-index]')) as HTMLElement[];
          let best: HTMLElement | null = null;
          let bestStart = -1;
          
          for (const p of allParas) {
              const s = parseInt(p.dataset.startIndex || "-1");
              // Find the paragraph that *contains* this index (starts before or at it)
              if (s <= index && s > bestStart) {
                  best = p;
                  bestStart = s;
              }
          }
          element = best;
      }

      if (!element) {
          // Last resort: Just scroll percentage if DOM is missing (rare but possible on load)
          // We calculate approximate height based on token ratio
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
      // Offset by 15% of screen height to place text comfortably near top but not hidden
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

      // Release lock after animation
      setTimeout(() => {
          isProgrammaticScroll.current = false;
      }, smooth ? 600 : 100);

  }, []);

  // -- 1. Initialization --
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
      await core.load(book);
      const fullText = core.contentStorage.string;
      try {
          await conductor.prepare(fullText, { progress: 0 }); 
      } catch (e) {}
      
      setTokens(heartbeat.tokens);
      setIsReady(true);
    };

    init();
    return () => progressUnsub();
  }, [book.id, updateActiveIndex]);

  // -- 2. LIVE SYNC (Core -> View) --
  useEffect(() => {
      const handleCoreUpdate = () => {
          if (!core.isRSVPMode && core.currentBook?.lastTokenIndex !== undefined) {
              const targetIndex = core.currentBook.lastTokenIndex;
              
              // CRITICAL: Detect Jumps
              const diff = Math.abs(targetIndex - activeIndexRef.current);
              
              if (diff > 0) {
                  updateActiveIndex(targetIndex);
                  
                  // Only trigger auto-scroll if it's a significant jump
                  if (diff > 10) {
                       scrollToToken(targetIndex, false); // Instant snap for responsiveness
                  }
              }
          }
      };
      const unsub = core.subscribe(handleCoreUpdate);
      return unsub;
  }, [updateActiveIndex, scrollToToken]);

  // -- 3. RESTORATION --
  useLayoutEffect(() => {
      if (!isReady || tokens.length === 0) return;

      const performRestoration = () => {
          const targetIndex = (core.currentBook?.id === book.id ? core.currentBook.lastTokenIndex : book.lastTokenIndex) ?? -1;
          if (targetIndex <= 10) {
              if (containerRef.current) containerRef.current.scrollTop = 0;
              setTimeout(() => { setIsRestored(true); isProgrammaticScroll.current = false; }, 100);
          } else {
             scrollToToken(targetIndex, false);
             setTimeout(() => setIsRestored(true), 100);
          }
      };
      requestAnimationFrame(performRestoration);
  }, [isReady, tokens.length, book.id, scrollToToken]);

  // -- 4. SCROLL TRACKING (OBSERVER) --
  useEffect(() => {
    if (!isRestored || core.isRSVPMode) return;

    if (observerRef.current) observerRef.current.disconnect();

    const callback = (entries: IntersectionObserverEntry[]) => {
        if (isProgrammaticScroll.current) return;

        // Find the first element intersecting the optical zone (top 30%)
        for (const entry of entries) {
            if (entry.isIntersecting) {
                const target = entry.target as HTMLElement;
                const idx = parseInt(target.dataset.startIndex || "-1");
                if (idx >= 0) {
                    updateActiveIndex(idx);
                    core.saveProgress(idx);
                    break;
                }
            }
        }
    };

    const options = {
        root: containerRef.current,
        // Active zone is between 10% and 40% of view height.
        rootMargin: '-10% 0px -60% 0px', 
        threshold: 0
    };

    observerRef.current = new IntersectionObserver(callback, options);

    const paragraphs = containerRef.current?.querySelectorAll('p[data-start-index]');
    paragraphs?.forEach(p => observerRef.current?.observe(p));

    return () => observerRef.current?.disconnect();

  }, [isRestored, tokens.length, updateActiveIndex]);

  // -- 5. Memoized Paragraphs --
  const paragraphs = useMemo(() => {
    const result: { tokens: RSVPToken[], startIndex: number, plainText: string }[] = [];
    let currentPara: RSVPToken[] = [];
    let startIndex = -1;

    for (const token of tokens) {
      if (currentPara.length === 0) startIndex = token.globalIndex;
      currentPara.push(token);
      
      if (token.isParagraphEnd) {
        result.push({ 
            tokens: currentPara, 
            startIndex, 
            plainText: currentPara.map(t => t.originalText).join(" ") 
        });
        currentPara = [];
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

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-10 w-full h-full overflow-y-auto overflow-x-hidden custom-scrollbar box-border"
      style={{ 
        backgroundColor: theme.background,
        color: theme.primaryText,
        scrollBehavior: 'auto', 
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        overscrollBehaviorY: 'contain',
        transform: 'translateZ(0)',
        opacity: isRestored ? 1 : 0, 
        transition: 'opacity 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onToggleChrome();
      }}
    >
      {/* LOADING OVERLAY */}
      <AnimatePresence>
        {(!isReady || !isRestored) && (
            <motion.div 
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
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
                        <span className="text-sm font-bold tracking-widest uppercase lowercase" style={{ color: theme.secondaryText }}>ingesting</span>
                        <span className="text-xs font-mono mt-1 opacity-50" style={{ color: theme.primaryText }}>{Math.floor(loadingProgress * 100)}%</span>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full min-h-[100dvh] px-6 md:px-0 py-24 md:py-32 box-border relative">
           {paragraphs.map((p, i) => {
             const isActiveWindow = Math.abs(i - activeParagraphIndex) <= 1;

             if (isActiveWindow) {
                 return (
                    <ParagraphChunk 
                        key={i}
                        startTokenIndex={p.startIndex}
                        tokens={p.tokens} 
                        activeIndex={activeIndex}
                        onWordClick={handleWordClick}
                        settings={settings}
                        theme={theme}
                    />
                 );
             } else {
                 return (
                     <StaticParagraph 
                        key={i}
                        text={p.plainText}
                        settings={settings}
                        startTokenIndex={p.startIndex}
                        onParagraphClick={handleParagraphClick}
                     />
                 );
             }
           })}
           <div className="h-[40vh]" /> 
      </div>
    </div>
  );
};