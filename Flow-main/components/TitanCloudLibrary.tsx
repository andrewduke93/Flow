import React, { useState, useRef, useEffect } from 'react';
import { CloudService, CloudBook } from '../services/cloudService';
import { useTitanTheme } from '../services/titanTheme';
import { Search, Download, X, Loader2, BookOpen, Library, Check, AlertCircle, Lock, Play } from 'lucide-react';
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
 * The "Visit Library" experience.
 * Identity: The Archivist.
 */
export const TitanCloudLibrary: React.FC<TitanCloudLibraryProps> = ({ existingBooks, onClose, onImport, onOpen }) => {
  const theme = useTitanTheme();
  const service = CloudService.getInstance();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CloudBook[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Track download state per book title to allow parallel/multiple interactions
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});

  // Initial Load of Featured
  useEffect(() => {
      const featured = service.getFeaturedBooks();
      console.log('TitanCloudLibrary: Loading featured books', featured.length, featured);
      setResults(featured);
  }, []);

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    const searchVal = overrideQuery !== undefined ? overrideQuery : query;
    
    if (!searchVal.trim()) {
        // Restore featured if cleared
        setResults(service.getFeaturedBooks());
        return;
    }

    setIsSearching(true);
    setResults([]); // Clear previous

    try {
        const books = await service.searchCuratedBooks(searchVal);
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
          setResults(service.getFeaturedBooks());
      }
  }, [query]);

  const handleDownload = async (book: CloudBook) => {
      const currentState = downloadStates[book.title] || 'idle';
      if (currentState === 'loading' || currentState === 'success') return;

      setDownloadStates(prev => ({ ...prev, [book.title]: 'loading' }));

      try {
          const newBook = await service.downloadBook(book);
          onImport(newBook);
          
          setDownloadStates(prev => ({ ...prev, [book.title]: 'success' }));
          
          // No auto-close. Allow user to add more.
      } catch (e) {
          console.error(`Failed to download ${book.title}`, e);
          setDownloadStates(prev => ({ ...prev, [book.title]: 'error' }));
          
          // Reset error state after 3 seconds so user can retry
          setTimeout(() => {
              setDownloadStates(prev => ({ ...prev, [book.title]: 'idle' }));
          }, 3000);
      }
  };

  // Helper to get button UI based on state
  const getButtonContent = (state: DownloadState, moodColor: string) => {
      switch (state) {
          case 'loading':
              return (
                  <div className="flex items-center gap-2 relative w-full justify-center h-full">
                      <span className="lowercase z-10">retrieving...</span>
                      {/* Scanning Progress Bar */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10 overflow-hidden">
                           <div className="h-full bg-current opacity-50 w-full origin-left animate-[progress-scan_1.5s_ease-in-out_infinite]" />
                      </div>
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
          return { ...baseStyle, backgroundColor: '#10b981' }; // Green
      }
      if (state === 'error') {
          return { ...baseStyle, backgroundColor: '#ef4444' }; // Red
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
      <div className="flex items-center justify-between px-6 py-6 border-b" style={{ borderColor: theme.borderColor }}>
          <div className="flex flex-col gap-1">
             <div className="flex items-center gap-2">
                <Library size={24} style={{ color: theme.accent }} />
                <h2 className="text-2xl font-serif font-black lowercase tracking-tight leading-none" style={{ color: theme.primaryText }}>visit the library</h2>
             </div>
             <p className="text-xs font-medium opacity-60 lowercase max-w-[240px]" style={{ color: theme.secondaryText }}>
                classics from the ether. public domain, free forever.
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
      <div className="px-6 pt-6 pb-2">
          <form onSubmit={handleSearch} className="relative group">
              <input 
                  type="text"
                  placeholder="search title, author, genre, or keyword..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 rounded-2xl text-lg font-medium outline-none transition-all shadow-sm focus:shadow-md"
                  style={{ 
                      backgroundColor: theme.surface, 
                      color: theme.primaryText,
                      border: `1px solid ${theme.borderColor}`
                  }}
              />
              <Search 
                  size={20} 
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
          
          {/* SEARCH LOADING INDICATOR */}
          <AnimatePresence>
            {isSearching && (
                 <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-center gap-2 py-4 text-sm font-medium"
                    style={{ color: theme.secondaryText }}
                 >
                     <Loader2 className="animate-spin" size={16} />
                     <span>scanning archives...</span>
                 </motion.div>
            )}
          </AnimatePresence>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto px-6 pb-20 pt-6 custom-scrollbar">
          
          {/* SEARCH LOADING INDICATOR (Inside Content Area for Stability) */}
          <AnimatePresence>
            {isSearching && (
                 <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-center gap-2 py-4 mb-2 text-sm font-medium"
                    style={{ color: theme.secondaryText }}
                 >
                     <Loader2 className="animate-spin" size={16} />
                     <span>scanning archives...</span>
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
                          <h3 className="font-bold text-sm lowercase mb-1" style={{ color: theme.primaryText }}>locked in the vault</h3>
                          <p className="text-xs font-medium leading-relaxed opacity-70 lowercase" style={{ color: theme.secondaryText }}>
                              bad news: that book is still under copyright protection. 
                              <br/>
                              good news: we found these public domain classics that share the same soul.
                          </p>
                      </div>
                  </motion.div>
              )}
          </AnimatePresence>

          {/* SECTION HEADER */}
          {!isSearching && !isCopyrightSubstituted && (
            <div className="mb-4 flex items-center gap-2 opacity-50">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.secondaryText }}>
                    {query ? 'results' : 'curated selection'}
                </span>
                <div className="h-px flex-1 bg-current opacity-20" style={{ color: theme.secondaryText }} />
            </div>
          )}

          {/* EMPTY STATE (Search with no results) */}
          {!isSearching && results.length === 0 && query && (
              <div className="flex flex-col items-center justify-center h-40 text-center opacity-60">
                  <p className="font-serif italic text-lg lowercase" style={{ color: theme.secondaryText }}>
                      "the library is vast, but this shelf is empty."
                  </p>
              </div>
          )}

          {/* GRID */}
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
                              key={book.title}
                              initial={false}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2, delay: i * 0.03 }}
                              className="relative p-5 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group border"
                              style={{ 
                                  backgroundColor: theme.surface,
                                  borderColor: theme.borderColor 
                              }}
                          >
                              {/* Mood Gradient */}
                              <div 
                                  className="absolute top-0 right-0 w-40 h-40 rounded-full blur-[60px] opacity-[0.15] transition-opacity group-hover:opacity-[0.25]"
                                  style={{ backgroundColor: book.moodColor || theme.accent }}
                              />

                              <div className="relative z-10 flex flex-col h-full">
                                  <div className="flex-1">
                                      <h3 className="font-serif font-bold text-xl leading-tight mb-1" style={{ color: theme.primaryText }}>
                                          {book.title}
                                      </h3>
                                      <p className="text-sm font-medium opacity-60 uppercase tracking-wider mb-2" style={{ color: theme.primaryText }}>
                                          {book.author}
                                      </p>
                                      
                                      {/* Enhanced Metadata: Genre & Tags */}
                                      <div className="flex flex-wrap gap-2 mb-4">
                                          {book.genre && (
                                              <span 
                                                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter"
                                                  style={{ 
                                                      backgroundColor: `${theme.accent}20`, 
                                                      color: theme.accent,
                                                      border: `1px solid ${theme.accent}30`
                                                  }}
                                              >
                                                  {book.genre}
                                              </span>
                                          )}
                                          {book.tags?.slice(0, 3).map((tag, i) => (
                                              <span 
                                                  key={i}
                                                  className="px-2 py-0.5 rounded text-[10px] font-medium opacity-50 border border-white/10"
                                                  style={{ color: theme.primaryText }}
                                              >
                                                  {tag.toLowerCase()}
                                              </span>
                                          ))}
                                      </div>

                                      <p className="text-sm leading-relaxed opacity-80 line-clamp-2" style={{ color: theme.secondaryText }}>
                                          {book.summary}
                                      </p>
                                  </div>

                                  {existingBook ? (
                                      // OPEN BUTTON
                                      <button
                                          onClick={() => onOpen(existingBook)}
                                          className="mt-5 flex items-center justify-center gap-2 w-full h-11 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-sm hover:shadow-md"
                                          style={{ 
                                              backgroundColor: theme.accent, 
                                              color: '#FFF',
                                              border: 'none'
                                          }}
                                      >
                                          <Play size={16} fill="currentColor" />
                                          <span className="lowercase">open book</span>
                                      </button>
                                  ) : (
                                      // DOWNLOAD BUTTON
                                      <button
                                          onClick={() => handleDownload(book)}
                                          disabled={downloadState === 'loading' || downloadState === 'success'}
                                          className="mt-5 flex items-center justify-center gap-2 w-full h-11 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-90 disabled:scale-100 shadow-sm hover:shadow-md overflow-hidden relative"
                                          style={getButtonStyle(downloadState, book.moodColor)}
                                      >
                                          {getButtonContent(downloadState, book.moodColor)}
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