import React, { useEffect } from 'react';
import { RefreshCw, Cloud, AlertTriangle, Check } from 'lucide-react';
import { useTitanTheme } from '../services/titanTheme';

interface SyncToastProps {
  status: 'idle' | 'syncing' | 'error' | 'success';
  message?: string;
  onAction?: () => void;
  actionLabel?: string;
}

export const SyncToast: React.FC<SyncToastProps> = ({ status, message, onAction, actionLabel }) => {
  const theme = useTitanTheme();
  
  // Auto-dismiss logic handled by parent or self?
  // We'll let parent handle existence, but we animate in.

  return (
    <div
       className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-3 rounded-full shadow-xl backdrop-blur-md border border-white/10"
       style={{ backgroundColor: theme.surface, animation: 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
       {status === 'syncing' && <RefreshCw size={18} className="animate-spin text-blue-500" />}
       {status === 'error' && <AlertTriangle size={18} className="text-red-500" />}
       {status === 'success' && <Check size={18} className="text-green-500" />}
       {status === 'idle' && <Cloud size={18} style={{ color: theme.secondaryText }} />}
       
       <span className="text-sm font-medium pr-1" style={{ color: theme.primaryText }}>
           {message || (status === 'syncing' ? 'Syncing library...' : 'Cloud connected')}
       </span>

       {onAction && (
           <button 
             onClick={onAction}
             className="ml-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-500 text-white active:scale-95 transition-transform"
           >
             {actionLabel}
           </button>
       )}
    </div>
  );
};
