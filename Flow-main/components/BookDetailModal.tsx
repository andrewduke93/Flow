import React, { useRef } from 'react';
import { Book } from '../types';
import { useTitanTheme } from '../services/titanTheme';
import { Play, ArrowLeft, BookOpen, Heart, Trash2, CheckCircle, BookMarked } from 'lucide-react';
import { RSVPHapticEngine } from '../services/rsvpHaptics';

interface BookDetailModalProps {
  book: Book;
  onClose: () => void;
  onOpen: (book: Book) => void;
  onToggleFavorite: (bookId: string, isFavorite: boolean) => void;
  onToggleRead: (bookId: string, isRead: boolean) => void;
  onDelete: (bookId: string) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({ 
    book, 
    onClose, 
    onOpen, 
    onToggleFavorite, 
    onToggleRead, 
    onDelete 
}) => {
  const theme = useTitanTheme();
  const lastActionTime = useRef(0);
  
  // Debounced action helper
  const safeAction = (action: () => void) => {
      const now = Date.now();
      if (now - lastActionTime.current < 300) return;
      lastActionTime.current = now;
      RSVPHapticEngine.impactLight();
      action();
  };
  
  // Calculate spine color or use tint
  const spineColor = book.tintColorHex || '#333';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 perspective-[2000px]">
        {/* Backdrop */}
        <div 
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            style={{animation: 'fadeIn 400ms cubic-bezier(0.16, 1, 0.3, 1)'}}
        />

        {/* The Floating Book Card */}
        <div 
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col origin-left z-50 max-h-[90vh]"
            style={{ backgroundColor: theme.surface, animation: 'slideUp 500ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
            {/* 1. COVER DISPLAY AREA */}
            <div 
                className="relative overflow-hidden flex items-center justify-center p-8 min-h-[280px]"
                style={{ 
                    backgroundColor: book.tintColorHex ? `${book.tintColorHex}08` : '#f5f5f7'
                }}
            >
                {/* The Cover Image */}
                <div 
                    className="relative w-36 h-52 shadow-[0_16px_40px_rgba(0,0,0,0.25)] rounded-sm"
                    style={{animation: 'fadeIn 400ms cubic-bezier(0.16, 1, 0.3, 1) 100ms both'}}
                >
                    {book.coverUrl ? (
                        <img 
                            src={book.coverUrl} 
                            className="w-full h-full object-cover rounded-sm" 
                            alt={book.title}
                        />
                    ) : (
                        <div 
                            className="w-full h-full flex flex-col items-center justify-center p-6 text-center border-[6px] border-double"
                            style={{ 
                                backgroundColor: spineColor,
                                borderColor: 'rgba(255,255,255,0.2)',
                                color: '#FFF'
                            }}
                        >
                            <BookOpen size={28} className="mb-4 opacity-40" />
                            <h2 className="font-serif font-black text-base leading-tight line-clamp-3">{book.title}</h2>
                        </div>
                    )}
                </div>

                {/* Lighting Gradient (Spine Fold) */}
                <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black/10 to-transparent pointer-events-none mix-blend-multiply" />
                
                {/* Favorite Button (Floating) */}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(book.id, !book.isFavorite);
                    }}
                    className="absolute top-6 right-6 p-3.5 rounded-full bg-black/10 backdrop-blur-md hover:bg-black/20 transition-all text-white z-50 shadow-lg active:scale-90"
                >
                    <Heart 
                        size={22} 
                        fill={book.isFavorite ? "#E25822" : "none"} 
                        stroke={book.isFavorite ? "#E25822" : "currentColor"} 
                        className="drop-shadow-sm"
                    />
                </button>
            </div>

            {/* 2. METADATA & PRIMARY ACTION */}
            <div 
                className="p-6 flex flex-col gap-5 border-t relative z-10"
                style={{ backgroundColor: theme.surface, borderColor: theme.borderColor }}
            >
                 <div className="text-center">
                    <h2 className="font-serif font-bold text-2xl leading-tight lowercase tracking-tight" style={{ color: theme.primaryText }}>{book.title}</h2>
                    <p className="font-sans text-xs font-medium opacity-40 mt-1.5" style={{ color: theme.secondaryText }}>{book.author}</p>
                    
                    {/* ENHANCED METADATA */}
                    <div className="flex flex-wrap justify-center gap-2 mt-6">
                        {book.genre && (
                            <span 
                                className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest"
                                style={{ 
                                    backgroundColor: `${theme.accent}15`, 
                                    color: theme.accent,
                                    border: `1px solid ${theme.accent}20`
                                }}
                            >
                                {book.genre}
                            </span>
                        )}
                        {book.tags?.slice(0, 3).map((tag, i) => (
                            <span 
                                key={i}
                                className="px-3 py-1 rounded-full text-[9px] font-bold opacity-30 border border-current uppercase tracking-tighter"
                                style={{ color: theme.primaryText }}
                            >
                                {tag.toLowerCase()}
                            </span>
                        ))}
                    </div>
                    
                    {book.description && (
                        <div className="mt-5 text-left max-h-24 overflow-y-auto px-1 custom-scrollbar">
                           <p className="text-xs leading-relaxed opacity-60 italic" style={{ color: theme.secondaryText }}>
                              "{book.description}"
                           </p>
                        </div>
                    )}
                 </div>

                 {/* Open Button with soulful text */}
                 <button 
                    onClick={() => safeAction(() => onOpen(book))}
                    className="h-12 w-full rounded-xl flex items-center justify-center gap-2 font-semibold text-white shadow-lg active:scale-[0.98] transition-transform"
                    style={{ backgroundColor: theme.accent }}
                 >
                     <Play size={16} fill="currentColor" />
                     <span className="lowercase text-base">
                       {book.bookmarkProgress && book.bookmarkProgress > 0.01 
                         ? book.bookmarkProgress > 0.9 
                           ? 'finish it ✨'
                           : 'continue reading'
                         : 'start this journey'}
                     </span>
                 </button>
            </div>

            {/* 3. SECONDARY ACTIONS */}
            <div 
                className="grid grid-cols-3 divide-x border-t"
                style={{ borderColor: theme.borderColor, color: theme.secondaryText }}
            >
                <button 
                    onClick={() => {
                        RSVPHapticEngine.impactMedium();
                        if(confirm('Delete this book?')) {
                            onDelete(book.id);
                            onClose();
                        }
                    }}
                    className="h-14 flex items-center justify-center gap-1.5 hover:bg-red-500/10 transition-colors text-red-400 hover:text-red-500"
                >
                    <Trash2 size={16} />
                    <span className="text-xs font-medium">delete</span>
                </button>

                <button 
                    onClick={() => safeAction(() => onToggleRead(book.id, !book.isFinished))}
                    className="h-14 flex items-center justify-center gap-1.5 hover:bg-black/5 transition-colors"
                    style={{ color: book.isFinished ? '#10b981' : theme.secondaryText }}
                >
                    {book.isFinished ? <BookMarked size={16} /> : <CheckCircle size={16} />}
                    <span className="text-xs font-medium">{book.isFinished ? 'read' : 'mark read'}</span>
                </button>

                <button 
                    onClick={onClose}
                    className="h-12 flex items-center justify-center gap-1.5 hover:bg-black/5 transition-colors"
                >
                    <ArrowLeft size={16} />
                    <span className="text-xs font-medium">back</span>
                </button>
            </div>
        </div>
    </div>
  );
};
