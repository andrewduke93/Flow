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

export const EmptyLibraryState: React.FC<EmptyLibraryStateProps> = ({ onImport, hasDeleted }) => {
  const theme = useTitanTheme();

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
        className="w-20 h-20 rounded-full flex items-center justify-center mb-8 shadow-2xl group-hover:shadow-ember/20 transition-all duration-500"
        style={{ 
            backgroundColor: theme.accent,
            color: '#FFFFFF'
        }}
      >
        {hasDeleted ? (
            <Sparkles size={28} strokeWidth={2} className="animate-pulse" />
        ) : (
            <FilePlus size={28} strokeWidth={2} />
        )}
      </div>

      <h2 className="text-3xl font-black mb-2 text-center lowercase tracking-tighter leading-none" style={{ color: theme.primaryText }}>
        {hasDeleted ? "poof. gone." : "clean slate."}
      </h2>
      
      <p className="text-[10px] uppercase font-black tracking-[0.2em] text-center mt-3 opacity-30 max-w-[180px]" style={{ color: theme.secondaryText }}>
        {hasDeleted 
            ? "all cleared out. plenty of room for new magic." 
            : "nothing here yet. tap here to find a story."
        }
      </p>

      <div className="mt-8 flex items-center gap-2 opacity-20">
          <div className="w-1.5 h-1.5 rounded-full bg-current" style={{ backgroundColor: theme.primaryText }} />
          <div className="w-10 h-[1px] bg-current" style={{ backgroundColor: theme.primaryText }} />
          <div className="w-1.5 h-1.5 rounded-full bg-current" style={{ backgroundColor: theme.primaryText }} />
      </div>
    </div>
  );
};