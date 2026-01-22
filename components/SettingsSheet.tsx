import React, { useState } from 'react';
import { ThemePickerView } from './ThemePickerView';
import { TypeLabView } from './TypeLabView';
import { Palette, Type, X, Cloud } from 'lucide-react';
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
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: theme.borderColor }}
      >
          <h2 className="text-lg font-bold lowercase" style={{ color: theme.primaryText }}>set the mood</h2>
          <button 
             onClick={onClose}
             className="p-2 -mr-2 rounded-full transition-colors"
             style={{ backgroundColor: theme.borderColor }}
          >
             <X size={20} style={{ color: theme.secondaryText }} />
          </button>
      </div>

      {/* Sync Flow Banner */}
      {/* Show Connect button if:
          1. Sync is disabled.
          2. Sync is enabled but session expired (Re-auth needed).
      */}
      {(!settings.isSyncEnabled || !isAuth) && (
          <div className="px-6 pt-4">
              <button 
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full p-4 rounded-xl flex items-center justify-between shadow-sm active:scale-95 transition-all"
                style={{ backgroundColor: theme.surface, border: `1px solid ${theme.borderColor}` }}
              >
                  <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-500/10 text-blue-600">
                          <Cloud size={20} />
                      </div>
                      <div className="text-left">
                          <h3 className="text-sm font-bold lowercase" style={{ color: theme.primaryText }}>
                            {settings.isSyncEnabled ? 'reconnect cloud' : 'enable sync flow'}
                          </h3>
                          <p className="text-xs opacity-60 lowercase" style={{ color: theme.secondaryText }}>
                            {settings.isSyncEnabled ? 'session expired' : 'connect google drive'}
                          </p>
                      </div>
                  </div>
                  <span className="text-xs font-bold text-blue-600 lowercase">{isConnecting ? 'connecting...' : 'connect'}</span>
              </button>
          </div>
      )}

      {/* Cloud Active Status */}
      {settings.isSyncEnabled && isAuth && (
           <div className="px-6 pt-4">
               <div 
                 className="w-full p-4 rounded-xl flex items-center gap-3 border"
                 style={{ backgroundColor: theme.surface, borderColor: theme.borderColor }}
               >
                   <div className="p-2 rounded-full bg-green-500/10 text-green-600">
                       <Cloud size={20} />
                   </div>
                   <div className="flex-1">
                       <h3 className="text-sm font-bold lowercase" style={{ color: theme.primaryText }}>cloud active</h3>
                       <p className="text-xs opacity-60 lowercase" style={{ color: theme.secondaryText }}>{settings.googleDriveEmail || 'connected'}</p>
                   </div>
               </div>
           </div>
      )}

      {/* Tabs */}
      <div className="px-4 pb-2 pt-4 z-10">
        <div className="flex p-1 rounded-xl" style={{ backgroundColor: theme.borderColor }}>
            <button 
            onClick={() => setActiveTab('optical')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all lowercase ${
                activeTab === 'optical' ? 'shadow-sm' : ''
            }`}
            style={{ 
                backgroundColor: activeTab === 'optical' ? theme.surface : 'transparent',
                color: activeTab === 'optical' ? theme.primaryText : theme.secondaryText
            }}
            >
            <Palette size={16} /> the look
            </button>
            <button 
            onClick={() => setActiveTab('typo')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all lowercase ${
                activeTab === 'typo' ? 'shadow-sm' : ''
            }`}
            style={{ 
                backgroundColor: activeTab === 'typo' ? theme.surface : 'transparent',
                color: activeTab === 'typo' ? theme.primaryText : theme.secondaryText
            }}
            >
            <Type size={16} /> the feel
            </button>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-6 pb-8 pt-4">
        <div className={`transition-opacity duration-300 ${activeTab === 'optical' ? 'block' : 'hidden'}`}>
             <ThemePickerView />
        </div>
        <div className={`transition-opacity duration-300 ${activeTab === 'typo' ? 'block' : 'hidden'}`}>
             <TypeLabView />
        </div>
      </div>
    </div>
  );
};