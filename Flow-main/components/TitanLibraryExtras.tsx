import React from 'react';
import { FilePlus, Sparkles } from 'lucide-react';
import { useTitanTheme } from '../services/titanTheme';

interface LibraryHeaderProps {
  scrollOffset: number;
  title: string;
  subtitle: string;
}

/**
 * LibraryHeader
 * A large title header that replicates the iOS Large Title behavior.
 * Fluid typography for mobile/desktop.
 */
export const LibraryHeader: React.FC<LibraryHeaderProps> = ({ scrollOffset, title, subtitle }) => {
  const theme = useTitanTheme();
  // Logic: Opacity = 1.0 - (scrollOffset / 50)
  const opacity = Math.max(0, Math.min(1, 1 - scrollOffset / 100));
  const scale = Math.max(0.95, 1 - scrollOffset / 1000); 
  const translateY = -scrollOffset * 0.2; 

  return (
    <div 
      className="pt-4 md:pt-8 pb-2 md:pb-4 px-1 origin-left"
      style={{ 
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        display: opacity <= 0 ? 'none' : 'block',
        marginBottom: opacity <= 0 ? `-${100 - scrollOffset}px` : '0px'
      }}
    >
      <h1 
        className="text-4xl md:text-6xl font-serif font-bold tracking-tight mb-1 md:mb-2 lowercase" 
        style={{ color: theme.primaryText }}
      >
        {title}
      </h1>
      <p 
        className="text-lg md:text-xl font-sans font-medium lowercase" 
        style={{ color: theme.secondaryText }}
      >
        {subtitle}
      </p>
    </div>
  );
};

interface EmptyLibraryStateProps {
  onImport: () => void;
  hasDeleted?: boolean;
}

// Soulful empty state messages
const emptyMessages = [
  { title: 'blank page energy', sub: 'every great library starts somewhere. this is your somewhere.' },
  { title: 'room for stories', sub: 'the best bookshelves start empty. what will you fill it with?' },
  { title: 'ready when you are', sub: 'no rush. your next favorite book is waiting to be found.' },
  { title: 'quiet anticipation', sub: 'an empty shelf is just a story that hasn\'t started yet.' }
];

const deletedMessages = [
  { title: 'fresh start', sub: 'sometimes we need to clear the shelf to see what matters.' },
  { title: 'poof. gone.', sub: 'all cleared out. plenty of room for new magic.' },
  { title: 'clean sweep', sub: 'out with the old, in with the... whatever speaks to you next.' }
];

export const EmptyLibraryState: React.FC<EmptyLibraryStateProps> = ({ onImport, hasDeleted }) => {
  const theme = useTitanTheme();
  
  // Pick a random message (stable per render)
  const [message] = React.useState(() => {
    const pool = hasDeleted ? deletedMessages : emptyMessages;
    return pool[Math.floor(Math.random() * pool.length)];
  });

  return (
    <div 
      onClick={onImport}
      className="group flex flex-col items-center justify-center p-12 rounded-[40px] cursor-pointer transition-all duration-500 max-w-sm mx-auto mt-20 hover:scale-[0.98] active:scale-95"
      style={{ 
          backgroundColor: theme.surface,
          border: `1px solid ${theme.borderColor}`
      }}
    >
      <div 
        className="w-20 h-20 rounded-full flex items-center justify-center mb-8 shadow-2xl transition-all duration-500"
        style={{ 
            backgroundColor: theme.accent,
            color: '#FFFFFF'
        }}
      >
        {hasDeleted ? (
            <Sparkles size={28} strokeWidth={2} className="animate-pulse" />
        ) : (
            <span className="text-3xl">📖</span>
        )}
      </div>

      <h2 className="text-2xl font-black mb-2 text-center lowercase tracking-tight leading-tight" style={{ color: theme.primaryText }}>
        {message.title}
      </h2>
      
      <p className="text-xs text-center mt-2 opacity-40 max-w-[220px] lowercase leading-relaxed" style={{ color: theme.secondaryText }}>
        {message.sub}
      </p>

      <div className="mt-8 px-5 py-2.5 rounded-full text-xs font-semibold lowercase tracking-wide opacity-60 hover:opacity-100 transition-opacity" style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}>
        find a book →
      </div>
    </div>
  );
};