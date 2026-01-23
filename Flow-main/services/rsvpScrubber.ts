/**
 * RSVPScrubberLogic (Phase 9-B)
 * Identity: Sensory UX Engineer.
 * Mission: Engineer the "Clicky" tactile feedback for the Liquid Ribbon.
 */
export class RSVPScrubberLogic {
  private lastIndex: number = -1;
  private wordWidth: number;

  constructor(wordWidth: number) {
    this.wordWidth = wordWidth;
  }

  /**
   * Initialize a scrub session.
   */
  public begin(currentIndex: number) {
    this.lastIndex = currentIndex;
  }

  /**
   * Calculate the new index based on drag offset and trigger haptics if changed.
   * 
   * @param dragOffset The total pixels moved from start.
   * @param baseIndex The index where the drag started.
   * @param maxIndex The total number of tokens.
   * @returns The projected target index.
   */
  public update(dragOffset: number, baseIndex: number, maxIndex: number): number {
    // 1. Calculate Words Moved
    // Dragging LEFT (negative) advances content (increments index)
    // Dragging RIGHT (positive) reverses content (decrements index)
    const wordsMoved = Math.round(-dragOffset / this.wordWidth);
    
    let targetIndex = baseIndex + wordsMoved;
    targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));

    // 2. The Selection Click (Haptic Trigger)
    if (targetIndex !== this.lastIndex) {
      this.triggerFeedback();
      this.lastIndex = targetIndex;
    }

    return targetIndex;
  }

  /**
   * Trigger the "Selection" haptic feedback.
   * Uses the Vibration API to mimic UISelectionFeedbackGenerator.
   */
  private triggerFeedback() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      // 5ms is a sharp, light tick, similar to Apple's "Selection" feedback
      navigator.vibrate(5);
    }
  }
}