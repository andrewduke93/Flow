# Changelog

## [Unreleased]
- Feat: vendor Reedy tokenizer/sequencer and replace legacy RSVP pipeline with worker-based `newRsvpEngine` (Reedy-adapter + mapping)
- Feat: migrate UI to consume `newRsvpEngine` (significant RSVP surface-area migration)
- Test: add deterministic Node e2e for vendored Reedy worker and harden worker harness
- Chore: remove legacy `RSVPHeartbeat` runtime (final removal after migration)
- Licenses: repository redistributed under `GPL-2.0-only` due to vendored Reedy (see `NOTICE.md`)
- CI: keep guarded browser-e2e and add stability-only Node e2e for worker runtime

## [0.0.0] - 2026-01-26
- Initial release (post cleanup & reliability fixes)
