# Decision: Backend API Design

**Author:** Martinez (Backend Dev)
**Date:** 2025-07-17
**Status:** Implemented

## Context
The backend needs to serve UPS telemetry from NUT to the web dashboard.

## Decisions

1. **Error responses use HTTP 503** — When `upsc` is missing, times out, or returns an error, the API returns `503 Service Unavailable` with an `{ "error": "...", "timestamp": "..." }` body. This tells the frontend the backend is alive but NUT is not.

2. **Timestamp always present** — Both success and error responses include an ISO 8601 UTC `timestamp` field. The frontend can rely on this unconditionally.

3. **CORS enabled globally** — `Access-Control-Allow-Origin: *` is set on all responses via `after_request` hook. Fine for LAN dashboard; should be tightened if ever exposed to internet.

4. **Static files served by Flask** — The root `/` route serves `app/static/index.html`. Flask handles static file serving directly. This avoids needing nginx for the MVP.

5. **10-second subprocess timeout** — `upsc` should respond in under a second. A 10s timeout catches hung processes without being too aggressive.

## Impact
- **Frontend team (Watney):** Can `fetch('/api/ups')` and always expect JSON with `timestamp`. Check for `error` key to detect failures. HTTP status 200 = good data, 503 = NUT problem.
- **DevOps (Johanssen):** App runs on `0.0.0.0:5000`. Entry point is `python -m app.main` or `python app/main.py`.
