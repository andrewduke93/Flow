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
    id={`w-$${token.globalIndex}`} 
    data-idx={token.globalIndex}
    data-off={token.startOffset}
    className={`inline py-0.5 rounded-[2px] cursor-pointer select-none transition-colors duration-200 $${isActive ? '' : 'hover:opacity-60'}`}
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
            id={`p-$${startTokenIndex}`}
            data-start-index={startTokenIndex}
            onClick={() => onParagraphClick(startTokenIndex)}
            className="max-w-[60ch] mx-auto box-border relative cursor-pointer hover:opacity-100 transition-opacity scroll-mt-32"
            style={{
                fontSize: `$${settings.fontSize}px`,
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
    id={`p-$${startTokenIndex}`}
      data-start-index={startTokenIndex}
      onClick={handleDelegatedClick}
      className="max-w-[60ch] mx-auto box-border relative scroll-mt-32"
          style={{
        fontSize: `$${settings.fontSize}px`,
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

  // Cached paragraph starts and offsets for fast scroll target calculation
  const paragraphStartsRef = useRef<{ startIndex: number; top: number }[]>([]);

  const computeParagraphOffsets = useCallback(() => {
      if (!containerRef.current) return;
      const paras = Array.from(containerRef.current.querySelectorAll('p[data-start-index]')) as HTMLElement[];
      const arr = paras.map(p => {
          let offsetTop = p.offsetTop;
          let parent = p.offsetParent as HTMLElement | null;
          while (parent && parent !== containerRef.current) {
              offsetTop += parent.offsetTop;
              parent = parent.offsetParent as HTMLElement | null;
          }
          return { startIndex: parseInt(p.dataset.startIndex || '-1'), top: offsetTop };
      }).filter(x => x.startIndex >= 0).sort((a, b) => a.startIndex - b.startIndex);

      paragraphStartsRef.current = arr;
  }, []);

  // Sync Ref signal
  const pendingJumpIndex = useRef<number | null>(null);

    // RSVP lock: when RSVP is playing we lock the view so the reader is authoritative
    const isLockedByRSVP = useRef(false);
    const rsvpLoopRef = useRef<number | null>(null);

  const updateActiveIndex = useCallback((idx: number) => {
      setActiveIndex(idx);
      activeIndexRef.current = idx;
  }, []);

  // SCROLL ENGINE: The critical piece for navigation
  const scrollToToken = useCallback((index: number, smooth: boolean) => {
      if (!containerRef.current) return;
      
      // 1. Try to find the specific word span (only exists if near active window)
<<<<<<< HEAD
      let element = document.getElementById(`w-$${index}`);
=======
      let element = document.getElementById(`w-${index}`);
>>>>>>> 77c5992a (fix(reader): add 'Repair book' action for empty scroll view (recover missing content))
      
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
      // RESET COMPONENT STATE
      setIsReady(false);
      setIsRestored(false);
      setLoadingProgress(0);
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
          await core.load(book);
          const fullText = core.contentStorage.string;
          
          if (!fullText) {
              console.warn("[TitanReaderView] Loaded book has no content string.");
          }

          await conductor.prepare(fullText, { progress: 0 }); 
      } catch (e) {
          console.error("[TitanReaderView] Initialization pipeline failed:", e);
      } finally {
          const loadedTokens = heartbeat.tokens;
          setTokens(loadedTokens);
          
          // CRITICAL: Only mark as ready if we actually have tokens or if we've definitely finished trying
          setIsReady(true);
          
          // Give the DOM a tiny beat to paint before showing
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
      const heartbeat = RSVPHeartbeat.getInstance();
      
      let lastConductorState = conductor.state;
      
      const handleRSVPStateChange = () => {
          const currentState = conductor.state;
          
          // When RSVP pauses (was playing, now paused), sync the exact position
          if (lastConductorState === 'PLAYING' && currentState === 'PAUSED') {
              const currentTokenIndex = heartbeat.currentIndex;
              updateActiveIndex(currentTokenIndex);
              // Smooth scroll to show current word in background
              scrollToToken(currentTokenIndex, true);
          }
          
          lastConductorState = currentState;
      };
      
      const unsubConductor = conductor.subscribe(handleRSVPStateChange);
      return () => unsubConductor();
  }, [updateActiveIndex, scrollToToken]);

    // Keep view locked and synced while RSVP is PLAYING using RAF loop
    useEffect(() => {
        const conductor = RSVPConductor.getInstance();
        const heartbeat = RSVPHeartbeat.getInstance();

        const startLoop = () => {
            if (rsvpLoopRef.current != null) return;
            const loop = () => {
                const idx = (heartbeat && typeof heartbeat.currentIndex === 'number') ? heartbeat.currentIndex : activeIndexRef.current;
                if (typeof idx === 'number' && idx >= 0) {
                    // update highlighted index and keep it in view without smooth jitter
                    updateActiveIndex(idx);
                    scrollToToken(idx, false);
                }
                rsvpLoopRef.current = window.requestAnimationFrame(loop);
            };
            rsvpLoopRef.current = window.requestAnimationFrame(loop);
        };

        const stopLoop = () => {
            if (rsvpLoopRef.current != null) {
                window.cancelAnimationFrame(rsvpLoopRef.current);
                rsvpLoopRef.current = null;
            }
        };

        const handleState = () => {
            const s = conductor.state;
            if (s === 'PLAYING') {
                isLockedByRSVP.current = true;
                // Ensure initial sync immediately
                const idx = (heartbeat && typeof heartbeat.currentIndex === 'number') ? heartbeat.currentIndex : activeIndexRef.current;
                if (typeof idx === 'number' && idx >= 0) {
                    updateActiveIndex(idx);
                    scrollToToken(idx, false);
                }
                startLoop();
            } else {
                // On pause/stop: stop RAF loop and do a single smooth sync
                stopLoop();
                isLockedByRSVP.current = false;
                const idx = (heartbeat && typeof heartbeat.currentIndex === 'number') ? heartbeat.currentIndex : activeIndexRef.current;
                if (typeof idx === 'number' && idx >= 0) {
                    updateActiveIndex(idx);
                    // Smooth scroll to show current word in background
                    scrollToToken(idx, true);
                }
            }
        };

        const unsub = conductor.subscribe(handleState);
        // run once to align with current state
        handleState();

        return () => {
            unsub();
            stopLoop();
            isLockedByRSVP.current = false;
        };
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

    // Recompute paragraph offsets after render and on resize/font changes
    useLayoutEffect(() => {
        if (!isRestored) return;
        // Compute initial offsets after DOM painted
        computeParagraphOffsets();

        const ro = new ResizeObserver(() => {
            computeParagraphOffsets();
        });
        if (containerRef.current) ro.observe(containerRef.current);

        window.addEventListener('resize', computeParagraphOffsets);

        return () => {
            try { ro.disconnect(); } catch(e) {}
            window.removeEventListener('resize', computeParagraphOffsets);
        };
    }, [tokens.length, isRestored, computeParagraphOffsets]);

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
        // If RSVP has locked the view, ignore observer updates
        if (isLockedByRSVP.current) return;
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

  // Sectioning logic: chunk paragraphs into blocks of 30
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
      {/* LOADING OVERLAY */}
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

      {/* EMPTY STATE: No content loaded */}
      {isReady && tokens.length === 0 && (
          <div 
              className="fixed inset-0 flex items-center justify-center z-[50] pointer-events-auto"
              style={{ backgroundColor: theme.background }}
          >
              <div className="flex flex-col items-center gap-4 px-8 text-center">
                  <div className="text-4xl opacity-30">📖</div>
                  <span className="text-lg font-medium" style={{ color: theme.secondaryText }}>No content available</span>
                  <span className="text-sm opacity-60" style={{ color: theme.secondaryText }}>This book appears to be empty or failed to load.</span>
                  <div className="mt-4 flex gap-3">
                    <button
                      className="px-4 py-2 rounded bg-zune-ember text-white text-sm shadow"
                      onClick={async () => {
                        try {
                          const storage = (await import('../services/titanStorage')).TitanStorage.getInstance();
                          const ingestion = (await import('../services/ingestionService')).IngestionService.getInstance();
                          // Try to fetch the stored source blob for this book
                          const src = await storage.getSource(book.id);
                          if (src) {
<<<<<<< HEAD
                            const file = new File([src], `$${book.title || 'book'}.epub`, { type: 'application/epub+zip' });
=======
                            const file = new File([src], `${book.title || 'book'}.epub`, { type: 'application/epub+zip' });
>>>>>>> 77c5992a (fix(reader): add 'Repair book' action for empty scroll view (recover missing content))
                            const repaired = await ingestion.ingest(file);
                            // Persist repaired book and reopen
                            await storage.saveBook(repaired);
                            await storage.saveSource(repaired.id, src);
                            // Force UI update by navigating to repaired book id
                            window.location.reload();
                            return;
                          }

                          // Fallback: re-seed welcome book if it's the guide
                          if (book.id === 'guide-book-v1') {
                            const mocks = (await import('../services/mockData')).generateMockBooks();
                            const welcome = mocks.find(m => m.id === 'guide-book-v1');
                            if (welcome) {
                              await storage.saveBook(welcome);
                              window.location.reload();
                              return;
                            }
                          }

                          alert('Repair failed: no source available to re-ingest. Try re-importing the book or use the Library to open a different title.');
                        } catch (err) {
                          console.error('Repair failed', err);
                          alert('Repair failed — see console for details.');
                        }
                      }}
                    >
                      Repair book
                    </button>

                    <button
                      className="px-4 py-2 rounded border border-neutral-700 text-sm"
                      onClick={() => { if (containerRef.current) containerRef.current.scrollTop = 0; }}
                    >
                      Scroll to top
                    </button>
                  </div>
              </div>
          </div>
      )}

      <div className="w-full min-h-[100dvh] px-6 md:px-0 py-24 md:py-32 box-border relative">
           {sections.map((section, idx) => (
               <ParagraphSection 
                  key={idx}
                  sectionIndex={idx}
                  paragraphs={section}
                  activeParagraphIndex={activeParagraphIndex}
                  activeIndex={activeIndex}
                  onWordClick={handleWordClick}
                  onParagraphClick={handleParagraphClick}
                  settings={settings}
                  theme={theme}
               />
           ))}
           <div className="h-[40vh]" /> 
      </div>
    </div>
  );
};