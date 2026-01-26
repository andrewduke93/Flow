import React from 'react';
import { Book } from '../types';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

interface ZuneLibraryProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onImport: () => void;
}

export const ZuneLibrary: React.FC<ZuneLibraryProps> = ({ books, onSelectBook, onImport }) => {
  return (
    <div className="w-full h-full overflow-y-auto px-10 pb-32 custom-scrollbar">
      <div className="mb-8 opacity-20">
        <p className="text-sm font-bold tracking-widest uppercase">
          Archive / {books.length} Entries
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
        {books.map((book, i) => (
           <motion.div
             key={book.id}
             onClick={() => onSelectBook(book)}
             className="group relative aspect-[3/4] bg-neutral-900 rounded-2xl overflow-hidden cursor-pointer active:scale-95 transition-all duration-300 border border-white/5 hover:border-white/20"
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: i * 0.03 }}
           >
                {book.coverUrl ? (
                 <div className="w-full h-full relative">
                  <img
                    src={book.coverUrl}
                    className="w-full h-full object-cover opacity-40 group-hover:opacity-100 transition-opacity duration-500"
                    loading="lazy"
                    style={{ position: 'absolute', inset: 0, zIndex: 2, opacity: 0, transition: 'opacity 0.5s' }}
                    onLoad={e => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; }}
                  />
                  <div className="w-full h-full flex items-center justify-center bg-neutral-800 animate-pulse" style={{ zIndex: 1, position: 'absolute', inset: 0 }}>
                    <h3 className="text-center font-bold text-white/10 uppercase tracking-tighter text-[10px]">{book.title}</h3>
                  </div>
                 </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-4 bg-neutral-800">
                    <h3 className="text-center font-bold text-white/10 uppercase tracking-tighter text-[10px]">{book.title}</h3>
                  </div>
                )}
              
              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent">
                 <h4 className="text-sm font-black truncate text-white mb-0.5 lowercase tracking-tight">{book.title}</h4>
                 <p className="text-[10px] text-white/40 truncate lowercase mb-3">{book.author}</p>
                 
                 <div className="h-0.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-zune-ember" 
                        style={{ width: `${(book.bookmarkProgress || 0) * 100}%` }} 
                    />
                 </div>
              </div>
           </motion.div>
        ))}

        <button 
           onClick={onImport}
           className="aspect-[3/4] rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-3 text-white/20 hover:text-white/60 hover:border-white/30 transition-all duration-500 hover:bg-white/5 group"
        >
            <Plus size={24} className="group-hover:rotate-90 transition-transform duration-500" />
            <span className="font-bold lowercase tracking-tighter text-xs">import</span>
        </button>
      </div>
    </div>
  );
};