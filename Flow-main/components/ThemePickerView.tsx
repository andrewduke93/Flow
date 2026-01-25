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
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] font-medium opacity-50 lowercase" style={{ color: theme.secondaryText }}>
        appearance
      </h3>
      
      <div className="grid grid-cols-4 gap-2">
        {modes.map((mode) => {
          const modeTheme = THEMES[mode];
          const isActive = currentMode === mode;

          return (
            <button
              key={mode}
              onClick={() => handleSelect(mode)}
              className="group relative flex flex-col items-center gap-1.5 outline-none"
            >
              {/* Preview Card */}
              <div 
                className={`relative w-full aspect-[4/5] rounded-xl border transition-all duration-200 ease-out overflow-hidden ${
                   isActive ? 'ring-2 ring-offset-1 scale-[1.03]' : 'hover:scale-[1.02]'
                }`}
                style={{
                  backgroundColor: modeTheme.background,
                  borderColor: isActive ? 'transparent' : 'rgba(128,128,128,0.15)',
                  ringColor: theme.accent
                }}
              >
                 {/* Preview Content: A miniature page */}
                 <div className="absolute inset-3 flex flex-col items-center justify-center">
                    <div 
                      className="font-serif text-xl font-semibold"
                      style={{ color: modeTheme.primaryText }}
                    >
                      Aa
                    </div>
                    {/* Abstract lines representing text */}
                    <div className="w-full h-0.5 rounded-full mt-2 opacity-15" style={{ backgroundColor: modeTheme.primaryText }} />
                    <div className="w-2/3 h-0.5 rounded-full mt-1 opacity-15" style={{ backgroundColor: modeTheme.primaryText }} />
                 </div>
                 
                 {/* Active Indicator Check */}
                 {isActive && (
                   <div className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                      <svg width="8" height="6" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                   </div>
                 )}
              </div>
              
              {/* Label */}
              <span 
                className="text-[9px] font-medium transition-colors lowercase"
                style={{ 
                    color: isActive ? theme.accent : theme.secondaryText,
                    opacity: isActive ? 1 : 0.6
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
        className="mt-1 flex items-center justify-between p-3 rounded-xl border"
        style={{ backgroundColor: theme.surface, borderColor: theme.borderColor }}
      >
        <span className="text-xs font-medium lowercase" style={{ color: theme.primaryText }}>follow system</span>
        <button 
           onClick={() => handleSelect(currentMode === 'System' ? 'Modern' : 'System')}
           className="relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none"
           style={{ backgroundColor: currentMode === 'System' ? theme.accent : theme.borderColor }}
        >
          <div 
            className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ${
              currentMode === 'System' ? 'translate-x-5' : 'translate-x-0'
            }`} 
          />
        </button>
      </div>
    </div>
  );
};