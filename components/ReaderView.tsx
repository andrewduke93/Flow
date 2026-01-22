import React, { useState, useEffect, useMemo } from 'react';
import { Book, Chapter } from '../types';
import { ArrowLeft, BookOpen, Settings, Clock, ArrowRight } from 'lucide-react';
import { getDerivedColor, calculateReadTime } from '../utils';

interface ReaderViewProps {
  book: Book;
  onClose: () => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({ book, onClose }) => {
  const [showControls, setShowControls] = useState(true);
  const themeColor = getDerivedColor(book.tintColorHex);

  // Identify current chapter based on bookmark, or default to first
  const currentChapter = useMemo(() => {
    if (!book.chapters || book.chapters.length === 0) return null;
    return book.chapters.find(c => c.id === book.bookmarkChapterID) || book.chapters[0];
  }, [book]);

  const readTime = currentChapter ? calculateReadTime(currentChapter.wordCount) : 0;

  // Auto-hide controls after inaction for "Invisible" feel
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handleActivity = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('click', handleActivity);
    timeout = setTimeout(() => setShowControls(false), 3000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('click', handleActivity);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-[#fbfbfd] z-50 flex flex-col h-screen w-screen overflow-hidden">
      
      {/* Top Bar - "Tactile" Sticky Header */}
      <div 
        className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 transition-transform duration-500 ease-in-out ${showControls ? 'translate-y-0' : '-translate-y-full'}`}
      >
        <button 
          onClick={onClose}
          className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors bg-white/80 backdrop-blur-md px-4 py-2 rounded-full shadow-sm hover:shadow-md border border-black/5 lowercase"
        >
          <ArrowLeft size={18} />
          <span className="font-semibold text-sm">back home</span>
        </button>

        <div className="opacity-0 md:opacity-100 transition-opacity font-serif font-bold text-gray-800 truncate max-w-[300px] lowercase">
            {book.title}
        </div>

        <div className="flex items-center gap-3">
           <button className="p-2 text-gray-500 hover:text-black bg-white/80 backdrop-blur-md rounded-full hover:bg-white transition-all shadow-sm border border-black/5">
              <Settings size={20} />
           </button>
           <button className="p-2 text-gray-500 hover:text-black bg-white/80 backdrop-blur-md rounded-full hover:bg-white transition-all shadow-sm border border-black/5">
              <BookOpen size={20} />
           </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto scroll-smooth px-6 md:px-0">
        <div className="max-w-2xl mx-auto py-32 md:py-40">
           
           {currentChapter ? (
             <>
                {/* Chapter Header */}
                <div className="mb-16 text-center">
                  <span 
                    className="text-xs font-bold tracking-[0.2em] uppercase mb-4 block lowercase"
                    style={{ color: themeColor }}
                  >
                    chapter {currentChapter.sortOrder + 1}
                  </span>
                  <h2 className="font-serif text-4xl md:text-5xl font-bold text-black mb-6 leading-tight lowercase">
                    {currentChapter.title}
                  </h2>
                  <div className="flex items-center justify-center gap-2 text-gray-400 text-sm font-medium mb-8 lowercase">
                     <Clock size={14} />
                     <span>{readTime} min ride</span>
                  </div>
                  <div className="w-16 h-1 bg-gray-200 mx-auto rounded-full"></div>
                </div>

                {/* Content - "New York" font for body */}
                <article 
                  className="prose prose-xl prose-gray mx-auto font-serif leading-relaxed text-gray-800 antialiased"
                  dangerouslySetInnerHTML={{ __html: currentChapter.content }}
                />
                
                <div className="mt-32 flex items-center justify-center">
                    <button className="flex flex-col items-center gap-2 text-gray-400 hover:text-black transition-colors group">
                      <span className="text-sm font-semibold tracking-widest uppercase lowercase">keep rolling</span>
                      <div className="p-3 rounded-full border border-gray-200 group-hover:border-black transition-colors">
                          <ArrowRight size={24} />
                      </div>
                    </button>
                </div>
             </>
           ) : (
             <div className="text-center text-gray-400 mt-20 lowercase">
               <p>no content available.</p>
             </div>
           )}
        </div>
      </div>

      {/* Progress Bar - "Invisible" until needed */}
      <div 
        className={`absolute bottom-0 left-0 right-0 h-1.5 bg-gray-100 transition-transform duration-500 ${showControls ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div 
          className="h-full transition-all duration-300 ease-out"
          style={{ width: `${(book.bookmarkProgress || 0) * 100}%`, backgroundColor: themeColor }}
        />
      </div>
    </div>
  );
};