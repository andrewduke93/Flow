import React, { useState, memo } from 'react';
import { X, Cloud, Moon, Sun, Sunset, Circle, Type, Sparkles, ChevronRight } from 'lucide-react';
import { useTitanTheme, TitanThemeService, TitanThemeMode, THEMES } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { SyncManager } from '../services/syncManager';
import { GoogleDriveService } from '../services/googleDriveService';

interface SettingsSheetProps {
    onClose?: () => void;
}

/**
 * SettingsSheet - Simplified & Organized
 * 
 * Structure:
 * 1. Cloud sync (if needed)
 * 2. Theme (4 visual buttons)
 * 3. Reading preferences (font, size, spacing)
 * 4. Flow preferences (speed, ghost words)
 */
export const SettingsSheet: React.FC<SettingsSheetProps> = memo(({ onClose }) => {
  const theme = useTitanTheme();
  const themeService = TitanThemeService.getInstance();
  const { settings, updateSettings } = useTitanSettings();
  const [isConnecting, setIsConnecting] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const handleConnect = async () => {
      setIsConnecting(true);
      try {
          await SyncManager.getInstance().connect();
      } catch (e) {
          alert("Could not connect to Google Drive.");
      } finally {
          setIsConnecting(false);
      }
  };

  const isAuth = GoogleDriveService.getInstance().isAuthenticated;

  const themeOptions: { mode: TitanThemeMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'Modern', icon: <Sun size={18} />, label: 'light' },
    { mode: 'Sepia', icon: <Sunset size={18} />, label: 'sepia' },
    { mode: 'Night', icon: <Moon size={18} />, label: 'dark' },
    { mode: 'OLED', icon: <Circle size={18} className="fill-current" />, label: 'black' },
  ];

  const fonts = [
    { name: 'Serif', val: 'New York' },
    { name: 'Sans', val: 'SF Pro' }
  ];

  return (
    <div 
        className="flex flex-col h-full transition-colors duration-300"
        style={{ backgroundColor: theme.background }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-6 py-5 border-b"
        style={{ borderColor: theme.borderColor }}
      >
          <h2 className="text-xl font-bold lowercase tracking-tight" style={{ color: theme.primaryText }}>settings</h2>
          <button 
             onClick={onClose}
             className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95"
             style={{ backgroundColor: `${theme.primaryText}08` }}
          >
             <X size={18} style={{ color: theme.primaryText }} />
          </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 space-y-6">
        
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* CLOUD SYNC */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {(!settings.isSyncEnabled || !isAuth) ? (
          <button 
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full p-4 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-all"
            style={{ backgroundColor: theme.surface, border: `1px solid ${theme.borderColor}` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center">
                <Cloud size={18} />
              </div>
              <div className="text-left">
                <span className="text-sm font-semibold block lowercase" style={{ color: theme.primaryText }}>
                  enable cloud sync
                </span>
                <span className="text-[10px] opacity-50" style={{ color: theme.secondaryText }}>
                  sync progress via google drive
                </span>
              </div>
            </div>
            <span className="text-xs font-semibold text-blue-500">{isConnecting ? '...' : 'connect'}</span>
          </button>
        ) : (
          <div 
            className="w-full p-4 rounded-2xl flex items-center gap-3"
            style={{ backgroundColor: theme.surface, border: `1px solid ${theme.borderColor}` }}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
              <Cloud size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold block lowercase" style={{ color: theme.primaryText }}>synced</span>
              <span className="text-[10px] opacity-50 truncate block" style={{ color: theme.secondaryText }}>
                {settings.googleDriveEmail || 'connected'}
              </span>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* THEME */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <span className="text-[11px] font-medium uppercase tracking-wider opacity-40" style={{ color: theme.secondaryText }}>
            Theme
          </span>
          <div className="grid grid-cols-4 gap-2">
            {themeOptions.map(({ mode, icon, label }) => {
              const modeTheme = THEMES[mode];
              const isActive = themeService.mode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => themeService.setMode(mode)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all active:scale-95"
                  style={{
                    backgroundColor: isActive ? theme.accent : theme.surface,
                    border: `1px solid ${isActive ? theme.accent : theme.borderColor}`,
                    color: isActive ? '#fff' : theme.secondaryText
                  }}
                >
                  {icon}
                  <span className="text-[10px] font-medium lowercase">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TEXT */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <span className="text-[11px] font-medium uppercase tracking-wider opacity-40" style={{ color: theme.secondaryText }}>
            Text
          </span>
          
          <div 
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: theme.surface, border: `1px solid ${theme.borderColor}` }}
          >
            {/* Font selector */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Type size={18} style={{ color: theme.secondaryText }} />
                <span className="text-sm font-medium lowercase" style={{ color: theme.primaryText }}>font</span>
              </div>
              <div className="flex gap-1">
                {fonts.map(f => (
                  <button
                    key={f.val}
                    onClick={() => updateSettings({ fontFamily: f.val as any })}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: settings.fontFamily === f.val ? theme.accent : `${theme.primaryText}08`,
                      color: settings.fontFamily === f.val ? '#fff' : theme.secondaryText,
                      fontFamily: f.val === 'New York' ? 'serif' : 'sans-serif'
                    }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-px" style={{ backgroundColor: theme.borderColor }} />
            
            {/* Size */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium lowercase" style={{ color: theme.primaryText }}>size</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: theme.primaryText }}>{settings.fontSize}</span>
              </div>
              <input 
                type="range" 
                min={14} max={36} step={1}
                value={settings.fontSize}
                onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ backgroundColor: theme.borderColor, accentColor: theme.accent }}
              />
            </div>
            
            <div className="h-px" style={{ backgroundColor: theme.borderColor }} />
            
            {/* Line spacing */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium lowercase" style={{ color: theme.primaryText }}>spacing</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: theme.primaryText }}>{settings.lineHeight.toFixed(1)}</span>
              </div>
              <input 
                type="range" 
                min={1.0} max={2.2} step={0.1}
                value={settings.lineHeight}
                onChange={(e) => updateSettings({ lineHeight: parseFloat(e.target.value) })}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ backgroundColor: theme.borderColor, accentColor: theme.accent }}
              />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* FLOW MODE */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <span className="text-[11px] font-medium uppercase tracking-wider opacity-40" style={{ color: theme.secondaryText }}>
            Flow Mode
          </span>
          
          <div 
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: theme.surface, border: `1px solid ${theme.borderColor}` }}
          >
            {/* Ghost words toggle */}
            <button
              onClick={() => updateSettings({ showGhostPreview: !settings.showGhostPreview })}
              className="w-full p-4 flex items-center justify-between active:bg-black/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Sparkles size={18} style={{ color: settings.showGhostPreview ? theme.accent : theme.secondaryText }} />
                <div className="text-left">
                  <span className="text-sm font-medium block lowercase" style={{ color: theme.primaryText }}>word preview</span>
                  <span className="text-[10px] opacity-50" style={{ color: theme.secondaryText }}>show context words during flow</span>
                </div>
              </div>
              <ToggleSwitch enabled={settings.showGhostPreview || false} theme={theme} />
            </button>
            
            <div className="h-px" style={{ backgroundColor: theme.borderColor }} />
            
            {/* Default speed */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium lowercase" style={{ color: theme.primaryText }}>default speed</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: theme.primaryText }}>{settings.rsvpSpeed} wpm</span>
              </div>
              <input 
                type="range" 
                min={100} max={900} step={25}
                value={settings.rsvpSpeed}
                onChange={(e) => updateSettings({ rsvpSpeed: parseInt(e.target.value), hasCustomSpeed: true })}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ backgroundColor: theme.borderColor, accentColor: theme.accent }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
});

const ToggleSwitch: React.FC<{ enabled: boolean; theme: any }> = ({ enabled, theme }) => (
  <div 
    className="w-11 h-7 rounded-full p-0.5 transition-colors duration-200"
    style={{ backgroundColor: enabled ? theme.accent : theme.borderColor }}
  >
    <div 
      className="w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200"
      style={{ transform: enabled ? 'translateX(16px)' : 'translateX(0)' }}
    />
  </div>
);