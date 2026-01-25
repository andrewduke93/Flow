import { RSVPToken } from '../types';

/**
 * Worker Logic String
 * THE ZUNE PULSE ALGORITHM (v2.4 - Optimized)
 * Optimized for long ebooks (Zero-Allocation-ish strategy where possible).
 */
const WORKER_CODE = `
self.onmessage = function(e) {
    const { text, startingIndex } = e.data;
    const tokens = [];
    let currentTokenIndex = startingIndex;
    
    // Chunk configuration
    // Increased chunk size for fewer postMessage overheads on massive texts
    const CHUNK_SIZE = 10000; 
    let match;
    // Pre-compile Regex
    const regex = /([^\\s]+)(\\s*)/g;
    const punctuationRegex = /^(.+?)([.,;:!?"')\\]}]+)?$/;
    const endSentenceRegex = /[.?!]/;
    const paragraphRegex = /\\n/;
    
    // ORP: Optimal Recognition Point
    // Inlined for performance
    function calculateORP(len) {
        if (len <= 1) return 0;
        if (len >= 2 && len <= 5) return 1;
        if (len >= 6 && len <= 10) return 2;
        return 3;
    }

    // Processing Loop with Batching
    function processChunk() {
        let count = 0;
        const startTime = performance.now();

        // Safety break if we take too long (15ms budget)
        while (count < CHUNK_SIZE) {
            match = regex.exec(text);
            if (!match) break;

            const fullChunk = match[1];
            const trailingSpace = match[2];
            const matchIndex = match.index;

            // Fast Split
            const separationMatch = fullChunk.match(punctuationRegex);
            let wordContent = fullChunk;
            let punctuationStr = "";

            if (separationMatch) {
                wordContent = separationMatch[1];
                punctuationStr = separationMatch[2] || "";
            }

            const len = wordContent.length;
            const orpIndex = (len <= 10) ? calculateORP(len) : 3; // Fast path
            
            // Substring is generally fast in modern JS engines (ropes)
            const leftSegment = wordContent.slice(0, orpIndex);
            const centerCharacter = wordContent[orpIndex] || "";
            const rightSegment = wordContent.slice(orpIndex + 1);

            // ZUNE PULSE TIMING LOGIC
            let duration = 1.0;

            // Semantic Weighting (Simplified)
            if (len > 10) duration = 1.4;
            else if (len < 3) duration = 0.8;

            // Punctuation Pauses
            if (punctuationStr.length > 0) {
                 if (punctuationStr.indexOf(',') !== -1) duration += 0.4;
                 if (endSentenceRegex.test(punctuationStr)) duration += 1.2;
            }
            
            // Paragraph Break
            const isParagraphEnd = trailingSpace.indexOf('\\n') !== -1;
            if (isParagraphEnd) duration += 2.0;

            tokens.push({
                id: 't-' + currentTokenIndex, 
                originalText: fullChunk,
                leftSegment,
                centerCharacter,
                rightSegment,
                punctuation: punctuationStr || undefined,
                durationMultiplier: duration,
                isSentenceEnd: endSentenceRegex.test(punctuationStr),
                isParagraphEnd,
                globalIndex: currentTokenIndex,
                startOffset: matchIndex
            });
            currentTokenIndex++;
            count++;
        }

        if (!match) {
            // Done
            self.postMessage(tokens);
        } else {
             // Yield
             setTimeout(processChunk, 0);
        }
    }

    processChunk();
};
`;

/**
 * RSVPProcessor
 * Managed Singleton Worker to ensure stability and reduce memory churn.
 */
export class RSVPProcessor {
  private static worker: Worker | null = null;
  private static workerUrl: string | null = null;
  private static pendingResolve: ((value: RSVPToken[]) => void) | null = null;
  private static pendingReject: ((reason?: any) => void) | null = null;
  private static isProcessing: boolean = false;

  private static initWorker() {
    if (this.worker) return;

    try {
        const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
        this.workerUrl = URL.createObjectURL(blob);
        this.worker = new Worker(this.workerUrl);

        this.worker.onmessage = (e) => {
            // HIGH PERFORMANCE: e.data is already an array of RSVPToken interfaces.
            // By using interfaces instead of classes, we avoid the expensive mapping loop
            // on the main thread, making preparation nearly instantaneous even for huge books.
            const tokens = e.data as RSVPToken[];
            
            this.isProcessing = false;
            if (this.pendingResolve) {
                this.pendingResolve(tokens);
                this.pendingResolve = null;
                this.pendingReject = null;
            }
        };

        this.worker.onerror = (e) => {
            console.error("RSVP Worker Error", e);
            this.isProcessing = false;
            if (this.pendingReject) {
                this.pendingReject(e);
                this.pendingResolve = null;
                this.pendingReject = null;
            }
            this.terminate();
        };
    } catch (e) {
        console.error("Failed to initialize RSVP Worker", e);
    }
  }

  public static async process(text: string, startingIndex: number = 0): Promise<RSVPToken[]> {
    // 1. Cancel any ongoing processing
    if (this.isProcessing && this.pendingReject) {
        this.pendingReject(new Error("Cancelled by new process request"));
        this.pendingResolve = null;
        this.pendingReject = null;
        this.terminate();
    }

    // 2. Init Worker if dead
    if (!this.worker) {
        this.initWorker();
    }

    // 3. Dispatch
    return new Promise((resolve, reject) => {
        this.pendingResolve = resolve;
        this.pendingReject = reject;
        this.isProcessing = true;
        
        if (this.worker) {
            this.worker.postMessage({ text, startingIndex });
        } else {
            reject(new Error("Worker failed to initialize"));
        }
    });
  }

  public static terminate() {
      if (this.worker) {
          this.worker.terminate();
          this.worker = null;
      }
      if (this.workerUrl) {
          URL.revokeObjectURL(this.workerUrl);
          this.workerUrl = null;
      }
      this.isProcessing = false;
  }
}