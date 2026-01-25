import { useState, useEffect } from 'react';

export type TitanThemeMode = 'Modern' | 'Sepia' | 'Night' | 'OLED' | 'System';

export interface TitanThemeColors {
  background: string;
  surface: string; // Card/Sheet background
  primaryText: string;
  secondaryText: string;
  accent: string;
  dimmer: string;
  borderColor: string;
}

export const THEMES: Record<string, TitanThemeColors> = {
  'Modern': {
    background: '#F2F2F7', // iOS Grouped
    surface: '#FFFFFF',
    primaryText: '#000000',
    secondaryText: '#8A8A8E',
    accent: '#E25822', // UNIFIED EMBER
    dimmer: 'rgba(255,255,255,0.85)',
    borderColor: '#E5E5EA',
  },
  'Sepia': {
    background: '#F8F1E3',
    surface: '#FFFDF5', // Slightly lighter/warmer than bg
    primaryText: '#5C4033', // Deep brown
    secondaryText: '#8C7356',
    accent: '#D45D48', // Keeping Sepia distinct but warm
    dimmer: 'rgba(248,241,227,0.9)',
    borderColor: '#E6DCC8',
  },
  'Night': {
    background: '#000000',
    surface: '#1C1C1E',
    primaryText: '#F2F2F7',
    secondaryText: '#8E8E93',
    accent: '#E25822', // UNIFIED EMBER
    dimmer: 'rgba(0,0,0,0.8)',
    borderColor: '#2C2C2E',
  },
  'OLED': { // The Zune Noir / Obsidian theme
    background: '#000000',
    surface: '#121212',
    primaryText: '#FFFFFF',
    secondaryText: '#888888',
    accent: '#E25822', // UNIFIED EMBER
    dimmer: 'rgba(0,0,0,0.9)',
    borderColor: '#333333',
  },
  'System': { 
    background: '#F2F2F7',
    surface: '#FFFFFF',
    primaryText: '#000000',
    secondaryText: '#8A8A8E',
    accent: '#E25822', // UNIFIED EMBER
    dimmer: 'rgba(255,255,255,0.9)',
    borderColor: '#E5E5EA',
  }
};

// Backwards compatibility for Zune Reader components that import ZUNE_THEME directly
export const ZUNE_THEME: TitanThemeColors = THEMES['OLED'];

/**
 * TitanThemeService
 * The Single Source of Truth for Visual Theming.
 */
export class TitanThemeService {
  private static instance: TitanThemeService;
  private listeners: Set<() => void> = new Set();
  
  private _mode: TitanThemeMode = 'Modern'; // Always default to Modern

  private constructor() {
    try {
      const stored = localStorage.getItem('titan_theme_mode');
      if (stored && Object.keys(THEMES).concat(['System']).includes(stored)) {
        this._mode = stored as TitanThemeMode;
      } else {
        this._mode = 'Modern';
        localStorage.setItem('titan_theme_mode', 'Modern');
      }
    } catch (e) {
      this._mode = 'Modern';
      localStorage.setItem('titan_theme_mode', 'Modern');
      console.warn('[TitanTheme] Failed to load theme preference', e);
    }
  }

  public static getInstance(): TitanThemeService {
    if (!TitanThemeService.instance) {
      TitanThemeService.instance = new TitanThemeService();
    }
    return TitanThemeService.instance;
  }

  public get mode(): TitanThemeMode {
    return this._mode;
  }

  public setMode(mode: TitanThemeMode) {
    if (!Object.keys(THEMES).concat(['System']).includes(mode)) {
      this._mode = 'Modern';
      localStorage.setItem('titan_theme_mode', 'Modern');
    } else {
      this._mode = mode;
      try {
        localStorage.setItem('titan_theme_mode', mode);
      } catch (e) {
        console.warn('[TitanTheme] Failed to save theme preference', e);
      }
    }
    this.notify();
  }

  public get currentColors(): TitanThemeColors {
    if (this._mode === 'System') {
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return THEMES['Night'];
      }
      return THEMES['Modern'];
    }
    return THEMES[this._mode] || THEMES['Modern'];
  }

  // Observability
  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach(cb => cb());
  }
}

export const useTitanTheme = () => {
  const service = TitanThemeService.getInstance();
  const [colors, setColors] = useState(service.currentColors);

  useEffect(() => {
    const update = () => setColors(service.currentColors);
    const unsub = service.subscribe(update);
    return unsub;
  }, []);

  return colors;
};