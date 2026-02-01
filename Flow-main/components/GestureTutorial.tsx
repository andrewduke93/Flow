import React, { useState, useEffect } from 'react';
import { useTitanTheme } from '../services/titanTheme';
import { X, Hand, ArrowLeftRight, ArrowUpDown, MousePointerClick } from 'lucide-react';

interface GestureTutorialProps {
  onDismiss: () => void;
}

const STORAGE_KEY = 'flow_gesture_tutorial_seen';

export function GestureTutorial({ onDismiss }: GestureTutorialProps) {
  const { theme } = useTitanTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  const gestures = [
    {
      icon: MousePointerClick,
      title: 'Tap to pause',
      description: 'Tap anywhere to pause or resume reading',
    },
    {
      icon: Hand,
      title: 'Hold to scrub',
      description: 'Hold and drag left/right to rewind or fast-forward',
    },
    {
      icon: ArrowLeftRight,
      title: 'Swipe to navigate',
      description: 'Swipe left/right to jump between chapters',
    },
    {
      icon: ArrowUpDown,
      title: 'Swipe down to exit',
      description: 'Swipe down to return to your library',
    },
  ];

  const handleDismiss = () => {
    setIsExiting(true);
    localStorage.setItem(STORAGE_KEY, 'true');
    setTimeout(() => onDismiss(), 200);
  };

  const handleNext = () => {
    if (currentStep < gestures.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleDismiss();
    }
  };

  const handleSkip = () => {
    handleDismiss();
  };

  const CurrentIcon = gestures[currentStep].icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gesture tutorial"
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-6 transition-opacity duration-200 ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <button
        onClick={handleSkip}
        aria-label="Skip tutorial"
        className="absolute top-4 right-4 p-2 rounded-full opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: theme.primaryText, backgroundColor: theme.surface }}
      >
        <X size={20} />
      </button>

      <div
        className="w-full max-w-sm rounded-3xl p-8 text-center"
        style={{ backgroundColor: theme.surface }}
      >
        {/* Icon */}
        <div
          className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{ backgroundColor: `${theme.accent}20` }}
        >
          <CurrentIcon size={36} style={{ color: theme.accent }} />
        </div>

        {/* Content */}
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: theme.primaryText }}
        >
          {gestures[currentStep].title}
        </h2>
        <p
          className="text-sm mb-8 leading-relaxed"
          style={{ color: theme.secondaryText }}
        >
          {gestures[currentStep].description}
        </p>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6" role="tablist" aria-label="Tutorial steps">
          {gestures.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              role="tab"
              aria-selected={index === currentStep}
              aria-label={`Step ${index + 1} of ${gestures.length}`}
              className="w-2 h-2 rounded-full transition-all duration-200"
              style={{
                backgroundColor: index === currentStep ? theme.accent : theme.borderColor,
                transform: index === currentStep ? 'scale(1.25)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-colors"
            style={{
              color: theme.secondaryText,
              backgroundColor: theme.background,
            }}
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-colors"
            style={{
              color: '#FFFFFF',
              backgroundColor: theme.accent,
            }}
          >
            {currentStep < gestures.length - 1 ? 'Next' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook to check if tutorial should be shown
export function useGestureTutorial() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem(STORAGE_KEY);
    if (!hasSeenTutorial) {
      setShouldShow(true);
    }
  }, []);

  const dismiss = () => {
    setShouldShow(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  return { shouldShow, dismiss };
}

export default GestureTutorial;
