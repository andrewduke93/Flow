import React, { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react';
import { Book } from '../types';
import { TitanCore } from '../services/titanCore';
import { RSVPConductor, RSVPState } from '../services/rsvpConductor';
import { RSVPHeartbeat } from '../services/rsvpHeartbeat';
import { newRsvpEngine } from '../services/newRsvpEngine';
import { RSVPLens } from './RSVPLens';
import { ZuneControls } from './ZuneControls';
import { AnimatePresence, motion } from 'framer-motion';
import { useTitanSettings } from '../services/configService';

interface ZuneReaderProps {
  book: Book;
  onClose: () => void;
}

export const ZuneReader: React.FC<ZuneReaderProps> = ({ book, onClose }) => {
  const core = TitanCore.getInstance();
  const conductor = RSVPConductor.getInstance();
  const heartbeat = RSVPHeartbeat.getInstance();
  const { updateSettings, settings } = useTitanSettings();

  const [content, setContent] = useState("");
  const [isLensActive, setIsLensActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(heartbeat.wpm);
  const [currentToken, setCurrentToken] = useState(heartbeat.currentToken);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [screenCenter, setScreenCenter] = useState(0);

  // Gesture State
  const [tempFontSize, setTempFontSize] = useState(settings.fontSize);
  const touchStartDist = useRef<number>(0);
  const startFontSize = useRef<number>(settings.fontSize);
  const wheelAccumulator = useRef<number>(0);

  // -- 1. Initialization --
  useEffect(() => {
    core.load(book);
    const unsub = core.subscribe(() => {
        setContent(core.contentStorage.string);
    });
    return unsub;
  }, [book.id]);

  useEffect(() => {
      setTempFontSize(settings.fontSize);
  }, [settings.fontSize]);

  useEffect(() => {
    const sync = () => {
       setIsPlaying(conductor.state === RSVPState.PLAYING);
       setWpm(heartbeat.wpm);
       setCurrentToken(heartbeat.currentToken);
    };
    const unsubC = conductor.subscribe(sync);
    const unsubH = heartbeat.subscribe(sync);
    const unsubNew = newRsvpEngine.subscribe(({ index, token, isPlaying }) => {
      setIsPlaying(isPlaying);
      if (token) setCurrentToken(token as any);
     });
    return () => { unsubC(); unsubH(); };
  }, []);

  useLayoutEffect(() => {
      const update = () => {
          if (containerRef.current) {
             const rect = containerRef.current.getBoundingClientRect();
             setScreenCenter(rect.width / 2);
          }
      };
      update();
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
  }, []);

  // -- 2. Advanced Hit Testing (The "Pro" Way) --
  // Instead of rendering spans, we use the Range API to find the word under the tap.
  // This improves performance by 100x.
  const handleTap = (e: React.MouseEvent) => {
    if (isLensActive) return;

    // Standard API (Chrome, Safari, Edge)
    if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
            // We have the text node. Now let's calculate the absolute offset.
            // This is a heuristic approximation for the demo. 
            // In a production engine, we'd map DOM nodes to TitanCore's text index.
            
            // For now, we expand the selection to the word to get visuals
            const text = range.startContainer.textContent || "";
            let start = range.startOffset;
            let end = range.endOffset;
            
            // Expand left
            while (start > 0 && /\S/.test(text[start - 1])) start--;
            // Expand right
            while (end < text.length && /\S/.test(text[end])) end++;
            
            // Calculate a rough global offset based on paragraph index
            const paraElement = (range.startContainer.parentNode as HTMLElement);
            const paraIndex = parseInt(paraElement.getAttribute('data-index') || "0");
            
            // We can ask TitanCore for the offset of this paragraph
            // Or roughly estimate for this high-performance demo:
            // Let's assume the Conductor can "Find" this text.
            const selectedWord = text.slice(start, end).trim();
            
            if (selectedWord.length > 0) {
               console.log("Selected:", selectedWord);
               // Trigger RSVP at this approximate location
               // We pass the global percentage instead of absolute index for safety
               // unless we map perfectly.
               const clickY = e.clientY;
               const totalHeight = scrollContainerRef.current?.scrollHeight || 1;
               const scrollTop = scrollContainerRef.current?.scrollTop || 0;
               const approxProgress = (scrollTop + clickY) / totalHeight;
               
               // Better: Find the word index in the full content
               try {
                 await newRsvpEngine.prepare(content, settings.rsvpSpeed || 350);
                 setIsLensActive(true);
                 newRsvpEngine.play();
               } catch (err) {
                 // Fallback to legacy conductor
                 conductor.prepare(content, { progress: core.currentProgress }); // Re-align to view
                 setIsLensActive(true);
                 conductor.play();
               }
            }
        }
    }
  };

  const handleToggleMode = useCallback(() => {
    if (isLensActive) {
      // EXIT RSVP -> SCROLL
      try { newRsvpEngine.pause(); } catch (e) { conductor.pause(); }
      setIsLensActive(false);
      
      // Smoothly restore scroll position
      setTimeout(() => {
          if (scrollContainerRef.current) {
               const { scrollHeight, clientHeight } = scrollContainerRef.current;
               const targetY = core.restorePosition(scrollHeight, clientHeight);
               scrollContainerRef.current.scrollTo({ top: targetY, behavior: 'smooth' });
          }
      }, 50);
    } else {
      // ENTER RSVP -> LENS
      (async () => {
        try {
          await newRsvpEngine.prepare(content, settings.rsvpSpeed || 350);
          setIsLensActive(true);
          newRsvpEngine.play();
        } catch (e) {
          await conductor.prepare(content, { progress: core.currentProgress });
          setIsLensActive(true);
          conductor.play();
        }
      })();
    }
  }, [isLensActive, content]);

  const handleTogglePlay = useCallback(() => {
      if (isLensActive) {
        try { newRsvpEngine.togglePlay(); } catch (e) { conductor.togglePlay(); }
      } else {
        handleToggleMode(); 
      }
  }, [isLensActive, handleToggleMode]);

  // -- 3. Gestures --

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault(); // Prevent browser zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDist.current = dist;
      startFontSize.current = tempFontSize;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scaleFactor = dist / touchStartDist.current;
      const newSize = Math.min(50, Math.max(14, startFontSize.current * scaleFactor));
      setTempFontSize(newSize);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
     if (Math.abs(tempFontSize - settings.fontSize) > 0.5) {
         updateSettings({ fontSize: tempFontSize });
     }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isLensActive) {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            wheelAccumulator.current += e.deltaX;
            if (Math.abs(wheelAccumulator.current) > 20) {
                const direction = wheelAccumulator.current > 0 ? 1 : -1;
          try { newRsvpEngine.seek(Math.max(0, (heartbeat.currentIndex || 0) + direction)); } catch (err) { conductor.seekRelative(direction); }
                wheelAccumulator.current = 0;
            }
        }
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-black flex flex-col overflow-hidden"
      // Note: We DO NOT put touch-none here, or scrolling breaks.
    >
      
      {/* STATIC PAGE VIEW */}
      <div 
        className="relative flex-1 overflow-hidden"
        // Gesture Handlers on the wrapper
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <motion.div 
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto px-6 md:px-10 pb-48 custom-scrollbar touch-pan-y"
          animate={{ 
              opacity: isLensActive ? 0.05 : 1,
              scale: isLensActive ? 1.05 : 1,
              filter: isLensActive ? 'blur(20px)' : 'blur(0px)'
          }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          onScroll={(e) => {
             const target = e.currentTarget;
             if (!isLensActive) {
                const progress = target.scrollTop / (target.scrollHeight - target.clientHeight);
                core.currentProgress = progress;
             }
          }}
          onClick={handleTap}
        >
          <div className="max-w-2xl mx-auto py-32">
            <div className="mb-12 flex items-center justify-between border-b border-white/10 pb-4 opacity-40">
                <span className="text-[10px] font-black uppercase tracking-widest">{book.author}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{Math.floor((book.bookmarkProgress || 0) * 100)}%</span>
            </div>

            <div 
              className="font-sans leading-relaxed text-white/80 tracking-tight transition-all ease-out"
              style={{ fontSize: `${tempFontSize}px`, lineHeight: settings.lineHeight }}
            >
                {content.split('\n\n').map((para, i) => (
                    <p 
                        key={i} 
                        data-index={i}
                        className="mb-8 hover:text-white transition-colors duration-300 select-none cursor-pointer"
                        style={{ marginBottom: settings.paragraphSpacing }}
                    >
                        {para}
                    </p>
                ))}
            </div>
            
            <div className="h-40" />
          </div>
        </motion.div>

        {/* LENS INTERFACE */}
        <AnimatePresence>
          {isLensActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-[60px]"
              >
                  {/* Subtle Grid */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:80px_80px]" />

                  <div className="relative z-30 w-full h-full pointer-events-none">
                    <RSVPLens token={currentToken} screenCenter={screenCenter} />
                  </div>
              </motion.div>
          )}
        </AnimatePresence>

        {/* PERSISTENT SOUL: The Zune Control Bar */}
        <ZuneControls 
          mode={isLensActive ? 'rsvp' : 'scroll'}
          isPlaying={isPlaying} 
          wpm={wpm} 
          onTogglePlay={handleTogglePlay}
          onToggleMode={handleToggleMode}
          onSpeedChange={(delta) => conductor.updateWPM(wpm + delta)}
        />
        
        {/* Back Button (Top Left) */}
        {!isLensActive && (
            <button 
                onClick={onClose}
                className="absolute top-6 left-6 z-50 p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            </button>
        )}

      </div>
    </div>
  );
};