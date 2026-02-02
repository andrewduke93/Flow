import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { Book, RSVPToken } from '../types';
import { TitanCore } from '../services/titanCore';
import { TitanReadStream, StreamMode } from '../services/titanReadStream';
import { FlowCanvas } from './FlowCanvas';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { RSVPHapticEngine } from '../services/rsvpHaptics';
import { TextFormatter, FormattedBlock, BlockType, BLOCK_STYLES } from '../services/textFormatter';

interface FlowReaderProps {
  book: Book;
  onToggleChrome: () => void;
  onRequestPlay?: (tokenIndex: number) => void;
  isRSVPActive: boolean;
}

/**
 * FlowReader - Unified Reading Surface
 * 
 * The secret: There's only ONE reader. Scroll and RSVP are the same thing,
 * just rendered differently. The stream position is shared.
 * 
 * When scrolling: User controls position, canvas is hidden
 * When RSVP: Canvas shows, time controls position, scroll view fades
 * 
 * The transition is seamless because both use the same token stream.
 */
export const FlowReader: React.FC<FlowReaderProps> = memo(({ 
  book, 
  onToggleChrome,
  onRequestPlay,
  isRSVPActive 
}) => {
  const core = TitanCore.getInstance();
  const stream = TitanReadStream.getInstance();
  const theme = useTitanTheme();
  const { settings, updateSettings } = useTitanSettings();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [tokens, setTokens] = useState<RSVPToken[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [contentText, setContentText] = useState(''); // Track content for re-render
  
  // Refs
  const isProgrammaticScroll = useRef(false);
  const initialPinchDistance = useRef<number | null>(null);
  const initialFontSize = useRef<number>(settings.fontSize);

  // Initialization - FAST PATH: show text immediately, tokenize in background
  useEffect(() => {
    console.log('[FlowReader] Initializing for book:', book.id, 'chapters:', book.chapters?.length || 0);
    setIsReady(false);
    setLoadingProgress(0);
    setContentText('');

    const init = async () => {
      // If no chapters, show empty state but still mark as ready
      if (!book.chapters || book.chapters.length === 0) {
        console.log('[FlowReader] No chapters found, showing empty state');
        setIsReady(true);
        setContentText(''); // Empty = will show "No content to display"
        return;
      }

      try {
        console.log('[FlowReader] Loading core...');
        // PHASE 1: Load core (fast - just text extraction)
        await core.load(book);
        
        // Capture content text for rendering
        const fullText = core.contentStorage.string;
        console.log('[FlowReader] Content loaded, length:', fullText?.length || 0);
        
        if (!fullText || fullText.trim().length === 0) {
          console.warn('[FlowReader] Content is empty after load');
          setIsReady(true);
          return;
        }
        
        setContentText(fullText);
        
        // IMMEDIATELY show reader with text
        // We don't need tokens for scroll view!
        setIsReady(true);
        setLoadingProgress(1);
        console.log('[FlowReader] Ready!');
        
        // PHASE 2: Background tokenization (for RSVP)
        // This happens after the reader is already visible
        const startIndex = book.lastTokenIndex || 0;
        
        // Don't await - let it happen in background
        stream.loadContent(fullText, { tokenIndex: startIndex }).then(() => {
          console.log('[FlowReader] Tokens loaded:', stream.tokens.length);
          setTokens(stream.tokens);
          setActiveIndex(stream.currentIndex);
        }).catch((e) => console.error('[FlowReader] Token load failed:', e));
        
      } catch (e) {
        console.error('[FlowReader] Init failed:', e);
        setIsReady(true);
      }
    };

    init();
  }, [book.id]);

  // Sync with stream
  useEffect(() => {
    const unsub = stream.subscribe(() => {
      // Update tokens if they changed (from background load)
      if (stream.tokens.length > 0 && stream.tokens !== tokens) {
        setTokens(stream.tokens);
      }
      setActiveIndex(stream.currentIndex);
      
      // Sync scroll position when stream moves (e.g., during RSVP exit)
      if (!isRSVPActive && scrollContainerRef.current && stream.tokens.length > 0) {
        const pct = stream.progress;
        const scrollMax = scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight;
        const targetScroll = pct * scrollMax;
        
        // Only programmatic scroll if we're far off
        const currentScroll = scrollContainerRef.current.scrollTop;
        if (Math.abs(targetScroll - currentScroll) > 500) {
          isProgrammaticScroll.current = true;
          scrollContainerRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
          setTimeout(() => { isProgrammaticScroll.current = false; }, 600);
        }
      }
    });
    
    return unsub;
  }, [isRSVPActive]);

  // Scroll tracking → stream position (when in scroll mode)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isReady || tokens.length === 0 || isRSVPActive) return;
    
    let ticking = false;
    
    const handleScroll = () => {
      if (isProgrammaticScroll.current || ticking) return;
      
      ticking = true;
      requestAnimationFrame(() => {
        if (!isProgrammaticScroll.current && container) {
          const scrollPct = container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight);
          const newIndex = Math.floor(scrollPct * (tokens.length - 1));
          
          // Update stream position (this is the key unification!)
          if (Math.abs(newIndex - stream.currentIndex) > 5) {
            stream.seek({ tokenIndex: newIndex });
            core.saveProgress(newIndex);
          }
        }
        ticking = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isReady, tokens.length, isRSVPActive]);

  // Pinch-to-zoom
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

  // Setup pinch listeners
  useEffect(() => {
    const container = scrollContainerRef.current;
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

  // Enhanced paragraph grouping with block type detection
  const paragraphs = useMemo(() => {
    if (tokens.length === 0) return [];
    
    const result: { 
      tokens: RSVPToken[], 
      startIndex: number, 
      plainText: string,
      blockType: BlockType,
      metadata?: { isFirstInChapter?: boolean }
    }[] = [];
    let currentPara: RSVPToken[] = [];
    let startIndex = 0;
    let prevBlockType: BlockType = 'paragraph';
    
    // Block type detection patterns
    const CHAPTER_PATTERN = /^chapter\s+(\d+|[ivxlc]+)|^(part|book|section|prologue|epilogue)\s*/i;
    const SCENE_BREAK_PATTERN = /^[\*\#\-–—]{3,}$|^[●○◆◇★]{1,5}$/;
    const DIALOGUE_START_PATTERN = /^[""\u201C]/;
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      currentPara.push(token);
      
      // Check if this token ends a paragraph
      if (token.isParagraphEnd || i === tokens.length - 1) {
        const plainText = currentPara.map(t => t.originalText).join(' ');
        const blockType = detectBlockType(plainText, prevBlockType);
        
        result.push({
          tokens: currentPara,
          startIndex,
          plainText,
          blockType,
          metadata: prevBlockType === 'chapter-heading' ? { isFirstInChapter: true } : undefined
        });
        
        prevBlockType = blockType;
        currentPara = [];
        startIndex = i + 1;
      }
    }
    
    // Block type detection helper
    function detectBlockType(text: string, prev: BlockType): BlockType {
      const trimmed = text.trim();
      
      // Scene breaks
      if (SCENE_BREAK_PATTERN.test(trimmed)) return 'scene-break';
      
      // Chapter headings (short line, starts with chapter/part, or ALL CAPS)
      if (trimmed.length < 60) {
        if (CHAPTER_PATTERN.test(trimmed)) return 'chapter-heading';
        if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length > 2) {
          return 'chapter-heading';
        }
      }
      
      // Dialogue (starts with quote)
      if (DIALOGUE_START_PATTERN.test(trimmed)) return 'dialogue';
      
      // First paragraph after heading
      if (prev === 'chapter-heading') return 'first-paragraph';
      
      return 'paragraph';
    }
    
    return result;
  }, [tokens]);

  // Handle word click → start RSVP from that position
  const handleWordClick = useCallback((index: number) => {
    RSVPHapticEngine.impactMedium();
    stream.seek({ tokenIndex: index });
    onRequestPlay?.(index);
  }, [onRequestPlay]);

  // Handle canvas tap
  const handleCanvasTap = useCallback(() => {
    stream.toggle();
  }, []);

  // Font family
  const fontFamily = settings.fontFamily === 'New York' 
    ? '"New York", "Iowan Old Style", Georgia, serif' 
    : settings.fontFamily === 'OpenDyslexic' 
      ? '"OpenDyslexic", sans-serif'
      : settings.fontFamily === 'Atkinson Hyperlegible'
        ? '"Atkinson Hyperlegible", sans-serif'
        : 'system-ui, -apple-system, sans-serif';

  // Loading state - minimal spinner (should be very brief now)
  if (!isReady) {
    return (
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: theme.background }}
      >
        <div 
          className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: `${theme.accent}20`, borderTopColor: theme.accent }}
        />
      </div>
    );
  }

  // Formatted blocks for enhanced display (smart formatting)
  const formattedBlocks = useMemo(() => {
    if (tokens.length > 0) return null; // Use token-based rendering when ready
    if (!contentText) return null;
    try {
      const blocks = TextFormatter.formatText(contentText);
      console.log('[FlowReader] Formatted blocks:', blocks?.length || 0);
      return blocks;
    } catch (e) {
      console.error('[FlowReader] TextFormatter error:', e);
      return null;
    }
  }, [tokens.length, contentText]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* LAYER 0: Scroll View - Always present, fades when RSVP active */}
      <div 
        ref={scrollContainerRef}
        className="absolute inset-0 overflow-y-auto overscroll-contain transition-opacity duration-300"
        style={{ 
          backgroundColor: theme.background,
          opacity: isRSVPActive ? (stream.isPlaying ? 0 : 0.4) : 1,
          pointerEvents: isRSVPActive ? 'none' : 'auto'
        }}
        onClick={onToggleChrome}
      >
        <div 
          className="max-w-2xl mx-auto px-6 py-safe"
          style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top))', paddingBottom: '12rem' }}
        >
          {/* FAST PATH: Enhanced formatted blocks before tokens ready */}
          {formattedBlocks && formattedBlocks.length > 0 && formattedBlocks.map((block, idx) => (
            <FormattedBlockView
              key={idx}
              block={block}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              paragraphSpacing={settings.paragraphSpacing}
              fontFamily={fontFamily}
              theme={theme}
            />
          ))}

          {/* FULL PATH: Token-based rendering with block type styling */}
          {!formattedBlocks && paragraphs.length > 0 && paragraphs.map((para) => (
            <TokenizedBlockView
              key={para.startIndex}
              para={para}
              activeIndex={activeIndex}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              paragraphSpacing={settings.paragraphSpacing}
              fontFamily={fontFamily}
              theme={theme}
              onWordClick={handleWordClick}
            />
          ))}

          {/* Fallback: No content available */}
          {!formattedBlocks && paragraphs.length === 0 && contentText && (
            <p style={{ color: theme.primaryText, fontSize: `${settings.fontSize}px`, fontFamily }}>
              {contentText}
            </p>
          )}

          {/* Empty state */}
          {!contentText && tokens.length === 0 && (
            <div style={{ color: theme.primaryText, textAlign: 'center', paddingTop: '4rem' }}>
              <p style={{ opacity: 0.5, fontSize: `${settings.fontSize}px` }}>
                Unable to load book content
              </p>
              <p style={{ opacity: 0.3, fontSize: `${settings.fontSize * 0.8}px`, marginTop: '0.5rem' }}>
                Book chapters: {book.chapters?.length || 0}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* LAYER 1: Canvas Display - Shown when RSVP active */}
      <div 
        className={`absolute inset-0 transition-all duration-300 ${
          isRSVPActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)' }}
      >
        <FlowCanvas onTap={handleCanvasTap} />
      </div>
    </div>
  );
});

/**
 * FormattedBlockView - Renders each block type with appropriate styling
 */
interface FormattedBlockViewProps {
  block: FormattedBlock;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  fontFamily: string;
  theme: { primaryText: string; accent: string; background: string };
}

const FormattedBlockView: React.FC<FormattedBlockViewProps> = memo(({ 
  block, 
  fontSize, 
  lineHeight, 
  paragraphSpacing, 
  fontFamily,
  theme 
}) => {
  const baseStyles: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight,
    fontFamily,
    color: theme.primaryText,
    textRendering: 'optimizeLegibility',
    WebkitFontSmoothing: 'antialiased',
  };

  const blockStyles = BLOCK_STYLES[block.type];

  switch (block.type) {
    case 'chapter-heading':
      return (
        <h2
          style={{
            ...baseStyles,
            ...blockStyles,
            fontSize: `${fontSize * 1.5}px`,
          }}
        >
          {block.content}
        </h2>
      );

    case 'scene-break':
      return (
        <div style={{ ...baseStyles, ...blockStyles }} role="separator">
          {block.content}
        </div>
      );

    case 'dialogue':
    case 'dialogue-attribution':
      return (
        <p
          style={{
            ...baseStyles,
            ...blockStyles,
            marginBottom: `${paragraphSpacing * 0.6}px`,
          }}
        >
          {block.content}
        </p>
      );

    case 'toc-entry':
      // Extract page number if present
      const tocMatch = block.content.match(/^(.+?)(\s*\.{2,}\s*|\s{2,})(\d+)$/);
      if (tocMatch) {
        return (
          <div
            style={{
              ...baseStyles,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: '0.5em',
              marginBottom: '0.25em',
              paddingLeft: block.metadata?.indentLevel ? `${block.metadata.indentLevel * 1.5}em` : 0,
            }}
          >
            <span style={{ flex: '1' }}>{tocMatch[1].trim()}</span>
            <span style={{ 
              borderBottom: '1px dotted currentColor', 
              flex: '1', 
              opacity: 0.3,
              marginBottom: '0.25em'
            }} />
            <span style={{ opacity: 0.6 }}>{tocMatch[3]}</span>
          </div>
        );
      }
      return (
        <p style={{ ...baseStyles, ...blockStyles, marginBottom: '0.25em' }}>
          {block.content}
        </p>
      );

    case 'letter':
      return (
        <blockquote
          style={{
            ...baseStyles,
            ...blockStyles,
            marginBottom: `${paragraphSpacing}px`,
            borderLeftColor: theme.accent,
          }}
        >
          {block.content}
        </blockquote>
      );

    case 'poetry':
      return (
        <p
          style={{
            ...baseStyles,
            ...blockStyles,
            marginBottom: `${paragraphSpacing * 0.5}px`,
          }}
        >
          {block.content}
        </p>
      );

    case 'blockquote':
      return (
        <blockquote
          style={{
            ...baseStyles,
            ...blockStyles,
            marginBottom: `${paragraphSpacing}px`,
            borderLeftColor: theme.accent,
            paddingLeft: block.metadata?.indentLevel ? `${block.metadata.indentLevel}em` : '1em',
          }}
        >
          {block.content}
        </blockquote>
      );

    case 'list-item':
      const marker = block.metadata?.listStyle === 'number' 
        ? `${block.metadata.listIndex}. `
        : block.metadata?.listStyle === 'letter'
          ? `${String.fromCharCode(96 + (block.metadata.listIndex || 1))}. `
          : '• ';
      return (
        <p style={{ ...baseStyles, ...blockStyles, marginBottom: '0.25em' }}>
          <span style={{ opacity: 0.6 }}>{marker}</span>
          {block.content}
        </p>
      );

    case 'first-paragraph':
      // Drop cap for first paragraph of chapter
      const firstChar = block.content.charAt(0);
      const rest = block.content.slice(1);
      return (
        <p
          style={{
            ...baseStyles,
            marginBottom: `${paragraphSpacing}px`,
            textAlign: 'justify',
            textJustify: 'inter-word',
          }}
        >
          <span
            style={{
              float: 'left',
              fontSize: `${fontSize * 3.2}px`,
              lineHeight: 0.8,
              marginRight: '0.08em',
              marginTop: '0.05em',
              fontWeight: 500,
              color: theme.accent,
            }}
          >
            {firstChar}
          </span>
          {rest}
        </p>
      );

    case 'epigraph':
      return (
        <p
          style={{
            ...baseStyles,
            ...blockStyles,
            marginBottom: `${paragraphSpacing * 2}px`,
            fontSize: `${fontSize * 0.95}px`,
          }}
        >
          {block.content}
        </p>
      );

    case 'paragraph':
    default:
      return (
        <p
          style={{
            ...baseStyles,
            marginBottom: `${paragraphSpacing}px`,
            opacity: 0.92,
            textAlign: 'justify',
            textJustify: 'inter-word',
            hyphens: 'auto',
            WebkitHyphens: 'auto',
            wordBreak: 'break-word',
            letterSpacing: '-0.01em',
          }}
        >
          {block.content}
        </p>
      );
  }
});

/**
 * TokenizedBlockView - Renders token-based paragraphs with block type styling
 * Used when full token data is available (for RSVP clicking)
 */
interface TokenizedBlockViewProps {
  para: {
    tokens: RSVPToken[];
    startIndex: number;
    plainText: string;
    blockType: BlockType;
    metadata?: { isFirstInChapter?: boolean };
  };
  activeIndex: number;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  fontFamily: string;
  theme: { primaryText: string; accent: string; background: string };
  onWordClick: (index: number) => void;
}

const TokenizedBlockView: React.FC<TokenizedBlockViewProps> = memo(({
  para,
  activeIndex,
  fontSize,
  lineHeight,
  paragraphSpacing,
  fontFamily,
  theme,
  onWordClick,
}) => {
  const baseStyles: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight,
    fontFamily,
    color: theme.primaryText,
    textRendering: 'optimizeLegibility',
    WebkitFontSmoothing: 'antialiased',
  };

  const blockStyles = BLOCK_STYLES[para.blockType];

  // Render tokens with highlighting
  const renderTokens = (tokens: RSVPToken[], startOffset = 0) => (
    <>
      {tokens.map((token, idx) => {
        const isActive = token.globalIndex === activeIndex;
        return (
          <React.Fragment key={token.id}>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onWordClick(token.globalIndex);
              }}
              className="inline rounded-sm cursor-pointer select-none transition-colors duration-150"
              style={{
                backgroundColor: isActive ? theme.accent : 'transparent',
                color: isActive ? '#FFFFFF' : 'inherit',
                padding: isActive ? '0.1em 0.15em' : '0',
                margin: isActive ? '-0.1em -0.15em' : '0',
              }}
            >
              {token.originalText}
            </span>
            {' '}
          </React.Fragment>
        );
      })}
    </>
  );

  switch (para.blockType) {
    case 'chapter-heading':
      return (
        <h2
          className="cursor-pointer"
          style={{
            ...baseStyles,
            ...blockStyles,
            fontSize: `${fontSize * 1.5}px`,
          }}
        >
          {renderTokens(para.tokens)}
        </h2>
      );

    case 'scene-break':
      return (
        <div 
          className="cursor-pointer"
          style={{ ...baseStyles, ...blockStyles }} 
          role="separator"
        >
          * * *
        </div>
      );

    case 'dialogue':
      return (
        <p
          className="cursor-pointer"
          style={{
            ...baseStyles,
            ...blockStyles,
            marginBottom: `${paragraphSpacing * 0.6}px`,
          }}
        >
          {renderTokens(para.tokens)}
        </p>
      );

    case 'first-paragraph':
      // Drop cap - first token gets special treatment
      const firstToken = para.tokens[0];
      const restTokens = para.tokens.slice(1);
      const firstChar = firstToken?.originalText?.charAt(0) || '';
      const restOfFirstWord = firstToken?.originalText?.slice(1) || '';
      
      return (
        <p
          className="cursor-pointer"
          style={{
            ...baseStyles,
            marginBottom: `${paragraphSpacing}px`,
            textAlign: 'justify',
            textJustify: 'inter-word',
          }}
        >
          {/* Drop cap */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (firstToken) onWordClick(firstToken.globalIndex);
            }}
            style={{
              float: 'left',
              fontSize: `${fontSize * 3.2}px`,
              lineHeight: 0.8,
              marginRight: '0.08em',
              marginTop: '0.05em',
              fontWeight: 500,
              color: activeIndex === firstToken?.globalIndex ? '#FFFFFF' : theme.accent,
              backgroundColor: activeIndex === firstToken?.globalIndex ? theme.accent : 'transparent',
              borderRadius: '0.1em',
              cursor: 'pointer',
            }}
          >
            {firstChar}
          </span>
          {/* Rest of first word (if any) */}
          {restOfFirstWord && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (firstToken) onWordClick(firstToken.globalIndex);
              }}
              className="cursor-pointer"
              style={{
                backgroundColor: activeIndex === firstToken?.globalIndex ? theme.accent : 'transparent',
                color: activeIndex === firstToken?.globalIndex ? '#FFFFFF' : 'inherit',
              }}
            >
              {restOfFirstWord}
            </span>
          )}{' '}
          {/* Rest of tokens */}
          {renderTokens(restTokens)}
        </p>
      );

    case 'paragraph':
    default:
      return (
        <p
          className="cursor-pointer transition-opacity hover:opacity-100"
          style={{
            ...baseStyles,
            marginBottom: `${paragraphSpacing}px`,
            opacity: 0.92,
            textAlign: 'justify',
            textJustify: 'inter-word',
            hyphens: 'auto',
            WebkitHyphens: 'auto',
            wordBreak: 'break-word',
            letterSpacing: '-0.01em',
          }}
        >
          {renderTokens(para.tokens)}
        </p>
      );
  }
});
