import React from 'react';
import { useTitanTheme } from '../services/titanTheme';
import { Loader2, BookOpen, CheckCircle2 } from 'lucide-react';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  progress?: number; // 0-100
  status?: 'loading' | 'success' | 'error';
}

export function LoadingOverlay({ 
  visible, 
  message = 'Loading...', 
  progress,
  status = 'loading' 
}: LoadingOverlayProps) {
  const { theme } = useTitanTheme();

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-busy={status === 'loading'}
      aria-label={message}
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center backdrop-blur-sm transition-opacity duration-200"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="flex flex-col items-center gap-4 p-8 rounded-3xl"
        style={{ backgroundColor: theme.surface }}
      >
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${theme.accent}15` }}
        >
          {status === 'loading' ? (
            <Loader2 
              size={32} 
              className="animate-spin" 
              style={{ color: theme.accent }} 
            />
          ) : status === 'success' ? (
            <CheckCircle2 
              size={32} 
              style={{ color: '#34C759' }} 
            />
          ) : (
            <BookOpen 
              size={32} 
              style={{ color: theme.accent }} 
            />
          )}
        </div>

        {/* Message */}
        <p 
          className="text-sm font-medium text-center max-w-[200px]"
          style={{ color: theme.primaryText }}
        >
          {message}
        </p>

        {/* Progress bar */}
        {progress !== undefined && status === 'loading' && (
          <div 
            className="w-48 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: theme.borderColor }}
          >
            <div 
              className="h-full rounded-full transition-all duration-300"
              style={{ 
                width: `${progress}%`,
                backgroundColor: theme.accent 
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Hook for managing loading state
interface LoadingState {
  visible: boolean;
  message: string;
  progress?: number;
  status: 'loading' | 'success' | 'error';
}

export function useLoadingOverlay() {
  const [state, setState] = React.useState<LoadingState>({
    visible: false,
    message: 'Loading...',
    status: 'loading',
  });

  const show = React.useCallback((message: string) => {
    setState({ visible: true, message, status: 'loading' });
  }, []);

  const setProgress = React.useCallback((progress: number, message?: string) => {
    setState(prev => ({ 
      ...prev, 
      progress, 
      message: message || prev.message 
    }));
  }, []);

  const success = React.useCallback((message?: string) => {
    setState(prev => ({ 
      ...prev, 
      status: 'success', 
      message: message || 'Done!',
      progress: 100 
    }));
    // Auto-hide after success
    setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }));
    }, 1200);
  }, []);

  const error = React.useCallback((message?: string) => {
    setState(prev => ({ 
      ...prev, 
      status: 'error', 
      message: message || 'Something went wrong' 
    }));
  }, []);

  const hide = React.useCallback(() => {
    setState(prev => ({ ...prev, visible: false }));
  }, []);

  return {
    ...state,
    show,
    setProgress,
    success,
    error,
    hide,
  };
}

export default LoadingOverlay;
