# Project Context

- **Owner:** Bruno Capuano
- **Project:** rpi-ups-dashboard — Real-time UPS monitoring web app for Raspberry Pi + CyberPower UPS via NUT
- **Stack:** Python (backend API), HTML/CSS/JS (frontend dashboard), NUT (Network UPS Tools), Raspberry Pi
- **Architecture:** UPS → USB → Raspberry Pi → NUT → Backend API (GET /api/ups) → Web App
- **Created:** 2026-04-19

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-19 — Initial Frontend Dashboard Build

**What I built:**
- `app/static/index.html` — Semantic HTML5 dashboard with status banner, 6 metric cards (battery, runtime, input voltage, output voltage, load, last updated), header with connection indicator, footer.
- `app/static/style.css` — Dark-theme monitoring dashboard with CSS custom properties for status colors (`--status-ok`, `--status-warn`, `--status-critical`). CSS Grid layout, responsive breakpoints at 600px and 900px. Battery and load have visual progress bars with color-coded levels.
- `app/static/script.js` — Vanilla JS IIFE. Polls `/api/ups` every 5 seconds. Maps UPS status codes (OL, OB, LB, OL CHRG, OB DISCHRG) to labels and severity levels. Formats runtime seconds to human-readable. Shows loading pulse on first load, "Connection lost" on fetch errors. Live "X seconds ago" counter.

**Key patterns:**
- All DOM references cached at boot in a single `dom` object for performance on Pi.
- Status mapping via a `STATUS_MAP` dictionary — easy to extend for new codes.
- Bar color thresholds: battery ≤20% → critical, ≤50% → warn; load ≥90% → critical, ≥70% → warn.
- No frameworks, no build step — three static files served directly.

**Design decisions:**
- Dark theme chosen for monitoring console aesthetic and readability.
- `font-variant-numeric: tabular-nums` for stable column widths on changing numbers.
- ARIA roles on progress bars for accessibility.
- Cards hover-lift subtly to feel interactive without being distracting.
