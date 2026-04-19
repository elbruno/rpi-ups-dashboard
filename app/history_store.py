"""Persistent local history storage for UPS telemetry samples."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any


class UpsHistoryStore:
    """Append-only JSONL telemetry store with bounded retention."""

    DEFAULT_PATH = "data/ups_history.jsonl"
    DEFAULT_MAX_ENTRIES = 5000

    SAMPLE_KEYS = (
        "timestamp",
        "battery.charge",
        "battery.runtime",
        "battery.runtime.low",
        "battery.voltage",
        "input.voltage",
        "output.voltage",
        "ups.load",
        "ups.status",
        "ups.model",
        "ups.realpower.nominal",
    )

    def __init__(self, file_path: str | Path, max_entries: int = DEFAULT_MAX_ENTRIES):
        self.file_path = Path(file_path)
        self.max_entries = max(1, int(max_entries))
        self._lock = threading.Lock()

        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.file_path.exists():
            self.file_path.touch()

    @classmethod
    def from_environment(cls) -> "UpsHistoryStore":
        """Build a store using environment overrides when present."""
        file_path = os.environ.get("UPS_HISTORY_FILE", cls.DEFAULT_PATH)
        max_entries_raw = os.environ.get("UPS_HISTORY_MAX_ENTRIES", str(cls.DEFAULT_MAX_ENTRIES))

        try:
            max_entries = int(max_entries_raw)
        except ValueError:
            max_entries = cls.DEFAULT_MAX_ENTRIES

        return cls(file_path=file_path, max_entries=max_entries)

    @classmethod
    def _is_valid_sample(cls, data: dict[str, Any]) -> bool:
        return isinstance(data, dict) and bool(data.get("timestamp")) and "error" not in data

    @classmethod
    def _normalize_sample(cls, data: dict[str, Any]) -> dict[str, Any]:
        sample = {k: data.get(k) for k in cls.SAMPLE_KEYS if k in data}

        return sample

    def append_sample(self, data: dict[str, Any]) -> bool:
        """Append one sample to the JSONL file.

        Returns True when a sample was appended, False otherwise.
        """
        if not self._is_valid_sample(data):
            return False

        sample = self._normalize_sample(data)

        with self._lock:
            with self.file_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(sample, ensure_ascii=False) + "\n")

            self._trim_if_needed_locked()

        return True

    def _trim_if_needed_locked(self) -> None:
        """Keep only the newest max_entries rows when file grows too large."""
        with self.file_path.open("r", encoding="utf-8") as f:
            lines = f.readlines()

        if len(lines) <= self.max_entries:
            return

        trimmed = lines[-self.max_entries :]
        with self.file_path.open("w", encoding="utf-8") as f:
            f.writelines(trimmed)

    def get_recent(self, limit: int = 120) -> list[dict[str, Any]]:
        """Return recent samples ordered from oldest to newest."""
        limit = max(1, min(int(limit), self.max_entries))

        with self._lock:
            with self.file_path.open("r", encoding="utf-8") as f:
                lines = f.readlines()

        recent_lines = lines[-limit:]
        samples: list[dict[str, Any]] = []

        for line in recent_lines:
            line = line.strip()
            if not line:
                continue

            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue

            if isinstance(value, dict) and value.get("timestamp"):
                samples.append(value)

        return samples
