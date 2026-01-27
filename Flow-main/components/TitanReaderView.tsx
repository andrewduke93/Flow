import { FixedSizeList as List } from 'react-window';
import React, { useEffect, useRef, useState, useMemo, memo, useCallback, useLayoutEffect } from 'react';
import { Book, RSVPToken } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor } from '../services/rsvpConductor';
import { useTitanTheme, TitanThemeColors } from '../services/titanTheme';
import { newRsvpEngine } from '../services/newRsvpEngine';
import { useTitanSettings } from '../services/configService';

interface TitanReaderViewProps {
  book: Book;
  onToggleChrome: () => void;
  onRequestRSVP?: (startOffset: number, tokenIndex: number) => void; 
  isActive: boolean; // New prop for hibernation
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
                WebkitHyphens: 'auto'
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
 * ParagraphSection
 * Groups paragraphs to reduce React reconciliation overhead on long books.
 */
const ParagraphSection = memo(({ 
    sectionIndex,
    paragraphs, 
    activeParagraphIndex, 
    activeIndex, 
    onWordClick, 
    onParagraphClick,
    settings, 
    theme 
}: {
    sectionIndex: number,
    paragraphs: any[],
    activeParagraphIndex: number,
    activeIndex: number,
    onWordClick: any,
    onParagraphClick: any,
    settings: any,
    theme: any
}) => {
    // Optimization: Skip rendering entirely if far from active window
    // This is "soft virtualization" - keeps DOM structure but skips React work
    const isSectionActive = Math.abs(sectionIndex - Math.floor(activeParagraphIndex / 30)) <= 2;
    
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
                            settings={settings}
                            theme={theme}
                        />
                    );
                } else {
                    return (
                        <StaticParagraph 
                            key={globalIndex}
                            text={p.plainText}
                            settings={settings}
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
 * TitanReaderView (Nuclear Option Edition)
 */
export const TitanReaderView: React.FC<TitanReaderViewProps> = ({ book, onToggleChrome, onRequestRSVP, isActive }) => {
    // Book open performance logging
    useEffect(() => {
        console.log('[TitanReaderView] Book open effect triggered for', book.title, 'at', new Date().toISOString());
        const t0 = performance.now();
        return () => {
            const t1 = performance.now();
            console.log(`[TitanReaderView] Book open effect cleanup for ${book.title} after ${(t1-t0).toFixed(2)}ms`);
        };
    }, [book.id]);
  const core = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1); // Stable ref
    const [isReady, setIsReady] = useState(false); 
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [tokenizing, setTokenizing] = useState(false);
    const [tokenizeProgress, setTokenizeProgress] = useState(0);
    const [loadingPhase, setLoadingPhase] = useState<'book' | 'tokenize'>('book');
    const [animatedDots, setAnimatedDots] = useState('');
    // Track if book loading and tokenization are both complete
    const [bookLoaded, setBookLoaded] = useState(false);
    const [tokenizationDone, setTokenizationDone] = useState(false);
    // Animated dots for loading engagement
    useEffect(() => {
        if (!isReady) {
            const interval = setInterval(() => {
                setAnimatedDots((prev) => prev.length < 3 ? prev + '.' : '');
            }, 400);
            return () => clearInterval(interval);
        }
    }, [isReady]);
  
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
    // Debounced and batched scrollToToken to avoid forced reflows/layout thrash
    const scrollToTokenQueue = useRef<{index: number, smooth: boolean} | null>(null);
    const scrollToTokenTimer = useRef<number | null>(null);
    const isScrollingFrame = useRef(false);

    const scrollToToken = useCallback((index: number, smooth: boolean) => {
        // Always keep only the latest scroll request
        scrollToTokenQueue.current = { index, smooth };
        if (scrollToTokenTimer.current) {
            clearTimeout(scrollToTokenTimer.current);
        }
        // Batch scrolls: perform after 1 animation frame (or 16ms)
        scrollToTokenTimer.current = window.setTimeout(() => {
            if (isScrollingFrame.current) return; // Prevent multiple in one frame
            isScrollingFrame.current = true;
            requestAnimationFrame(() => {
                const req = scrollToTokenQueue.current;
                scrollToTokenQueue.current = null;
                if (!req || !containerRef.current) {
                    isScrollingFrame.current = false;
                    return;
                }
                let { index, smooth } = req;
                // 1. Try to find the specific word span (only exists if near active window)
                let element = document.getElementById(`w-${index}`);
                // 2. FALLBACK: If word not rendered (StaticParagraph), find the paragraph container
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
                    // Last resort: Just scroll percentage if DOM is missing (rare but possible on load)
                    if (core.totalTokens > 0) {
                        const ratio = index / core.totalTokens;
                        const totalH = containerRef.current.scrollHeight;
                        const targetY = totalH * ratio;
                        containerRef.current.scrollTo({ top: targetY, behavior: smooth ? 'smooth' : 'instant' });
                    }
                    isScrollingFrame.current = false;
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
                isScrollingFrame.current = false;
            });
        }, 16); // ~1 frame
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
            // RESET COMPONENT STATE
            setIsReady(false);
            setIsRestored(false);
            setLoadingProgress(0);
            setTokenizing(false);
            setTokenizeProgress(0);
            setLoadingPhase('book');
            setTokens([]);

            // CRITICAL VALIDATION: Check if book has chapters before loading
            if (!book.chapters || book.chapters.length === 0) {
                console.error("[TitanReaderView] Book has no chapters! This indicates a data loading issue.", {
                    bookId: book.id,
                    title: book.title,
                    hasChapters: !!book.chapters,
                    chaptersLength: book.chapters?.length
                });
                // Still mark as ready so UI shows (with empty content vs infinite loading)
                setIsReady(true);
                setIsRestored(true);
                return;
            }

            try {
                setLoadingPhase('book');
                await core.load(book);
                setLoadingProgress(1.0);
                setLoadingPhase('tokenize');
                setTokenizing(true);
                const fullText = core.contentStorage.string;
                if (!fullText) {
                    console.warn("[TitanReaderView] Loaded book has no content string.");
                }
                // RSVP tokenization progress simulation (since we don't have granular progress, animate)
                let fakeProgress = 0;
                setTokenizeProgress(0.01);
                const progressInterval = setInterval(() => {
                    fakeProgress += 0.07 + Math.random() * 0.08;
                    setTokenizeProgress((p) => Math.min(0.98, Math.max(p, fakeProgress)));
                }, 120);
                await conductor.prepare(fullText, { progress: 0 });
                clearInterval(progressInterval);
                setTokenizeProgress(1.0);
                setTokenizing(false);
            } catch (e) {
                console.error("[TitanReaderView] Initialization pipeline failed:", e);
            } finally {
                const loadedTokens = newRsvpEngine.getTokens();
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

  // -- 2. LIVE SYNC (Core -> View) --
  // Always listen for chapter jumps to keep background in sync, even during RSVP
  useEffect(() => {
      const handleCoreUpdate = () => {
          const targetIndex = core.currentBook?.lastTokenIndex;
          if (targetIndex === undefined) return;
          
          // CRITICAL: Detect Jumps
          const diff = Math.abs(targetIndex - activeIndexRef.current);
          
          if (diff > 0) {
              updateActiveIndex(targetIndex);
              
              // Trigger auto-scroll for significant jumps (chapter changes)
              // In RSVP mode: smooth scroll for visual continuity in background
              // In scroll mode: instant snap for responsiveness
              if (diff > 10) {
                   const useSmooth = core.isRSVPMode;
                   scrollToToken(targetIndex, useSmooth);
              }
          }
      };
      
      // Handle explicit jump requests (chapter selection)
      const handleJump = (percentage: number) => {
          if (core.totalTokens > 0) {
              const targetIndex = Math.floor(percentage * core.totalTokens);
              updateActiveIndex(targetIndex);
              scrollToToken(targetIndex, core.isRSVPMode);
          }
      };
      
      const unsub = core.subscribe(handleCoreUpdate);
      const unsubJump = core.onJump(handleJump);
      return () => {
          unsub();
          unsubJump();
      };
  }, [updateActiveIndex, scrollToToken]);

  // -- 2b. RSVP SYNC (Heartbeat -> View) --
  // When RSVP pauses, sync the exact word position to the scroll view
  useEffect(() => {
      const conductor = RSVPConductor.getInstance();
      
      let lastConductorState = conductor.state;
      
      const handleRSVPStateChange = () => {
          const currentState = conductor.state;
          
          // When RSVP pauses (was playing, now paused), sync the exact position
          if (lastConductorState === 'PLAYING' && currentState === 'PAUSED') {
              const currentTokenIndex = newRsvpEngine.getIndex();
              updateActiveIndex(currentTokenIndex);
              // Smooth scroll to show current word in background
              scrollToToken(currentTokenIndex, true);
          }
          
          lastConductorState = currentState;
      };
      
      const unsubConductor = conductor.subscribe(handleRSVPStateChange);
      return () => unsubConductor();
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

  // Debounced save for scroll tracking - prevents excessive writes
  const scrollSaveTimer = useRef<number | null>(null);
  const pendingSaveIndex = useRef<number>(-1);

  const debouncedScrollSave = useCallback((idx: number) => {
      // Always update in-memory state immediately for responsiveness
      pendingSaveIndex.current = idx;
      
      // Clear existing timer
      if (scrollSaveTimer.current) {
          clearTimeout(scrollSaveTimer.current);
      }
      
      // Batch writes: save after 500ms of scroll inactivity
      scrollSaveTimer.current = window.setTimeout(() => {
          if (pendingSaveIndex.current >= 0) {
              core.saveProgress(pendingSaveIndex.current);
          }
          scrollSaveTimer.current = null;
      }, 500);
  }, []);

  // Cleanup scroll save timer on unmount
  useEffect(() => {
      return () => {
          if (scrollSaveTimer.current) {
              // Flush pending save on unmount
              if (pendingSaveIndex.current >= 0) {
                  core.saveProgress(pendingSaveIndex.current);
              }
              clearTimeout(scrollSaveTimer.current);
          }
      };
  }, []);

  // -- 4. SCROLL TRACKING (OBSERVER) --
  useEffect(() => {
    if (!isRestored || !isActive) {
        if (observerRef.current) observerRef.current.disconnect();
        return;
    }

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
                    debouncedScrollSave(idx); // Debounced instead of immediate
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
        const t0 = performance.now();
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
        const t1 = performance.now();
        console.log(`[TitanReaderView] Token-to-paragraph mapping took ${(t1 - t0).toFixed(2)}ms for ${tokens.length} tokens, ${result.length} paragraphs.`);
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


    // Virtualized paragraph renderer
    const listRef = useRef<any>(null);
    const [listHeight, setListHeight] = useState<number>(() => window.innerHeight * 0.7);

    // Keep list height in sync with container size
    useEffect(() => {
        const recompute = () => {
            const h = containerRef.current ? containerRef.current.clientHeight : window.innerHeight;
            setListHeight(Math.max(200, Math.floor(h * 0.7)));
        };
        recompute();
        const ro = new ResizeObserver(recompute);
        if (containerRef.current) ro.observe(containerRef.current);
        window.addEventListener('resize', recompute);
        return () => { ro.disconnect(); window.removeEventListener('resize', recompute); };
    }, []);

    // Keep the virtual list centered on the active paragraph when it changes
    useEffect(() => {
        if (!listRef.current || activeParagraphIndex < 0) return;
        try {
            listRef.current.scrollToItem(activeParagraphIndex, 'center');
        } catch (e) {
            // ignore if list not ready
        }
    }, [activeParagraphIndex]);

    const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
        const p = paragraphs[index];
        if (!p) return null;
        // Only render active or near-active as interactive, rest as static
        const isActiveWindow = Math.abs(index - activeParagraphIndex) <= 1;
        return (
            <div style={style} key={p.startIndex}>
                {isActiveWindow ? (
                    <ParagraphChunk
                        startTokenIndex={p.startIndex}
                        tokens={p.tokens}
                        activeIndex={activeIndex}
                        onWordClick={handleWordClick}
                        settings={settings}
                        theme={theme}
                    />
                ) : (
                    <StaticParagraph
                        text={p.plainText}
                        settings={settings}
                        startTokenIndex={p.startIndex}
                        onParagraphClick={handleParagraphClick}
                    />
                )}
            </div>
        );
    }, [paragraphs, activeParagraphIndex, activeIndex, handleWordClick, handleParagraphClick, settings, theme]);

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
        transform: 'translateZ(0)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onToggleChrome();
      }}
    >

            {/* MINIMAL LOADING SPINNER */}
            {!isReady && (
                <>
                  <div style={{position:'fixed',top:0,left:0,zIndex:9999,color:'red',background:'white',fontSize:'12px',padding:'2px'}}>[TitanReaderView] Waiting for isReady...</div>
                  <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-auto" style={{ backgroundColor: theme.background }}>
                      <div className="w-12 h-12 relative">
                          <div className="absolute inset-0 rounded-full border-2 opacity-20" style={{ borderColor: theme.accent }} />
                          <div className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
                      </div>
                  </div>
                </>
            )}

      {/* EMPTY STATE: No content loaded */}
      {isReady && tokens.length === 0 && (
          <div 
              className="fixed inset-0 flex items-center justify-center z-[50] pointer-events-none"
              style={{ backgroundColor: theme.background }}
          >
              <div className="flex flex-col items-center gap-4 px-8 text-center">
                  <div className="text-4xl opacity-30">📖</div>
                  <span className="text-lg font-medium" style={{ color: theme.secondaryText }}>No content available</span>
                  <span className="text-sm opacity-60" style={{ color: theme.secondaryText }}>This book appears to be empty or failed to load.</span>
              </div>
          </div>
      )}

            <div className="w-full min-h-[100dvh] px-6 md:px-0 py-24 md:py-32 box-border relative">
                <List
                    ref={listRef}
                    height={listHeight}
                    itemCount={paragraphs.length}
                    itemSize={120}
                    width={"100%"}
                    overscanCount={6}
                    itemKey={(index) => {
                        const p = paragraphs[index];
                        return p ? String(p.startIndex) : String(index);
                    }}
                >
                    {Row}
                </List>
                <div className="h-[40vh]" />
            </div>
    </div>
  );
};