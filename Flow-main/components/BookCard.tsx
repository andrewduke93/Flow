import React from 'react';
import { Book } from '../types';
import { getDerivedColor, getOverallProgress, formatRelativeDate } from '../utils';
import { Clock, CheckCircle2, PlayCircle } from 'lucide-react';

interface BookCardProps {
  book: Book;
  onClick: () => void;
  viewMode: 'grid' | 'list';
}

export const BookCard: React.FC<BookCardProps> = ({ book, onClick, viewMode }) => {
  const progress = getOverallProgress(book);
  const themeColor = getDerivedColor(book.tintColorHex);

  if (viewMode === 'list') {
    return (
      <div 
        onClick={onClick}
        className="group relative flex items-center gap-6 bg-white p-4 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-transparent hover:border-black/5 transform hover:-translate-y-0.5"
      >
        <div className="relative h-24 w-16 flex-shrink-0 rounded-2xl overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
           <img 
            src={book.coverUrl} 
            alt={`Cover of ${book.title}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {book.isFinished && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
              <CheckCircle2 className="text-white drop-shadow-md" size={24} />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-serif font-bold text-gray-900 truncate leading-tight group-hover:text-black transition-colors">
            {book.title}
          </h3>
          <p className="text-sm text-gray-500 font-medium mb-1">{book.author}</p>
          {book.series && (
            <span className="inline-block bg-gray-100 text-gray-600 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full mb-2">
              {book.series} #{book.seriesIndex}
            </span>
          )}
          
          <div className="flex items-center gap-4 mt-1">
             <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[200px]">
              <div 
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%`, backgroundColor: themeColor }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-400 tabular-nums">{progress}%</span>
          </div>
        </div>

        <div className="text-right">
             <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium bg-gray-50 px-3 py-1.5 rounded-full">
                <Clock size={12} />
                {formatRelativeDate(book.lastOpened)}
             </div>
        </div>
      </div>
    )
  }

  // GRID MODE
  return (
    <div 
      onClick={onClick}
      className="group relative flex flex-col gap-4 cursor-pointer"
    >
      {/* BOUTIQUE GEOMETRY: rounded-[2rem] for Squircle effect */}
      <div className="relative aspect-[2/3] w-full rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] group-hover:shadow-[0_20px_40px_rgb(0,0,0,0.2)] transition-all duration-500 ease-out transform group-hover:-translate-y-2 overflow-hidden bg-gray-100 border border-black/5">
        <img 
          src={book.coverUrl} 
          alt={`Cover of ${book.title}`}
          className="h-full w-full object-cover transition-transform duration-700 ease-in-out group-hover:scale-105"
          loading="lazy"
        />
        
        {/* Dynamic Overlay Gradient based on tint color */}
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ 
            background: `linear-gradient(to top, ${themeColor}CC 0%, transparent 40%)` 
          }}
        />

        {/* Progress Bar overlaid on bottom of cover */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20">
          <div 
            className="h-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%`, backgroundColor: book.isFinished ? '#10b981' : themeColor }}
          />
        </div>

        {/* Play Icon/Status */}
        <div className="absolute bottom-6 right-6 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 delay-75">
          {book.isFinished ? (
             <div className="bg-white/20 backdrop-blur-md p-3 rounded-full border border-white/30 text-white shadow-lg">
                <CheckCircle2 size={24} />
             </div>
          ) : (
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-full text-black shadow-lg hover:scale-110 transition-transform">
               <PlayCircle size={28} fill="currentColor" className="text-white" />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1 px-2">
        <h3 className="font-serif font-bold text-lg text-gray-900 leading-tight line-clamp-2 group-hover:text-black transition-colors">
          {book.title}
        </h3>
        <p className="text-sm text-gray-500 font-sans font-medium">{book.author}</p>
        
        <div className="flex items-center justify-between pt-1">
          {book.series ? (
             <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
              {book.series} {book.seriesIndex && `• ${book.seriesIndex}`}
            </span>
          ) : <span></span>}
           <span className="text-xs text-gray-400 font-medium">
            {formatRelativeDate(book.lastOpened)}
          </span>
        </div>
      </div>
    </div>
  );
};