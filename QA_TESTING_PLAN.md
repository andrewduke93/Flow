# Flow App - Comprehensive QA Testing Plan & Audit

**Version:** 1.0  
**Date:** January 25, 2026  
**Focus:** RSVP Reading Mode & Core Functionality

---

## 1. RSVP Playback Flow

### 1.1 Basic RSVP Operations
- [ ] **Start RSVP** - Open book, enter RSVP mode from scroll view
- [ ] **Play button** - Shows pause icon when playing, play icon when paused
- [ ] **Pause/Resume** - Tap play button, stream pauses, tap again to resume
- [ ] **Speed control** - +/- buttons adjust WPM (50-2000 range)
- [ ] **Progress bar** - Shows current position, moves forward during playback

### 1.2 RSVP Rewind Gesture
- [ ] **Hold to rewind** - Hold anywhere on stream for 300ms, starts rewinding
- [ ] **Rewind speed** - 1 word every 300ms (slow and steady)
- [ ] **Rewind visual** - Reticle glows, text fades slightly, button shows `<<`
- [ ] **Move finger to cancel** - Move >50px away from original point, stops rewind
- [ ] **Release to resume** - Release finger, resumes from rewound position
- [ ] **No jump bug** - After rewind, doesn't jump back to start
- [ ] **Play state correct** - Can play immediately after releasing rewind

### 1.3 Tap Interactions
- [ ] **Tap word** - Jumps to that word, center it on reticle
- [ ] **Tap empty area (playing)** - Currently should show pause (design choice)
- [ ] **Tap empty area (paused)** - Exits RSVP, returns to scroll view
- [ ] **Long press** - Does nothing (only hold triggers rewind)

### 1.4 Red Letter & Reticle
- [ ] **Letter position fixed** - Red letter always on first letter, doesn't jump
- [ ] **Reticle centered** - Red line stays at 35.5% (slightly right of center)
- [ ] **Alignment perfect** - Red letter + reticle line always aligned vertically
- [ ] **No wobble** - Position stable during rewind

---

## 2. Context & Display Modes

### 2.1 Ghost Preview Toggle (Context Words)
- [ ] **Toggle button** - Shows/hides upcoming context words
- [ ] **Playing + OFF** - Only focus word visible
- [ ] **Playing + ON** - Focus word + 5 words before/after visible
- [ ] **Paused** - Always shows context (regardless of toggle)
- [ ] **Fade gradient** - Context words fade smoothly at edges

### 2.2 Visual Hierarchy
- [ ] **Focus word** - Bold, sharp, prominent
- [ ] **Context words** - Muted opacity, readable but secondary
- [ ] **Punctuation** - Subtle color, not distracting
- [ ] **No flickering** - Smooth transitions between words

---

## 3. Chapter Navigation

### 3.1 Chapter Selector
- [ ] **Tap chapter button** - Opens chapter list
- [ ] **Chapter list scrolls** - Shows all chapters
- [ ] **Tap chapter** - Jumps to start of chapter, closes selector
- [ ] **Auto-label** - Shows current chapter in progress bar area
- [ ] **Progress ticks** - Chapter markers visible on scrub bar

### 3.2 Progress Bar & Scrubbing
- [ ] **Vertical drag** - Drag up/down to scrub through book
- [ ] **Friction friction** - Drag away from bar = fine control
- [ ] **Position update** - Scrub bar moves with position
- [ ] **During RSVP** - Scrub works while RSVP is playing/paused
- [ ] **During rewind** - Scrub bar moves backward correctly

---

## 4. Settings & Configuration

### 4.1 Speed Settings
- [ ] **WPM display** - Shows current words-per-minute (default ~250)
- [ ] **+/- buttons** - Increment by 25 WPM per tap
- [ ] **Bounds enforced** - Min 50 WPM, Max 2000 WPM
- [ ] **Persistence** - Speed saved between sessions
- [ ] **Real-time** - Speed changes apply immediately to active playback

### 4.2 Theme & Display
- [ ] **Brightness/theme** - Dark mode works in RSVP
- [ ] **Font scaling** - Responsive to screen size
- [ ] **Text color contrast** - WCAG AA compliant (4.5:1 ratio)
- [ ] **Focus highlight** - Orange glow on red letter is visible but not harsh

---

## 5. State Transitions & Edge Cases

### 5.1 Play → Pause → Rewind → Play Flow
- [ ] **Playing** → Tap pause → Paused
- [ ] **Paused** → Hold to rewind → Rewinds, button shows `<<`
- [ ] **Release rewind** → Resumes playback automatically
- [ ] **Play state tracked** - UI reflects conductor state correctly

### 5.2 Exit RSVP Mode
- [ ] **Tap paused area** - Exits to scroll view
- [ ] **Back button** - Goes back to scroll view (if visible)
- [ ] **Position saved** - Scroll view shows same word highlighted
- [ ] **No data loss** - Progress/bookmarks preserved

### 5.3 Unusual Sequences
- [ ] **Rapid speed changes** - Doesn't crash, debounced correctly
- [ ] **Rapid play/pause** - Debounced (300ms guard)
- [ ] **Rapid scroll** - Scrub bar doesn't lag
- [ ] **Empty book** - Graceful fallback (no crash)

---

## 6. Performance & Stability

### 6.1 Memory & Battery
- [ ] **No memory leaks** - RSVP can run for 10+ minutes
- [ ] **CPU usage low** - Background processes minimal during playback
- [ ] **Wake lock works** - Screen stays on during playback
- [ ] **Wake lock releases** - Screen can turn off after pause

### 6.2 Network & Sync
- [ ] **Offline mode** - Works without internet
- [ ] **Book loading** - Fast enough to not block RSVP start
- [ ] **Concurrent ops** - Can open settings while playing

### 6.3 Device Responsiveness
- [ ] **Touch latency** - Tap response < 100ms
- [ ] **Gesture smoothness** - Rewind scrolls smoothly (no jank)
- [ ] **No crashes** - Sustained playback without crashes

---

## 7. Accessibility

### 7.1 Visual
- [ ] **Color contrast** - Red letter visible on all theme backgrounds
- [ ] **Text size** - Readable from normal distance
- [ ] **No flashing** - Nothing flashes >3 times per second

### 7.2 Haptic Feedback
- [ ] **Haptics work** - Vibrations on tap/rewind on supported devices
- [ ] **Can disable** - Should respect OS haptic settings

---

## 8. Known Issues & Fixes Applied

### 8.1 Fixed in This Release
- ✅ **Rewind state sync** - Play button shows `<<` during rewind
- ✅ **Scrub bar sync** - Progress bar moves during rewind
- ✅ **Jump to start bug** - Fixed heartbeat state machine after rewind
- ✅ **Red letter position** - Always first letter, never jumps
- ✅ **Rewind visual** - Reticle glows, text fades for clarity
- ✅ **CSS loading** - Fixed MIME type issue with stylesheets

### 8.2 Previously Known Limitations
- ⚠️ **iOS WebApp** - Full screen mode has minimal UI (expected)
- ⚠️ **Large books** - 50k+ words may have slower initial load
- ⚠️ **Low-end devices** - May experience stuttering at 400+ WPM

---

## 9. Test Matrix

### Device Types
- [ ] iPhone (Safari, latest)
- [ ] Android (Chrome, latest)
- [ ] Desktop (Chrome, Firefox, Safari)
- [ ] Tablet (iPad/Android tablet)

### Orientations
- [ ] Portrait mode
- [ ] Landscape mode
- [ ] Screen rotation during playback

### Network Conditions
- [ ] WiFi
- [ ] 4G/5G
- [ ] Offline mode

---

## 10. Regression Tests (Critical Path)

Run these every release:

1. **Can I start reading?** Open book → RSVP mode → Playback works
2. **Does rewind work?** Hold → Rewinds slowly → Resume plays
3. **No jumps?** Rewind multiple times → Doesn't jump to start
4. **Speed changes?** Adjust WPM → Playback speed changes
5. **Progress saves?** Exit → Re-open → Position preserved
6. **Theme works?** Switch theme → Text readable
7. **Exit works?** Pause + tap empty → Returns to scroll view

---

## Sign-Off

- **QA Lead:** [Your Name]
- **Date Started:** 2026-01-25
- **Date Completed:** TBD
- **Status:** 🟡 IN PROGRESS

---

## Notes

- All rewind fixes deployed
- Visual indicators improved for eye comfort
- Heartbeat state machine fixed to prevent jump-to-start bug
- Ready for user testing
