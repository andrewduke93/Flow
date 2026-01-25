import { RSVPToken } from '../types';

/**
 * RSVPHapticEngine (Phase 8-E)
 * Identity: Accessibility Engineer.
 * Mission: Sync tactile feedback to reading rhythms using the Vibration API.
 */
export class RSVPHapticEngine {
  
  /**
   * Triggers a haptic pulse based on the token's punctuation content.
   */
  public static pulse(token: RSVPToken) {
    // Check if Vibration API is supported
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;

    const punc = token.punctuation || "";
    
    // 1. Sentence End (. ? !) -> Medium Impact (Intensity: 0.7 equivalent)
    if (/[.?!]/.test(punc)) {
      // 15ms is a distinct "thud" on mobile browsers supporting vibration
      navigator.vibrate(15); 
      return;
    }
    
    // 2. Pause (, ; :) -> Light Impact (Intensity: 0.3 equivalent)
    if (/[,;:]/.test(punc)) {
      // 5ms is a very subtle "tick"
      navigator.vibrate(5); 
      return;
    }
    
    // Default: Silence (No vibration for regular words)
  }

  /**
   * Simulates UIImpactFeedbackGenerator(.medium)
   * Used for UI interactions like snapping to a chapter.
   */
  public static impactMedium() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20); 
    }
  }

  /**
   * Simulates UIImpactFeedbackGenerator(.light)
   * Used for subtle interactions like crossing a chapter boundary while scrubbing.
   */
  public static impactLight() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(5); 
    }
  }

  /**
   * Simulates UISelectionFeedbackGenerator
   * Used for iOS-style selection changes (like letter picker).
   */
  public static selectionChanged() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(3); // Very light tick
    }
  }
}