import React from 'react';
import { TitanThemeMode, TitanThemeService, THEMES, useTitanTheme } from '../services/titanTheme';

/**
 * ThemePickerView (Phase 10-A)
 * Identity: UI Designer.
 * Mission: A visual selector for the optical dynamics engine.
 */
export const ThemePickerView: React.FC = () => {
  const service = TitanThemeService.getInstance();
  const currentMode = service.mode;
  const theme = useTitanTheme(); // Used for label text colors

  const handleSelect = (mode: TitanThemeMode) => {
    service.setMode(mode);
  };

  const modes: TitanThemeMode[] = ['Modern', 'Sepia', 'Night', 'OLED'];

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-sans font-bold uppercase tracking-wider opacity-60 px-1 lowercase" style={{ color: theme.secondaryText }}>
        optical theme
      </h3>
      
      <div className="grid grid-cols-4 gap-3">
        {modes.map((mode) => {
          const modeTheme = THEMES[mode];
          const isActive = currentMode === mode;

          return (
            <button
              key={mode}
              onClick={() => handleSelect(mode)}
              className="group relative flex flex-col items-center gap-2 outline-none"
            >
              {/* Preview Card */}
              <div 
                className={`relative w-full aspect-[4/5] rounded-xl border transition-all duration-300 ease-out shadow-sm overflow-hidden ${
                   isActive ? 'ring-2 ring-offset-2 scale-105' : 'hover:scale-105'
                }`}
                style={{
                  backgroundColor: modeTheme.background,
                  borderColor: isActive ? 'transparent' : 'rgba(128,128,128,0.2)',
                  boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                 {/* Preview Content: A miniature page */}
                 <div className="absolute inset-4 flex flex-col items-center justify-center">
                    <div 
                      className="font-serif text-2xl font-bold"
                      style={{ color: modeTheme.primaryText }}
                    >
                      Aa
                    </div>
                    {/* Abstract lines representing text */}
                    <div className="w-full h-1 rounded-full mt-3 opacity-20" style={{ backgroundColor: modeTheme.primaryText }} />
                    <div className="w-2/3 h-1 rounded-full mt-1.5 opacity-20" style={{ backgroundColor: modeTheme.primaryText }} />
                 </div>
                 
                 {/* Active Indicator Check */}
                 {isActive && (
                   <div className="absolute bottom-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                   </div>
                 )}
              </div>
              
              {/* Label */}
              <span 
                className="text-[10px] font-medium transition-colors lowercase"
                style={{ 
                    color: isActive ? theme.accent : theme.secondaryText,
                    fontWeight: isActive ? 700 : 500
                }}
              >
                {mode}
              </span>
            </button>
          );
        })}
      </div>

      {/* System Toggle */}
      <div 
        className="mt-2 flex items-center justify-between p-3 rounded-xl"
        style={{ backgroundColor: theme.surface }}
      >
        <span className="text-sm font-medium lowercase" style={{ color: theme.primaryText }}>follow system</span>
        <button 
           onClick={() => handleSelect(currentMode === 'System' ? 'Modern' : 'System')}
           className="relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none"
           style={{ backgroundColor: currentMode === 'System' ? theme.accent : theme.borderColor }}
        >
          <div 
            className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-300 ${
              currentMode === 'System' ? 'translate-x-5' : 'translate-x-0'
            }`} 
          />
        </button>
      </div>
    </div>
  );
};