# Changelog

## [Unreleased]
- Fix: remove merge-conflict artifacts that caused build failures
- Fix: stabilize RSVP grammar engine and worker export
- CI: add conflict-marker check and pre-commit hook
- CI: harden install steps in Actions to avoid runner lifecycle script failures
- Perf: add Vite manualChunks for reader components to reduce main bundle size
- Test: add vitest smoke test for RSVP grammar engine

## [0.0.0] - 2026-01-26
- Initial release (post cleanup & reliability fixes)
