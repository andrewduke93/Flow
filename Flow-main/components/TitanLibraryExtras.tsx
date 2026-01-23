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
      className="group flex flex-col items-center justify-center p-8 md:p-12 border-2 border-dashed rounded-3xl cursor-pointer transition-all duration-300 max-w-sm md:max-w-md mx-auto mt-8 md:mt-12 hover:shadow-xl hover:scale-[1.02]"
      style={{ 
          borderColor: theme.borderColor,
          backgroundColor: theme.surface,
      }}
    >
      <div 
        className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center mb-4 md:mb-6 shadow-inner group-hover:shadow-lg transition-all duration-300"
        style={{ 
            backgroundColor: theme.accent, // Use unified Ember accent
            color: '#FFFFFF'
        }}
      >
        {hasDeleted ? (
            <Sparkles size={24} strokeWidth={1.5} className="md:w-8 md:h-8 animate-pulse" />
        ) : (
            <FilePlus size={24} strokeWidth={1.5} className="md:w-8 md:h-8" />
        )}
      </div>

      <h2 className="text-xl md:text-2xl font-serif font-bold mb-2 text-center lowercase" style={{ color: theme.primaryText }}>
        {hasDeleted ? "poof. gone." : "clean slate."}
      </h2>
      
      <p className="font-sans font-medium text-center leading-relaxed text-sm md:text-base max-w-[250px] md:max-w-xs lowercase" style={{ color: theme.secondaryText }}>
        {hasDeleted 
            ? "all cleared out. plenty of room for new magic." 
            : "nothing here yet, but that’s cool. tap here to find a story."
        }
      </p>
    </div>
  );
};