"""UPS data reader using NUT (Network UPS Tools) via the upsc command."""

import subprocess
import shutil
from datetime import datetime, timezone


# Key UPS fields we care about for the dashboard
KEY_FIELDS = {
    "battery.charge",
    "battery.runtime",
    "input.voltage",
    "output.voltage",
    "ups.load",
    "ups.status",
    "ups.model",
    "ups.mfr",
}


def parse_upsc_output(raw_output: str) -> dict:
    """Parse the key: value format from `upsc ups@localhost` into a Python dict.

    Each line of upsc output is formatted as "key: value".
    Lines that don't match this format are silently skipped.
    """
    data = {}
    if not raw_output or not raw_output.strip():
        return data

    for line in raw_output.splitlines():
        line = line.strip()
        if not line:
            continue

        # upsc format is "key: value" — split on first colon only
        parts = line.split(":", 1)
        if len(parts) != 2:
            continue

        key = parts[0].strip()
        value = parts[1].strip()
        if key:
            data[key] = value

    return data


def get_ups_data() -> dict:
    """Run upsc and return parsed UPS data with a timestamp.

    Returns a dict with UPS telemetry on success, or an error dict on failure.
    The response always includes a 'timestamp' field (ISO 8601 UTC).
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    # Check if upsc is available on the system
    if shutil.which("upsc") is None:
        return {
            "error": "upsc command not found. Install NUT: sudo apt install nut-client",
            "timestamp": timestamp,
        }

    try:
        result = subprocess.run(
            ["upsc", "ups@localhost"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except subprocess.TimeoutExpired:
        return {
            "error": "upsc command timed out after 10 seconds",
            "timestamp": timestamp,
        }
    except OSError as exc:
        return {
            "error": f"Failed to execute upsc: {exc}",
            "timestamp": timestamp,
        }

    # upsc writes data to stdout but errors/warnings to stderr
    if result.returncode != 0:
        stderr_msg = result.stderr.strip() if result.stderr else "unknown error"
        return {
            "error": f"upsc exited with code {result.returncode}: {stderr_msg}",
            "timestamp": timestamp,
        }

    data = parse_upsc_output(result.stdout)
    if not data:
        return {
            "error": "upsc returned empty or unparseable output",
            "timestamp": timestamp,
        }

    data["timestamp"] = timestamp
    return data
