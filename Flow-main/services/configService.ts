import { ReaderConfig } from '../types';
import { useState, useEffect } from 'react';

/**
 * TitanSettingsService
 * The Single Source of Truth for User Preferences.
 * Manages Typography, Motion, and RSVP settings.
 * 
 * Identity: Settings Architect.
 */
export class TitanSettingsService {
  private static instance: TitanSettingsService;
  private listeners: Set<() => void> = new Set();
  // Bump version to force new defaults
  private STORAGE_KEY = 'titan_reader_prefs_v15_true_book';

  private config: ReaderConfig;

  private constructor() {
    this.config = this.loadFromStorage();
  }

  public static getInstance(): TitanSettingsService {
    if (!TitanSettingsService.instance) {
      TitanSettingsService.instance = new TitanSettingsService();
    }
    return TitanSettingsService.instance;
  }

  private getDefaultConfig(): ReaderConfig {
    return {
      id: 'user-default',
      // Visuals
      themeMode: 'System',
      
      // Type Lab
      fontFamily: 'New York',
      fontSize: 18.0,      
      lineHeight: 1.35,
      paragraphSpacing: 10.0,
      
      // Motion Fidelity
      motionBlurIntensity: 0.05, 
      showReflections: false,

      // RSVP (Speed Reading) Engine
      rsvpSpeed: 200,
      hasCustomSpeed: false,
      showGhostPreview: true,
      rsvpColorHighlight: '#FF3B30', 
    };
  }

  private loadFromStorage(): ReaderConfig {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const merged = { ...this.getDefaultConfig(), ...parsed };
        
        // PERSISTENCE FIX:
        // Force 200 WPM if the user hasn't actively customized it yet.
        if (!merged.hasCustomSpeed) {
            merged.rsvpSpeed = 200;
        }
        
        return merged;
      }
    } catch (e) {
      console.warn('[TitanSettings] Failed to load config', e);
    }
    return this.getDefaultConfig();
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.warn('[TitanSettings] Failed to save config', e);
    }
  }

  // Public Accessors

  public getSettings(): ReaderConfig {
    return { ...this.config };
  }

  public updateSettings(partial: Partial<ReaderConfig>) {
    this.config = { ...this.config, ...partial };
    this.saveToStorage();
    this.notify();
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

// React Hook
export const useTitanSettings = () => {
  const service = TitanSettingsService.getInstance();
  const [settings, setSettings] = useState(service.getSettings());

  useEffect(() => {
    const update = () => setSettings(service.getSettings());
    const unsub = service.subscribe(update);
    return unsub;
  }, []);

  return {
    settings,
    updateSettings: (partial: Partial<ReaderConfig>) => service.updateSettings(partial)
  };
};

export const getDefaultConfig = () => TitanSettingsService.getInstance().getSettings();
export const loadConfig = () => TitanSettingsService.getInstance().getSettings();
export const saveConfig = (c: ReaderConfig) => TitanSettingsService.getInstance().updateSettings(c);