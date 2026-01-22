
/**
 * Represents a Chapter entity with hierarchical relationship capabilities.
 * Adapted from TitanChapter.swift specifications.
 */
export interface Chapter {
  // ID: @Attribute(.unique)
  id: string;
  
  // Content
  title: string;
  content: string; // HTML or Markdown content
  
  // Metadata
  wordCount: number;
  sortOrder: number; // 0, 1, 2...
  
  // Computed (Client-side)
  estimatedReadTime?: number; // In minutes
}

/**
 * The Core Titan Book Entity.
 * Adapted from SwiftData @Model structure for TypeScript usage.
 */
export interface Book {
  // ID: @Attribute(.unique)
  id: string;

  // Metadata
  title: string;
  author: string;
  series?: string;
  seriesIndex?: number;

  // Visuals
  // @Attribute(.externalStorage) -> Mapped to URL or Base64 string for web
  coverUrl?: string; 
  // Computed dominant color for UI theming
  tintColorHex?: string; 

  // State
  lastOpened: Date;
  isFinished: boolean;
  isFavorite?: boolean; // New: Favorites System
  bookmarkChapterID?: string; // Points to the specific chapter
  bookmarkProgress: number; // 0.0 to 1.0 within that chapter
  lastTokenIndex?: number; // Precise word location for RSVP restoration

  // Sync Flow
  driveId?: string; // Google Drive File ID
  driveVersion?: string; // For conflict resolution
  sourceType?: 'epub' | 'text'; // Format tracking for sync upload/download

  // Relations
  chapters?: Chapter[];
}

/**
 * User Configuration & Preferences
 * Adapted from TitanConfig.swift specifications.
 */
export interface ReaderConfig {
  // Singleton-style ID
  id: string;

  // -- Visuals --
  // Deprecated flat properties in favor of Type Lab, but kept for compatibility if needed.
  themeMode: 'System' | 'Light' | 'Dark' | 'Sepia'; 

  // -- Type Lab --
  fontFamily: 'New York' | 'SF Pro' | 'OpenDyslexic' | 'Atkinson Hyperlegible';
  fontSize: number; // 14.0 - 50.0
  lineHeight: number; // 1.0 - 2.2
  paragraphSpacing: number; // 0 - 40

  // -- Motion Fidelity --
  motionBlurIntensity: number; // 0.0 (Off) to 1.0 (Max)
  showReflections: boolean;

  // -- RSVP (Speed Reading) Engine --
  rsvpSpeed: number; // WPM, Default: 150 (Cold Start)
  hasCustomSpeed?: boolean; // Cold Start Flag
  rsvpChunkSize: number; // Words at once, Default: 1
  isRSVPContextEnabled: boolean; // Ghost Ribbon, Default: true
  rsvpColorHighlight: string; // Hex code, Default: "FF3B30"

  // -- Sync Flow --
  isSyncEnabled?: boolean;
  googleDriveEmail?: string;
  lastSyncTimestamp?: number;
}

/**
 * Ingestion Error Handling
 * Adapted from IngestionActor.swift specifications.
 */
export enum IngestionErrorType {
  INVALID_FILE = 'INVALID_FILE',
  MISSING_MANIFEST = 'MISSING_MANIFEST',
  CORRUPTION = 'CORRUPTION',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNKNOWN = 'UNKNOWN'
}

export class IngestionError extends Error {
  constructor(public type: IngestionErrorType, message: string) {
    super(message);
    this.name = 'IngestionError';
  }
}

/**
 * RSVPToken Structure (Phase 7-A)
 * Represents a single word tokenized for "Optical Alignment" speed reading.
 * Adapted from RSVPToken.swift.
 */
export class RSVPToken {
  public readonly id: string;

  constructor(
    public readonly originalText: string,
    // Visual Components
    public readonly leftSegment: string,
    public readonly centerCharacter: string,
    public readonly rightSegment: string,
    public readonly punctuation: string | undefined,
    // Metadata
    public readonly durationMultiplier: number,
    public readonly isSentenceEnd: boolean,
    public readonly isParagraphEnd: boolean, // Added for Semantic Navigation
    public readonly globalIndex: number,
    public readonly startOffset: number // Phase 9-G: Bidirectional Sync Offset
  ) {
    // OPTIMIZATION: Use deterministic ID for speed (avoids crypto overhead)
    this.id = `t-${globalIndex}`;
  }

  /**
   * Reconstructs the visual part of the word (excluding trailing punctuation).
   */
  get fullWord(): string {
    return `${this.leftSegment}${this.centerCharacter}${this.rightSegment}`;
  }

  get debugDescription(): string {
    return `[${this.globalIndex}] ${this.leftSegment}|${this.centerCharacter}|${this.rightSegment}${this.punctuation || ''} (${this.durationMultiplier.toFixed(2)}x)`;
  }
}

// -- SYNC TYPES --

export interface SyncState {
  version: number;
  timestamp: number;
  books: Record<string, {
    progress: number;
    lastTokenIndex?: number;
    isFinished: boolean;
    lastOpened: number;
    driveId?: string;
  }>;
  preferences: Partial<ReaderConfig>;
}

export type ConflictResolution = 'local' | 'remote' | 'merge';
