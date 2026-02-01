import React, { useEffect, useState, useCallback } from 'react';
import { useTitanTheme } from '../services/titanTheme';
import { Undo2 } from 'lucide-react';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  duration?: number;
  visible: boolean;
  onHide: () => void;
}

export function UndoToast({ 
  message, 
  onUndo, 
  duration = 5000, 
  visible, 
  onHide 
}: UndoToastProps) {
  const { theme } = useTitanTheme();
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);

  const handleUndo = useCallback(() => {
    onUndo();
    setIsExiting(true);
    setTimeout(onHide, 200);
  }, [onUndo, onHide]);

  useEffect(() => {
    if (!visible) return;

    setIsExiting(false);
    setProgress(100);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        setIsExiting(true);
        setTimeout(onHide, 200);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [visible, duration, onHide]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-200 ${
        isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl backdrop-blur-xl min-w-[280px] max-w-[90vw] overflow-hidden relative"
        style={{ 
          backgroundColor: `${theme.surface}F0`,
          borderColor: theme.borderColor,
          border: `1px solid ${theme.borderColor}`,
        }}
      >
        {/* Progress bar */}
        <div 
          className="absolute bottom-0 left-0 h-0.5 transition-all duration-100"
          style={{ 
            width: `${progress}%`,
            backgroundColor: theme.accent,
          }}
        />

        {/* Message */}
        <span 
          className="text-sm flex-1"
          style={{ color: theme.primaryText }}
        >
          {message}
        </span>

        {/* Undo button */}
        <button
          onClick={handleUndo}
          aria-label="Undo action"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors active:scale-95"
          style={{ 
            color: theme.accent,
            backgroundColor: `${theme.accent}15`,
          }}
        >
          <Undo2 size={14} />
          Undo
        </button>
      </div>
    </div>
  );
}

// Hook for managing undo toasts
interface UndoAction {
  message: string;
  undo: () => void;
}

export function useUndoToast() {
  const [action, setAction] = useState<UndoAction | null>(null);
  const [visible, setVisible] = useState(false);

  const showUndo = useCallback((message: string, undoFn: () => void) => {
    setAction({ message, undo: undoFn });
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    setAction(null);
  }, []);

  const handleUndo = useCallback(() => {
    if (action) {
      action.undo();
    }
  }, [action]);

  return {
    showUndo,
    toastProps: {
      message: action?.message || '',
      onUndo: handleUndo,
      visible,
      onHide: hide,
    },
  };
}

export default UndoToast;
