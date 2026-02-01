# Flow Source Code

This directory contains the Flow app source code.

## Quick Start

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server at localhost:3000/Flow/ |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |

## Directory Structure

```
├── components/          # React components
│   ├── TitanLibrary.tsx       # Main library view
│   ├── TitanBookCell.tsx      # Book card component
│   ├── TitanReaderView.tsx    # Scroll reading mode
│   ├── RSVPTeleprompter.tsx   # RSVP display
│   ├── MediaCommandCenter.tsx # Playback controls
│   ├── SettingsSheet.tsx      # Settings panel
│   └── ...
├── services/            # Business logic
│   ├── titanCore.ts           # Reading engine
│   ├── titanStorage.ts        # IndexedDB persistence
│   ├── rsvpConductor.ts       # RSVP state machine
│   ├── rsvpHeartbeat.ts       # Word timing
│   ├── ingestionService.ts    # EPUB parser
│   ├── syncManager.ts         # Google Drive sync
│   └── ...
├── public/              # Static assets
│   ├── icons/                 # App icons (all sizes)
│   └── manifest.json          # PWA manifest
├── android/             # Android PWA icons
├── ios/                 # iOS PWA icons  
├── windows11/           # Windows PWA tiles
├── App.tsx              # Root component
├── index.tsx            # Entry point
├── types.ts             # TypeScript types
├── utils.ts             # Utility functions
└── vite.config.ts       # Build configuration
```

## Key Components

### Reading Engine (`services/titanCore.ts`)
Central state manager for book content, progress tracking, and mode switching.

### RSVP System
- `rsvpConductor.ts` — State machine (IDLE → READY → PLAYING → PAUSED)
- `rsvpHeartbeat.ts` — Word timing and playback
- `rsvpProcessor.ts` — Text tokenization
- `RSVPTeleprompter.tsx` — Visual display with ORP highlighting

### Storage
- `titanStorage.ts` — IndexedDB wrapper for books and settings
- `syncManager.ts` — Google Drive backup/restore

## Environment

- Node.js 20+
- React 19
- TypeScript 5
- Vite 6
