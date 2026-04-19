# 📈 Phase 2 Plan — Historical Charts & Data Logging

## Scope
Implement roadmap **Phase 2** with two deliverables:

1. **Data logging** of UPS telemetry samples (persistent, local, lightweight).
2. **Historical charts** in dashboard UI (battery % and load % trends).

## Goals
- Keep runtime footprint small for Raspberry Pi.
- Keep implementation dependency-free (no DB, no JS chart framework).
- Provide API access to recent history for UI and future automations.

## Architecture

```text
NUT upsc -> /api/ups -> append sample (JSONL file) -> /api/ups/history -> dashboard canvas chart
```

### Storage strategy
- File format: **JSON Lines** (`.jsonl`), one sample per line.
- Default path: `data/ups_history.jsonl`.
- Bounded retention: keep only the most recent `UPS_HISTORY_MAX_ENTRIES` entries.

### API additions
- `GET /api/ups/history?limit=120`
  - Returns:
    - `samples`: ordered oldest -> newest
    - `count`: number of samples returned
    - `limit`: applied limit

## Functional Requirements
- Successful `/api/ups` reads append one history sample.
- Error payloads are **not** persisted.
- `limit` query param is validated and clamped.
- Chart renders even with sparse data and degrades gracefully when unavailable.

## Non-Functional Requirements
- No added external dependencies.
- Backwards compatibility for existing `/api/ups` consumers.
- Keep test suite green.

## Acceptance Criteria
- New history endpoint returns valid JSON with sample list.
- Dashboard displays historical line chart for battery and load.
- Tests cover store logic and history endpoint.
- README and PRD document the new capabilities.
