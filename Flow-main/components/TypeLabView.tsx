import React, { useState, useEffect, useRef } from 'react';
import { useTitanSettings } from '../services/configService';
import { useTitanTheme } from '../services/titanTheme';
import { Type, Zap, Minus, Plus } from 'lucide-react';

/**
 * TypeLabView (Flow-Reader 2.0: Explicit Control)
 * Identity: Senior Type Designer.
 * Mission: Visible, tactile controls. Theme Aware.
 */
export const TypeLabView: React.FC = () => {
  const { settings, updateSettings } = useTitanSettings();
  const theme = useTitanTheme();
  
  const [optimisticSpeed, setOptimisticSpeed] = useState(settings.rsvpSpeed);
  const speedDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
     if (Math.abs(settings.rsvpSpeed - optimisticSpeed) > 10 && !speedDebounceTimer.current) {
         setOptimisticSpeed(settings.rsvpSpeed);
     }
  }, [settings.rsvpSpeed]);

  const handleSpeedChange = (v: number) => {
    const clamped = Math.max(100, Math.min(1000, v));
    setOptimisticSpeed(clamped);
    
    if (speedDebounceTimer.current) clearTimeout(speedDebounceTimer.current);
    speedDebounceTimer.current = setTimeout(() => {
        updateSettings({ rsvpSpeed: clamped, hasCustomSpeed: true });
        speedDebounceTimer.current = null;
    }, 100);
  };

  // Simplified Font List
  const fonts = [
    { name: 'Serif', label: 'fancy', val: 'New York' },
    { name: 'Sans', label: 'clean', val: 'SF Pro' }
  ];

  return (
    <div className="flex flex-col gap-6 pt-2">
      
      {/* 1. Explicit Speed Control Row */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-medium opacity-50 lowercase flex items-center gap-1.5" style={{ color: theme.secondaryText }}>
           <Zap size={12} /> pace
        </h3>
        
        <div 
            className="rounded-2xl p-4 border"
            style={{ 
                backgroundColor: theme.surface, 
                borderColor: theme.borderColor 
            }}
        >
            <div className="flex items-center justify-between mb-3">
                 <span className="text-sm font-medium lowercase" style={{ color: theme.primaryText }}>speed (wpm)</span>
                 <span className="text-xl font-semibold tracking-tight tabular-nums" style={{ color: theme.primaryText }}>{optimisticSpeed}</span>
            </div>
            
            <div className="flex items-center gap-3">
                <button 
                   onClick={() => handleSpeedChange(optimisticSpeed - 25)}
                   className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                   style={{ backgroundColor: theme.borderColor, color: theme.primaryText }}
                >
                    <Minus size={16} />
                </button>

                <div className="flex-1 relative h-8 flex items-center">
                    <input 
                        type="range"
                        min={100}
                        max={1000}
                        step={25}
                        value={optimisticSpeed}
                        onChange={(e) => handleSpeedChange(parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer focus:outline-none"
                        style={{ 
                            backgroundColor: theme.borderColor,
                            accentColor: theme.accent
                        }}
                    />
                </div>

                <button 
                   onClick={() => handleSpeedChange(optimisticSpeed + 25)}
                   className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                   style={{ backgroundColor: theme.borderColor, color: theme.primaryText }}
                >
                    <Plus size={16} />
                </button>
            </div>
        </div>
      </div>

      <div className="w-full h-px" style={{ backgroundColor: theme.borderColor }} />

      {/* 2. Typography Controls */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-medium opacity-50 lowercase flex items-center gap-1.5" style={{ color: theme.secondaryText }}>
           <Type size={12} /> typography
        </h3>

        <div className="grid grid-cols-2 gap-3">
            {fonts.map(f => (
                <button
                   key={f.val}
                   onClick={() => updateSettings({ fontFamily: f.val as any })}
                   className={`flex flex-col items-center justify-center gap-1.5 p-5 rounded-2xl border transition-all duration-200 ${
                       settings.fontFamily === f.val ? 'scale-[1.02]' : 'hover:scale-[1.01]'
                   }`}
                   style={{
                       backgroundColor: settings.fontFamily === f.val ? theme.primaryText : theme.surface,
                       borderColor: settings.fontFamily === f.val ? theme.primaryText : theme.borderColor,
                       color: settings.fontFamily === f.val ? theme.surface : theme.primaryText
                   }}
                >
                    <span className="text-2xl font-semibold" style={{ fontFamily: getCSSFont(f.val) }}>Aa</span>
                    <div className="flex flex-col items-center">
                        <span className="text-sm font-medium">{f.name}</span>
                        <span 
                            className="text-[9px] font-medium opacity-50"
                            style={{ 
                                color: settings.fontFamily === f.val ? theme.surface : theme.secondaryText
                            }}
                        >
                            {f.label}
                        </span>
                    </div>
                </button>
            ))}
        </div>

        <div 
            className="rounded-2xl p-4 border space-y-5 mt-3"
            style={{ backgroundColor: theme.surface, borderColor: theme.borderColor }}
        >
            <ControlRow label="size" value={settings.fontSize} min={14} max={40} onChange={v => updateSettings({ fontSize: v })} theme={theme} />
            <ControlRow label="room" value={settings.lineHeight} min={1.0} max={2.2} step={0.1} onChange={v => updateSettings({ lineHeight: v })} theme={theme} />
            <ControlRow label="gaps" value={settings.paragraphSpacing} min={0} max={40} onChange={v => updateSettings({ paragraphSpacing: v })} theme={theme} />
        </div>
      </div>

    </div>
  );
};

const ControlRow: React.FC<{ label: string, value: number, min: number, max: number, step?: number, onChange: (v: number) => void, theme: any }> = ({ label, value, min, max, step = 1, onChange, theme }) => (
    <div className="flex items-center gap-3">
        <span className="text-xs font-medium w-12 lowercase" style={{ color: theme.secondaryText }}>{label}</span>
        <input 
            type="range" 
            min={min} 
            max={max} 
            step={step} 
            value={value} 
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
            style={{ 
                backgroundColor: theme.borderColor,
                accentColor: theme.accent
            }}
        />
        <span className="text-xs font-medium w-8 text-right tabular-nums" style={{ color: theme.primaryText }}>{value.toFixed(step < 1 ? 1 : 0)}</span>
    </div>
);

function getCSSFont(name: string): string {
    if (name === 'New York') return 'serif';
    if (name === 'SF Pro') return 'sans-serif';
    return 'serif';
}