import React, { useState } from 'react';
import { ThemePickerView } from './ThemePickerView';
import { Palette, X, Cloud } from 'lucide-react';
import { useTitanTheme } from '../services/titanTheme';
import { useTitanSettings } from '../services/configService';
import { SyncManager } from '../services/syncManager';
import { GoogleDriveService } from '../services/googleDriveService';

interface SettingsSheetProps {
    onClose?: () => void;
}

/**
 * SettingsSheet (Phase 13: Unified Native Settings)
 * Identity: UX Architect.
 * Mission: A unified control center with explicit navigation.
 */
export const SettingsSheet: React.FC<SettingsSheetProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'optical' | 'typo'>('optical');
  const theme = useTitanTheme();
  const { settings } = useTitanSettings();
  const [isConnecting, setIsConnecting] = useState(false);

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

  return (
    <div 
        className="flex flex-col h-full transition-colors duration-300"
        style={{ backgroundColor: theme.background }}
    >
      {/* Header with Close Button */}
      <div 
        className="flex items-center justify-between px-6 py-5 border-b"
        style={{ borderColor: theme.borderColor }}
      >
          <div>
            <h2 className="text-xl font-bold lowercase tracking-tight" style={{ color: theme.primaryText }}>settings</h2>
          </div>
          <button 
             onClick={onClose}
             className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95"
             style={{ backgroundColor: `${theme.primaryText}08` }}
          >
             <X size={20} style={{ color: theme.primaryText }} />
          </button>
      </div>

      {/* Sync Flow Banner */}
      {(!settings.isSyncEnabled || !isAuth) && (
          <div className="px-6 pt-5">
              <button 
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full p-4 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-all"
                style={{ backgroundColor: theme.surface, border: `1px solid ${theme.borderColor}` }}
              >
                  <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-blue-500 text-white">
                          <Cloud size={16} />
                      </div>
                      <div className="text-left">
                          <h3 className="text-sm font-semibold lowercase" style={{ color: theme.primaryText }}>
                            {settings.isSyncEnabled ? 'reconnect cloud' : 'enable cloud sync'}
                          </h3>
                          <p className="text-[10px] opacity-40" style={{ color: theme.secondaryText }}>
                            {settings.isSyncEnabled ? 'session expired' : 'sync via google drive'}
                          </p>
                      </div>
                  </div>
                  <span className="text-xs font-semibold text-blue-500">{isConnecting ? '...' : 'connect'}</span>
              </button>
          </div>
      )}

      {/* Cloud Active Status */}
      {settings.isSyncEnabled && isAuth && (
           <div className="px-6 pt-5">
               <div 
                 className="w-full p-4 rounded-2xl flex items-center gap-3 border"
                 style={{ backgroundColor: theme.surface, borderColor: theme.borderColor }}
               >
                   <div className="p-2 rounded-xl bg-emerald-500 text-white">
                       <Cloud size={16} />
                   </div>
                   <div className="flex-1 min-w-0">
                       <h3 className="text-sm font-semibold lowercase" style={{ color: theme.primaryText }}>synced</h3>
                       <p className="text-[10px] opacity-40 truncate" style={{ color: theme.secondaryText }}>{settings.googleDriveEmail || 'connected'}</p>
                   </div>
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               </div>
           </div>
      )}

      {/* Tabs */}
      <div className="px-6 pt-5 z-10">
        <div className="flex p-0.5 rounded-xl border" style={{ borderColor: theme.borderColor }}>
            <button 
            onClick={() => setActiveTab('optical')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-all lowercase`}
            style={{ 
                backgroundColor: activeTab === 'optical' ? theme.surface : 'transparent',
                color: activeTab === 'optical' ? theme.primaryText : theme.secondaryText,
                opacity: activeTab === 'optical' ? 1 : 0.5
            }}
            >
            <Palette size={14} /> theme
            </button>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-6 pb-10 pt-5">
        <div className={`transition-opacity duration-200 ${activeTab === 'optical' ? 'block' : 'hidden'}`}>
             <ThemePickerView />
        </div>
      </div>
    </div>
  );
};