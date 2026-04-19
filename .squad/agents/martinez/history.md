# Project Context

- **Owner:** Bruno Capuano
- **Project:** rpi-ups-dashboard — Real-time UPS monitoring web app for Raspberry Pi + CyberPower UPS via NUT
- **Stack:** Python (backend API), HTML/CSS/JS (frontend dashboard), NUT (Network UPS Tools), Raspberry Pi
- **Architecture:** UPS → USB → Raspberry Pi → NUT → Backend API (GET /api/ups) → Web App
- **Created:** 2026-04-19

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2025-07-17 — Backend API built
- **Files created:** `app/__init__.py` (empty), `app/ups_reader.py`, `app/main.py`
- **`app/ups_reader.py`:** `parse_upsc_output()` parses NUT's `key: value` stdout into a dict; `get_ups_data()` shells out to `upsc ups@localhost` via `subprocess.run` with a 10s timeout, adds ISO 8601 UTC timestamp.
- **`app/main.py`:** Flask app with `GET /api/ups` (returns JSON, 503 on error), serves static files from `app/static/` at `/`, CORS headers for local dev.
- **Edge cases handled:** missing `upsc` binary (checked via `shutil.which`), subprocess timeout, non-zero exit codes, empty/malformed output, all return error dicts with 503 status.
- **Pattern:** Error responses always include `{ "error": "...", "timestamp": "..." }` so the frontend can always rely on `timestamp` being present.
- **Dependencies:** Flask only (already in `requirements.txt`).
