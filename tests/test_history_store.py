"""Tests for app.history_store."""

from app.history_store import UpsHistoryStore


def _sample(ts: str, charge: str = "100", load: str = "20"):
    return {
        "timestamp": ts,
        "battery.charge": charge,
        "ups.load": load,
        "ups.status": "OL",
    }


def test_append_and_get_recent(tmp_path):
    store = UpsHistoryStore(tmp_path / "history.jsonl", max_entries=10)

    store.append_sample(_sample("2026-04-19T12:00:00"))
    store.append_sample(_sample("2026-04-19T12:00:05", charge="99"))

    rows = store.get_recent(10)
    assert len(rows) == 2
    assert rows[0]["battery.charge"] == "100"
    assert rows[1]["battery.charge"] == "99"


def test_invalid_sample_not_appended(tmp_path):
    store = UpsHistoryStore(tmp_path / "history.jsonl", max_entries=10)

    appended = store.append_sample({"error": "driver unavailable", "timestamp": "2026-04-19T12:00:00"})
    rows = store.get_recent(10)

    assert appended is False
    assert rows == []


def test_retention_trims_old_rows(tmp_path):
    store = UpsHistoryStore(tmp_path / "history.jsonl", max_entries=3)

    store.append_sample(_sample("2026-04-19T12:00:00", charge="100"))
    store.append_sample(_sample("2026-04-19T12:00:05", charge="99"))
    store.append_sample(_sample("2026-04-19T12:00:10", charge="98"))
    store.append_sample(_sample("2026-04-19T12:00:15", charge="97"))

    rows = store.get_recent(10)
    assert len(rows) == 3
    assert rows[0]["battery.charge"] == "99"
    assert rows[-1]["battery.charge"] == "97"
