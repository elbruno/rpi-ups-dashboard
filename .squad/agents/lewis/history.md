# Project Context

- **Owner:** Bruno Capuano
- **Project:** rpi-ups-dashboard — Real-time UPS monitoring web app for Raspberry Pi + CyberPower UPS via NUT
- **Stack:** Python (backend API), HTML/CSS/JS (frontend dashboard), NUT (Network UPS Tools), Raspberry Pi
- **Architecture:** UPS → USB → Raspberry Pi → NUT → Backend API (GET /api/ups) → Web App
- **Created:** 2026-04-19

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-19 — Initial test suite created
- **Strategy:** Contract-first testing — wrote tests against the expected interface before backend is complete. This lets Martinez implement against a clear spec.
- **Pattern: mock at the boundary.** All subprocess calls are mocked via `unittest.mock.patch` so tests never require NUT, a UPS, or a Raspberry Pi.
- **Edge cases covered for parser:** empty input, whitespace-only, missing colons, extra colons in values, leading/trailing whitespace, blank lines, values with spaces.
- **Failure modes for get_ups_data:** FileNotFoundError (upsc not installed), non-zero exit code (NUT connection failure).
- **API tests mock `get_ups_data` directly** (not subprocess) — this keeps API tests focused on Flask routing/response, not parsing logic.
- **Key insight:** The 503 error contract for `/api/ups` when NUT is down is critical for the frontend to show a meaningful "UPS unavailable" state.
