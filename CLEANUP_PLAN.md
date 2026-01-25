# Flow App - Codebase Cleanup Plan

## Identified Unused Components (Safe to Delete)

### Completely Unused RSVP Components
- [ ] `RSVPStageView.tsx` - Old RSVP display (replaced by RSVPTeleprompter)
- [ ] `RSVPLens.tsx` - Old magnifying glass effect (not used)
- [ ] `RSVPProgressHUD.tsx` - Old progress display (replaced by MediaCommandCenter)
- [ ] `RSVPSemanticScrubber.tsx` - Old scrubbing UI (replaced by horizontal scrubbing)
- [ ] `RSVPContextBackground.tsx` - Old background effect (not needed)
- [ ] `RSVPGhostRibbon.tsx` - Duplicate context rendering (merged into RSVPTeleprompter)
- [ ] `RSVPTokenView.tsx` - Old token display (replaced)

### Completely Unused Reader Components
- [ ] `ZuneReader.tsx` - Old theme/design system (not imported anywhere)
- [ ] `ZuneLibrary.tsx` - Old library UI (replaced by TitanLibrary)
- [ ] `ZuneControls.tsx` - Old media controls (replaced by MediaCommandCenter)
- [ ] `LiquidRibbonView.tsx` - Old visual effect (not used in current design)
- [ ] `TypeLabView.tsx` - Typography lab (not connected to UI)

### Legacy/Experimental Components
- [ ] `ReaderView.tsx` - Old reader wrapper (replaced by TitanReaderView)
- [ ] `KineticBlur.tsx` - Motion blur effect (not implemented in RSVP)
- [ ] `BrightnessControl.tsx` - Standalone brightness (merged into SettingsSheet)

## Unused Service Methods to Remove

### configService.ts
- [ ] Deprecated flat properties in ReaderConfig (kept for compatibility)
- [ ] `rsvpChunkSize` - Never used (always 1)
- [ ] `isRSVPContextEnabled` - Unused (use showGhostPreview instead)

### titanCore.ts
- [ ] Deprecated jump methods that are superceded
- [ ] Unused progress tracking callbacks

### rsvpHeartbeat.ts
- [ ] `toggleOffsetRewind()` method - never called
- [ ] Unused timing calculations

## Dead Code Patterns to Clean

### React Issues
- [ ] `isTransitioningRef` in ReaderContainer - used inconsistently, can simplify
- [ ] Unused `useLayoutEffect` in many components (can consolidate)
- [ ] Unused `useMemo` with empty dependency arrays

### Unused Imports
- [ ] `ChevronLeft` imported in ReaderContainer but might not be rendered
- [ ] `animate` from framer-motion in many places
- [ ] `useCallback` hooks that aren't optimizing anything meaningful

### Commented Out Code
- [ ] Remove all `// MARK: -` comments (not standard)
- [ ] Remove debug `console.log` statements
- [ ] Remove old feature branches left in code

## Files to Consolidate

### Settings/Config
- [ ] Move `configService.ts` exports to cleaner interface
- [ ] Remove deprecated ReaderConfig properties

### RSVP Services
- [ ] Consolidate timing logic from grammar engine + processor
- [ ] Remove duplicate state tracking

## Build & Test Checklist After Cleanup
- [ ] Build succeeds (`npm run build`)
- [ ] No TypeScript errors
- [ ] RSVP playback works
- [ ] Rewind works
- [ ] Speed controls work
- [ ] Progress bar works
- [ ] Settings persist
- [ ] Theme switching works
- [ ] No console errors/warnings

## Safety Notes
- Backup current state before deletion
- Delete one category at a time
- Test thoroughly after each deletion batch
- Check for any dynamic imports that might reference deleted components
