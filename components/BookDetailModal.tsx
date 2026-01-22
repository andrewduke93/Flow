import React from 'react';
import { Book } from '../types';
import { motion } from 'framer-motion';
import { useTitanTheme } from '../services/titanTheme';
import { Play, ArrowLeft, BookOpen, Heart, Trash2, CheckCircle, BookMarked } from 'lucide-react';

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
  
  // Calculate spine color or use tint
  const spineColor = book.tintColorHex || '#333';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 perspective-[2000px]">
        {/* Backdrop */}
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* The Floating Book Card */}
        <motion.div 
            className="relative w-full max-w-sm bg-white rounded-r-2xl rounded-l-md shadow-2xl overflow-hidden flex flex-col origin-left z-50 max-h-[90vh]"
            style={{ backgroundColor: theme.surface }}
            initial={{ rotateY: -90, x: -60, opacity: 0 }}
            animate={{ rotateY: 0, x: 0, opacity: 1 }}
            exit={{ rotateY: -90, x: -60, opacity: 0 }}
            transition={{ 
                type: "spring", 
                damping: 24, 
                stiffness: 160, 
                mass: 0.8 
            }}
        >
            {/* 1. COVER DISPLAY AREA */}
            <div 
                className="relative overflow-hidden flex items-center justify-center p-8 min-h-[300px]"
                style={{ 
                    backgroundColor: book.tintColorHex ? `${book.tintColorHex}15` : '#f5f5f7'
                }}
            >
                {/* The Cover Image */}
                <motion.div 
                    className="relative w-40 h-60 shadow-[0_15px_40px_rgba(0,0,0,0.3)] rounded-sm"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                >
                    {book.coverUrl ? (
                        <img 
                            src={book.coverUrl} 
                            className="w-full h-full object-cover rounded-sm" 
                            alt={book.title}
                        />
                    ) : (
                        <div 
                            className="w-full h-full flex flex-col items-center justify-center p-4 text-center border-4 border-double"
                            style={{ 
                                backgroundColor: spineColor,
                                borderColor: 'rgba(255,255,255,0.3)',
                                color: '#FFF'
                            }}
                        >
                            <BookOpen size={32} className="mb-4 opacity-50" />
                            <h2 className="font-serif font-black text-lg leading-tight line-clamp-3">{book.title}</h2>
                        </div>
                    )}
                </motion.div>

                {/* Lighting Gradient (Spine Fold) */}
                <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-black/10 to-transparent pointer-events-none mix-blend-multiply" />
                
                {/* Favorite Button (Floating) */}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(book.id, !book.isFavorite);
                    }}
                    className="absolute top-4 right-4 p-3 rounded-full bg-black/20 backdrop-blur-md hover:bg-black/40 transition-colors text-white z-50 shadow-lg active:scale-90"
                >
                    <Heart 
                        size={24} 
                        fill={book.isFavorite ? "#E25822" : "none"} 
                        stroke={book.isFavorite ? "#E25822" : "currentColor"} 
                        className="drop-shadow-sm"
                    />
                </button>
            </div>

            {/* 2. METADATA & PRIMARY ACTION */}
            <div 
                className="p-6 flex flex-col gap-4 border-t relative z-10"
                style={{ backgroundColor: theme.surface, borderColor: theme.borderColor }}
            >
                 <div className="text-center">
                    <h2 className="font-serif font-bold text-2xl leading-tight lowercase" style={{ color: theme.primaryText }}>{book.title}</h2>
                    <p className="font-sans text-sm font-medium opacity-60 lowercase mt-1" style={{ color: theme.secondaryText }}>{book.author}</p>
                 </div>

                 {/* Open Button */}
                 <button 
                    onClick={() => onOpen(book)}
                    className="h-14 w-full rounded-2xl flex items-center justify-center gap-2 font-bold text-white shadow-lg active:scale-95 transition-transform"
                    style={{ backgroundColor: theme.accent }}
                 >
                     <Play size={20} fill="currentColor" />
                     <span className="lowercase text-lg">open book</span>
                 </button>
            </div>

            {/* 3. SECONDARY ACTIONS (Unified Context Menu) */}
            <div 
                className="grid grid-cols-3 divide-x border-t"
                style={{ borderColor: theme.borderColor }}
            >
                {/* Delete - Moved to LEFT */}
                <button 
                    onClick={() => {
                        // Optional confirmation could go here
                        if(confirm('Are you sure you want to delete this book?')) {
                            onDelete(book.id);
                            onClose();
                        }
                    }}
                    className="h-16 flex flex-col items-center justify-center gap-1 hover:bg-red-500/10 transition-colors group"
                >
                    <Trash2 size={20} className="text-red-400 group-hover:text-red-600 transition-colors" />
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-red-400 group-hover:text-red-600">
                        delete
                    </span>
                </button>

                {/* Toggle Read - Moved to CENTER */}
                <button 
                    onClick={() => onToggleRead(book.id, !book.isFinished)}
                    className="h-16 flex flex-col items-center justify-center gap-1 hover:bg-black/5 transition-colors"
                >
                    {book.isFinished ? (
                        <BookMarked size={20} className="text-emerald-500" />
                    ) : (
                        <CheckCircle size={20} style={{ color: theme.secondaryText }} />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-60" style={{ color: theme.primaryText }}>
                        {book.isFinished ? 'read' : 'finish'}
                    </span>
                </button>

                {/* Back - Moved to RIGHT */}
                <button 
                    onClick={onClose}
                    className="h-16 flex flex-col items-center justify-center gap-1 hover:bg-black/5 transition-colors"
                >
                    <ArrowLeft size={20} style={{ color: theme.primaryText }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-60" style={{ color: theme.primaryText }}>
                        back
                    </span>
                </button>
            </div>
        </motion.div>
    </div>
  );
};
