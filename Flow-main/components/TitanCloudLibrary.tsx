import React, { useState, useRef, useEffect } from 'react';
import { CloudService, CloudBook } from '../services/cloudService';
import { useTitanTheme } from '../services/titanTheme';
import { Search, Download, X, Loader2, BookOpen, Library, Check, AlertCircle, Lock, Play, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Book } from '../types';

interface TitanCloudLibraryProps {
  existingBooks: Book[];
  onClose: () => void;
  onImport: (book: Book) => void;
  onOpen: (book: Book) => void;
}

type DownloadState = 'idle' | 'loading' | 'success' | 'error';

const SUGGESTED_GENRES = ["philosophy", "gothic", "sci-fi", "adventure", "poetry", "mystery"];

/**
 * TitanCloudLibrary
 * The "Visit Library" experience - Project Gutenberg public domain books.
 * Identity: The Archivist.
 */
export const TitanCloudLibrary: React.FC<TitanCloudLibraryProps> = ({ existingBooks, onClose, onImport, onOpen }) => {
  const theme = useTitanTheme();
  const cloudService = CloudService.getInstance();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CloudBook[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Track download state per book title to allow parallel/multiple interactions
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});

  // Load featured books on mount
  useEffect(() => {
    loadFeatured();
  }, []);

  const loadFeatured = async () => {
    setQuery('');
    setResults(cloudService.getFeaturedBooks());
  };

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    const searchVal = overrideQuery !== undefined ? overrideQuery : query;
    
    if (!searchVal.trim()) {
      loadFeatured();
      return;
    }

    setIsSearching(true);
    setResults([]);

    try {
      const books = await cloudService.searchCuratedBooks(searchVal);
      setResults(books);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search reset
  useEffect(() => {
    if (query.trim() === '') {
      loadFeatured();
    }
  }, [query]);

  const handleDownload = async (book: CloudBook) => {
    const bookKey = book.title;
    const currentState = downloadStates[bookKey] || 'idle';
    if (currentState === 'loading' || currentState === 'success') return;

    setDownloadStates(prev => ({ ...prev, [bookKey]: 'loading' }));

    try {
      const newBook = await cloudService.downloadBook(book);
      onImport(newBook);
      setDownloadStates(prev => ({ ...prev, [bookKey]: 'success' }));
    } catch (e) {
      console.error(`Failed to download ${book.title}`, e);
      setDownloadStates(prev => ({ ...prev, [bookKey]: 'error' }));
      
      // Reset error state after 3 seconds so user can retry
      setTimeout(() => {
        setDownloadStates(prev => ({ ...prev, [bookKey]: 'idle' }));
      }, 3000);
    }
  };

  // Helper to get button UI based on state
  const getButtonContent = (state: DownloadState) => {
    switch (state) {
      case 'loading':
        return (
          <div className="flex items-center gap-2 relative w-full justify-center h-full">
            <Loader2 size={16} className="animate-spin" />
            <span className="lowercase">retrieving...</span>
          </div>
        );
      case 'success':
        return (
          <>
            <Check size={16} />
            <span className="lowercase">added to shelf</span>
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle size={16} />
            <span className="lowercase">failed. retry?</span>
          </>
        );
      default:
        return (
          <>
            <Download size={16} />
            <span className="lowercase">add to shelf</span>
          </>
        );
    }
  };

  const getButtonStyle = (state: DownloadState, moodColor: string) => {
    const baseStyle = {
      border: 'none',
      color: '#FFF',
      backgroundColor: moodColor || theme.accent
    };

    if (state === 'loading') {
      return { 
        ...baseStyle, 
        backgroundColor: theme.surface, 
        color: theme.primaryText, 
        border: `1px solid ${theme.borderColor}`,
        cursor: 'wait'
      };
    }
    if (state === 'success') {
      return { ...baseStyle, backgroundColor: '#10b981' };
    }
    if (state === 'error') {
      return { ...baseStyle, backgroundColor: '#ef4444' };
    }
    return baseStyle;
  };

  // Detect copyright substitution
  const isCopyrightSubstituted = results.length > 0 && results[0].isCopyrightedReplacement;

  return (
    <div 
      className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black transition-colors"
      style={{ backgroundColor: theme.background }}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: theme.borderColor }}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Library size={24} style={{ color: theme.accent }} />
            <h2 className="text-2xl font-serif font-black lowercase tracking-tight leading-none" style={{ color: theme.primaryText }}>
              visit the library
            </h2>
          </div>
          <p className="text-xs font-medium opacity-60 lowercase max-w-[240px]" style={{ color: theme.secondaryText }}>
            70,000+ free public domain ebooks
          </p>
        </div>
        <button 
          onClick={onClose}
          className="p-3 -mr-3 rounded-full hover:bg-black/5 transition-colors"
        >
          <X size={24} style={{ color: theme.secondaryText }} />
        </button>
      </div>

      {/* SEARCH BAR */}
      <div className="px-6 pt-4 pb-2">
        <form onSubmit={handleSearch} className="relative group">
          <input 
            type="text"
            placeholder="search title, author, genre, or keyword..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full h-12 pl-11 pr-4 rounded-xl text-base font-medium outline-none transition-all shadow-sm focus:shadow-md"
            style={{ 
              backgroundColor: theme.surface, 
              color: theme.primaryText,
              border: `1px solid ${theme.borderColor}`
            }}
          />
          <Search 
            size={18} 
            className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:opacity-100 transition-opacity"
            style={{ color: theme.primaryText }}
          />
        </form>

        {/* Quick Genre Pills */}
        {!query && (
          <div className="flex flex-wrap gap-2 mt-3 animate-fadeIn">
            {SUGGESTED_GENRES.map(genre => (
              <button
                key={genre}
                onClick={() => {
                  setQuery(genre);
                  handleSearch(undefined, genre);
                }}
                className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all active:scale-95 opacity-50 hover:opacity-100"
                style={{ 
                  backgroundColor: theme.surface, 
                  borderColor: theme.borderColor,
                  color: theme.primaryText 
                }}
              >
                {genre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto px-6 pb-20 pt-4 custom-scrollbar">
        
        {/* SEARCH LOADING INDICATOR */}
        <AnimatePresence>
          {isSearching && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-center gap-2 py-6 mb-2 text-sm font-medium"
              style={{ color: theme.secondaryText }}
            >
              <Sparkles className="animate-pulse" size={16} style={{ color: theme.accent }} />
              <span className="lowercase">scanning project gutenberg...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* COPYRIGHT BANNER (If substituted) */}
        <AnimatePresence>
          {!isSearching && isCopyrightSubstituted && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-2xl flex items-start gap-4 border"
              style={{ 
                backgroundColor: theme.surface, 
                borderColor: theme.borderColor 
              }}
            >
              <div className="p-2 rounded-full bg-neutral-100 shrink-0">
                <Lock size={16} className="text-neutral-500" />
              </div>
              <div>
                <h3 className="font-bold text-sm lowercase mb-1" style={{ color: theme.primaryText }}>
                  locked in the vault
                </h3>
                <p className="text-xs font-medium leading-relaxed opacity-70 lowercase" style={{ color: theme.secondaryText }}>
                  that book is still under copyright. here are some similar public domain classics.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SECTION HEADER */}
        {!isSearching && !isCopyrightSubstituted && results.length > 0 && (
          <div className="mb-4 flex items-center gap-2 opacity-50">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.secondaryText }}>
              {query ? 'results' : 'featured'}
            </span>
            <div className="h-px flex-1 bg-current opacity-20" style={{ color: theme.secondaryText }} />
          </div>
        )}

        {/* EMPTY STATE */}
        {!isSearching && results.length === 0 && query && (
          <div className="flex flex-col items-center justify-center h-40 text-center opacity-60">
            <p className="font-serif italic text-lg lowercase" style={{ color: theme.secondaryText }}>
              "no matches found in {activeSource.name.toLowerCase()}"
            </p>
            <p className="text-xs mt-2 opacity-60" style={{ color: theme.secondaryText }}>
              try a different search or browse another source
            </p>
          </div>
        )}

        {/* RESULTS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode='popLayout'>
            {results.map((book, i) => {
              // CHECK IF ALREADY IN LIBRARY
              const existingBook = existingBooks.find(b => 
                b.title.trim().toLowerCase() === book.title.trim().toLowerCase() &&
                b.author.trim().toLowerCase() === book.author.trim().toLowerCase()
              );

              const downloadState = downloadStates[book.title] || 'idle';
              
              return (
                <motion.div
                  layout
                  key={`gutenberg-${book.title}`}
                  initial={false}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  className="relative p-5 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group border"
                  style={{ 
                    backgroundColor: theme.surface,
                    borderColor: theme.borderColor 
                  }}
                >
                  {/* Mood Gradient */}
                  <div 
                    className="absolute top-0 right-0 w-40 h-40 rounded-full blur-[60px] opacity-[0.12] transition-opacity group-hover:opacity-[0.2]"
                    style={{ backgroundColor: book.moodColor || theme.accent }}
                  />

                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex-1">
                      {/* Cover + Title Row */}
                      <div className="flex gap-3 mb-3">
                        {book.coverUrl && (
                          <img 
                            src={book.coverUrl}
                            alt=""
                            className="w-12 h-16 object-cover rounded-lg shadow-sm shrink-0"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-serif font-bold text-base leading-tight mb-0.5 line-clamp-2" style={{ color: theme.primaryText }}>
                            {book.title}
                          </h3>
                          <p className="text-xs font-medium opacity-60 uppercase tracking-wider" style={{ color: theme.primaryText }}>
                            {book.author}
                          </p>
                        </div>
                      </div>
                      
                      {/* Tags */}
                      {book.genre && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <span 
                            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight"
                            style={{ 
                              backgroundColor: `${theme.accent}15`, 
                              color: theme.accent
                            }}
                          >
                            {book.genre}
                          </span>
                        </div>
                      )}

                      <p className="text-xs leading-relaxed opacity-70 line-clamp-2" style={{ color: theme.secondaryText }}>
                        {book.summary}
                      </p>
                    </div>

                    {existingBook ? (
                      // OPEN BUTTON
                      <button
                        onClick={() => onOpen(existingBook)}
                        className="mt-4 flex items-center justify-center gap-2 w-full h-10 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-sm hover:shadow-md"
                        style={{ 
                          backgroundColor: theme.accent, 
                          color: '#FFF'
                        }}
                      >
                        <Play size={14} fill="currentColor" />
                        <span className="lowercase">open book</span>
                      </button>
                    ) : (
                      // DOWNLOAD BUTTON
                      <button
                        onClick={() => handleDownload(book)}
                        disabled={downloadState === 'loading' || downloadState === 'success'}
                        className="mt-4 flex items-center justify-center gap-2 w-full h-10 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-90 disabled:scale-100 shadow-sm hover:shadow-md overflow-hidden relative"
                        style={getButtonStyle(downloadState, book.moodColor)}
                      >
                        {getButtonContent(downloadState)}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default TitanCloudLibrary;
