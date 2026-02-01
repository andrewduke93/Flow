import React, { useState, useEffect } from 'react';
import { useTitanTheme } from '../services/titanTheme';
import { PartyPopper, Clock, BookOpen, Share2, X } from 'lucide-react';

interface BookFinishedModalProps {
  visible: boolean;
  bookTitle: string;
  totalWords?: number;
  readingTimeMinutes?: number;
  onDismiss: () => void;
  onShare?: () => void;
}

export function BookFinishedModal({
  visible,
  bookTitle,
  totalWords,
  readingTimeMinutes,
  onDismiss,
  onShare,
}: BookFinishedModalProps) {
  const { theme } = useTitanTheme();
  const [isExiting, setIsExiting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsExiting(false);
      // Trigger confetti after a brief delay
      const timer = setTimeout(() => setShowConfetti(true), 200);
      return () => clearTimeout(timer);
    } else {
      setShowConfetti(false);
    }
  }, [visible]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatWords = (words: number) => {
    if (words >= 1000) {
      return `${(words / 1000).toFixed(1)}k`;
    }
    return words.toString();
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-finished-title"
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-6 transition-opacity duration-200 ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      {/* Close button */}
      <button
        onClick={handleDismiss}
        aria-label="Close"
        className="absolute top-4 right-4 p-2 rounded-full opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: theme.primaryText, backgroundColor: theme.surface }}
      >
        <X size={20} />
      </button>

      {/* Confetti particles */}
      {showConfetti && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 rounded-sm animate-confetti"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: '-20px',
                backgroundColor: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#E25822', '#9B59B6'][i % 5],
                animationDelay: `${i * 0.1}s`,
                animationDuration: `${2 + Math.random()}s`,
              }}
            />
          ))}
        </div>
      )}

      <div
        className="w-full max-w-sm rounded-3xl p-8 text-center relative overflow-hidden"
        style={{ backgroundColor: theme.surface }}
      >
        {/* Celebration icon */}
        <div
          className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{ backgroundColor: `${theme.accent}20` }}
        >
          <PartyPopper size={48} style={{ color: theme.accent }} />
        </div>

        {/* Title */}
        <h2
          id="book-finished-title"
          className="text-2xl font-bold mb-2"
          style={{ color: theme.primaryText }}
        >
          Congratulations! 🎉
        </h2>

        {/* Book title */}
        <p
          className="text-base mb-6 line-clamp-2"
          style={{ color: theme.secondaryText }}
        >
          You finished <strong style={{ color: theme.primaryText }}>{bookTitle}</strong>
        </p>

        {/* Stats */}
        {(totalWords || readingTimeMinutes) && (
          <div 
            className="flex justify-center gap-6 mb-8 py-4 px-4 rounded-2xl"
            style={{ backgroundColor: theme.background }}
          >
            {totalWords && (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5" style={{ color: theme.accent }}>
                  <BookOpen size={16} />
                  <span className="text-lg font-semibold">{formatWords(totalWords)}</span>
                </div>
                <span className="text-xs" style={{ color: theme.secondaryText }}>words read</span>
              </div>
            )}
            {readingTimeMinutes && (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5" style={{ color: theme.accent }}>
                  <Clock size={16} />
                  <span className="text-lg font-semibold">{formatTime(readingTimeMinutes)}</span>
                </div>
                <span className="text-xs" style={{ color: theme.secondaryText }}>total time</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {onShare && (
            <button
              onClick={onShare}
              aria-label="Share achievement"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors"
              style={{
                color: theme.accent,
                backgroundColor: `${theme.accent}15`,
              }}
            >
              <Share2 size={16} />
              Share
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-colors"
            style={{
              color: '#FFFFFF',
              backgroundColor: theme.accent,
            }}
          >
            Continue
          </button>
        </div>
      </div>

      <style>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

export default BookFinishedModal;
