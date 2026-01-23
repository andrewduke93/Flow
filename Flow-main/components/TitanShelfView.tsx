import React, { useMemo } from 'react';
import { Book } from '../types';
import { motion } from 'framer-motion';
import { useTitanTheme } from '../services/titanTheme';

interface TitanShelfViewProps {
  books: Book[];
  onBookSelect: (book: Book) => void;
  onInspectBook: (book: Book) => void; // New delegate
  onToggleFavorite?: (bookId: string, isFavorite: boolean) => void;
}

/**
 * TitanSpine
 */
const TitanSpine: React.FC<{ 
    book: Book, 
    onClick: () => void,
}> = ({ book, onClick }) => {
    
    // Procedural Width
    const width = useMemo(() => {
        let score = book.chapters?.reduce((acc, c) => acc + c.wordCount, 0) || book.title.length * 500;
        const minW = 36;
        const maxW = 64; 
        const normalized = Math.min(1, Math.max(0, score / 100000));
        return minW + (normalized * (maxW - minW));
    }, [book]);

    const authorLastName = useMemo(() => {
        const parts = book.author.split(' ');
        return parts.length > 0 ? parts[parts.length - 1] : book.author;
    }, [book.author]);

    const spineColor = book.tintColorHex || '#333';

    return (
        <motion.div
            layoutId={`spine-${book.id}`}
            onClick={onClick}
            className="relative h-72 cursor-pointer group mx-[1px] mb-0 rounded-sm overflow-hidden transform-gpu"
            style={{ 
                width: `${width}px`,
                backgroundColor: spineColor,
                boxShadow: 'inset 0 0 15px rgba(0,0,0,0.3), inset 1px 0 0 rgba(255,255,255,0.1)'
            }}
            whileHover={{ 
                y: -8, 
                zIndex: 10,
                transition: { type: 'spring', stiffness: 400, damping: 25 }
            }}
        >
            {/* Texture */}
            <div 
                className="absolute inset-0 opacity-30 pointer-events-none mix-blend-multiply grayscale"
                style={{ 
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Creases */}
            <div className="absolute top-0 bottom-0 left-[2px] w-[1px] bg-black/20" />
            <div className="absolute top-0 bottom-0 right-[2px] w-[1px] bg-black/20" />

            {/* Typography */}
            <div className="absolute inset-0 flex flex-col items-center py-6 px-1 z-20">
                <div 
                    className="flex-none pt-2 pb-6"
                    style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                >
                     <span className="font-sans text-[9px] font-bold text-white/70 uppercase tracking-[0.15em]">
                        {authorLastName}
                     </span>
                </div>

                <div 
                    className="flex-1 flex items-center justify-center w-full overflow-hidden"
                    style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                >
                     <span 
                        className="font-serif font-semibold text-xs md:text-sm tracking-wide text-white/95 text-center leading-relaxed line-clamp-3"
                        style={{ 
                            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                            fontVariant: 'small-caps'
                        }}
                     >
                         {book.title.toLowerCase()}
                     </span>
                </div>

                <div className="flex-none mt-auto pt-4 opacity-50">
                     <div className="w-4 h-4 border border-white/60 rounded-full flex items-center justify-center">
                         <div className="w-1.5 h-1.5 bg-white/60 rounded-sm" />
                     </div>
                </div>
            </div>
            
            {/* Lighting */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none" />

        </motion.div>
    );
};

/**
 * TitanShelfView
 */
export const TitanShelfView: React.FC<TitanShelfViewProps> = ({ books, onInspectBook }) => {
  return (
    <div className="relative w-full pb-32">
        {/* SHELF CONTAINER */}
        <div className="flex flex-wrap items-end gap-y-12 px-4 perspective-[1000px]">
            {books.map((book) => (
                <TitanSpine 
                    key={book.id} 
                    book={book} 
                    onClick={() => onInspectBook(book)} 
                />
            ))}
            <div className="flex-1 min-w-[50px] border-b-[8px] h-72 rounded-sm border-neutral-200/5" />
        </div>

        {/* Shelf Line */}
        <div className="fixed bottom-0 left-0 right-0 h-px bg-transparent pointer-events-none" />
    </div>
  );
};
