<div align="center">

# Flow

**A quiet place to read.**

[![Deploy Flow](https://github.com/andrewduke93/Flow/actions/workflows/static.yml/badge.svg)](https://github.com/andrewduke93/Flow/actions/workflows/static.yml)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa)](https://andrewduke93.github.io/Flow/)

[**Try Flow →**](https://andrewduke93.github.io/Flow/)

</div>

---

## What is Flow?

Flow is a distraction-free reading app designed for focused, immersive reading. Import your EPUB books and read them with RSVP (Rapid Serial Visual Presentation) technology that displays words one at a time at your chosen speed.

### Features

- **📚 EPUB Support** — Import and read any EPUB book
- **⚡ RSVP Mode** — Speed reading with customizable WPM (50-2000)
- **🎨 Themes** — Multiple reading themes including dark mode
- **☁️ Google Drive Sync** — Sync your library across devices
- **📱 PWA** — Install on any device, works offline
- **🔖 Smart Progress** — Automatic bookmark sync and chapter navigation
- **♿ Accessible** — Full keyboard navigation and screen reader support

---

## Installation

### As a Web App (Recommended)
Visit [andrewduke93.github.io/Flow](https://andrewduke93.github.io/Flow/) and click "Install" or "Add to Home Screen".

### From Source

```bash
cd Flow-main
npm install
npm run dev
```

Open [http://localhost:3000/Flow/](http://localhost:3000/Flow/) in your browser.

---

## Tech Stack

- **React 19** — UI framework
- **TypeScript** — Type safety
- **Vite** — Build tool
- **Tailwind CSS** — Styling
- **IndexedDB** — Local storage
- **Framer Motion** — Animations
- **Google Drive API** — Cloud sync

---

## Project Structure

```
Flow/
├── Flow-main/           # Source code
│   ├── components/      # React components
│   ├── services/        # Business logic & APIs
│   ├── public/          # Static assets
│   ├── App.tsx          # Root component
│   ├── index.tsx        # Entry point
│   └── types.ts         # TypeScript definitions
├── .github/workflows/   # CI/CD
└── README.md
```

---

## Development

```bash
# Install dependencies
cd Flow-main && npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Type check
npx tsc --noEmit
```

---

## License

MIT © 2026
