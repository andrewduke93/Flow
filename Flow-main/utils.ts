import { Book } from './types';

// Performance cache for color validation
const colorCache = new Map<string, string>();

// Helper to simulate the Swift `derivedColor` computed property
export const getDerivedColor = (hex?: string): string => {
  if (!hex) return '#E25822'; // Unified Ember
  
  // Check cache first
  if (colorCache.has(hex)) {
    return colorCache.get(hex)!;
  }
  
  // Validate and cache
  const isValid = /^#[0-9A-F]{6}$/i.test(hex);
  const result = isValid ? hex : '#E25822';
  colorCache.set(hex, result);
  
  // Limit cache size
  if (colorCache.size > 100) {
    const firstKey = colorCache.keys().next().value;
    colorCache.delete(firstKey);
  }
  
  return result;
};

// Helper to format dates cleanly
export const formatRelativeDate = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Calculate generic read progress for the dashboard
export const getOverallProgress = (book: Book): number => {
  if (book.isFinished) return 100;
  if (!book.chapters || book.chapters.length === 0) return 0;
  
  // Very rough estimation based on chapter index + internal progress
  const currentChapterIndex = book.chapters.findIndex(c => c.id === book.bookmarkChapterID) ?? 0;
  const safeIndex = currentChapterIndex === -1 ? 0 : currentChapterIndex;
  
  const totalChapters = book.chapters.length;
  const chapterPart = 1 / totalChapters;
  
  const baseProgress = (safeIndex / totalChapters) * 100;
  const currentChapterProgress = (book.bookmarkProgress * chapterPart) * 100;
  
  return Math.round(baseProgress + currentChapterProgress);
};

// Logic: Calculate word count (splitting by spaces)
export const calculateWordCount = (content: string): number => {
  if (!content) return 0;
  return (content.match(/([^\s]+)/g) || []).length;
};

// Logic: Estimated read time (Words / 250 WPM)
export const calculateReadTime = (wordCount: number): number => {
  return Math.ceil(wordCount / 250);
};