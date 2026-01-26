import { RSVPToken } from '../types';
import { GRAMMAR_AWARE_WORKER_CODE } from './rsvpGrammarEngine';

/**
 * Worker Logic String
 * THE ZUNE PULSE ALGORITHM (v3.0 - Grammar Aware)
 * 
 * Now incorporates linguistic intelligence for natural reading rhythm:
 * - Function words (the, a, is) flash faster
 * - Emphasis words (never, always, suddenly) get attention
 * - Clause boundaries create natural pauses
 * - Dialogue flows conversationally
 * - Rich punctuation handling (em-dashes, ellipses, semicolons)
 * 
 * Optimized for long ebooks (Zero-Allocation-ish strategy where possible).
 */
const WORKER_CODE = GRAMMAR_AWARE_WORKER_CODE;

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

  public static async process(text: string, startingIndex: number = 0, wpm: number = 200): Promise<RSVPToken[]> {
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
            this.worker.postMessage({ text, startingIndex, wpm });
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