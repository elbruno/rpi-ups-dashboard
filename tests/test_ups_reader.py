"""Tests for app.ups_reader — parse_upsc_output() and get_ups_data()."""

from datetime import datetime
from unittest.mock import patch, MagicMock
import subprocess

import pytest

from app.ups_reader import parse_upsc_output, get_ups_data


# ---------------------------------------------------------------------------
# Fixture: canonical upsc output used across multiple tests
# ---------------------------------------------------------------------------

SAMPLE_UPSC_OUTPUT = """\
battery.charge: 100
battery.charge.low: 10
battery.charge.warning: 20
battery.runtime: 3600
battery.runtime.low: 120
battery.type: PbAc
device.mfr: CPS
device.model: CP1500AVRLCD
device.type: ups
driver.name: usbhid-ups
driver.version: 2.8.0
input.voltage: 122.0
input.voltage.nominal: 120
output.voltage: 122.0
ups.delay.shutdown: 20
ups.delay.start: 30
ups.load: 25
ups.mfr: CPS
ups.model: CP1500AVRLCD
ups.productid: 0501
ups.status: OL
ups.vendorid: 0764
"""

EXPECTED_KEYS = [
    "battery.charge",
    "battery.charge.low",
    "battery.charge.warning",
    "battery.runtime",
    "battery.runtime.low",
    "battery.type",
    "device.mfr",
    "device.model",
    "device.type",
    "driver.name",
    "driver.version",
    "input.voltage",
    "input.voltage.nominal",
    "output.voltage",
    "ups.delay.shutdown",
    "ups.delay.start",
    "ups.load",
    "ups.mfr",
    "ups.model",
    "ups.productid",
    "ups.status",
    "ups.vendorid",
]


# ===================================================================
# parse_upsc_output — happy path
# ===================================================================


class TestParseUpscOutputHappyPath:
    """Verify parse_upsc_output correctly parses well-formed upsc output."""

    def test_returns_dict(self):
        result = parse_upsc_output(SAMPLE_UPSC_OUTPUT)
        assert isinstance(result, dict)

    def test_contains_all_expected_keys(self):
        result = parse_upsc_output(SAMPLE_UPSC_OUTPUT)
        for key in EXPECTED_KEYS:
            assert key in result, f"Missing expected key: {key}"

    def test_no_extra_keys(self):
        result = parse_upsc_output(SAMPLE_UPSC_OUTPUT)
        assert set(result.keys()) == set(EXPECTED_KEYS)

    def test_battery_charge_value(self):
        result = parse_upsc_output(SAMPLE_UPSC_OUTPUT)
        assert result["battery.charge"] == "100"

    def test_ups_status_value(self):
        result = parse_upsc_output(SAMPLE_UPSC_OUTPUT)
        assert result["ups.status"] == "OL"

    def test_device_model_value(self):
        result = parse_upsc_output(SAMPLE_UPSC_OUTPUT)
        assert result["device.model"] == "CP1500AVRLCD"

    def test_input_voltage_value(self):
        result = parse_upsc_output(SAMPLE_UPSC_OUTPUT)
        assert result["input.voltage"] == "122.0"

    def test_ups_load_value(self):
        result = parse_upsc_output(SAMPLE_UPSC_OUTPUT)
        assert result["ups.load"] == "25"


# ===================================================================
# parse_upsc_output — edge cases
# ===================================================================


class TestParseUpscOutputEdgeCases:
    """Verify parse_upsc_output handles unusual / malformed input gracefully."""

    def test_empty_string_returns_empty_dict(self):
        assert parse_upsc_output("") == {}

    def test_whitespace_only_returns_empty_dict(self):
        assert parse_upsc_output("   \n  \n") == {}

    def test_line_without_colon_is_skipped(self):
        raw = "no-colon-here\nbattery.charge: 100\n"
        result = parse_upsc_output(raw)
        assert "battery.charge" in result
        assert len(result) == 1

    def test_line_with_extra_colons_keeps_value_intact(self):
        raw = "device.info: value:with:colons\n"
        result = parse_upsc_output(raw)
        assert result["device.info"] == "value:with:colons"

    def test_leading_whitespace_trimmed_from_key(self):
        raw = "  battery.charge: 100\n"
        result = parse_upsc_output(raw)
        assert "battery.charge" in result
        assert result["battery.charge"] == "100"

    def test_trailing_whitespace_trimmed_from_value(self):
        raw = "battery.charge: 100   \n"
        result = parse_upsc_output(raw)
        assert result["battery.charge"] == "100"

    def test_blank_lines_are_skipped(self):
        raw = "battery.charge: 100\n\n\nups.status: OL\n"
        result = parse_upsc_output(raw)
        assert len(result) == 2

    def test_value_with_spaces(self):
        raw = "device.mfr: Cyber Power Systems\n"
        result = parse_upsc_output(raw)
        assert result["device.mfr"] == "Cyber Power Systems"


# ===================================================================
# get_ups_data — mocked subprocess
# ===================================================================


class TestGetUpsDataSuccess:
    """Verify get_ups_data() with a mocked subprocess returning valid output."""

    @patch("app.ups_reader.shutil.which", return_value="/usr/bin/upsc")
    @patch("app.ups_reader.subprocess.run")
    def test_returns_dict(self, mock_run, mock_which):
        mock_run.return_value = MagicMock(
            stdout=SAMPLE_UPSC_OUTPUT, returncode=0
        )
        result = get_ups_data()
        assert isinstance(result, dict)

    @patch("app.ups_reader.shutil.which", return_value="/usr/bin/upsc")
    @patch("app.ups_reader.subprocess.run")
    def test_contains_parsed_ups_keys(self, mock_run, mock_which):
        mock_run.return_value = MagicMock(
            stdout=SAMPLE_UPSC_OUTPUT, returncode=0
        )
        result = get_ups_data()
        for key in EXPECTED_KEYS:
            assert key in result, f"Missing key in get_ups_data result: {key}"

    @patch("app.ups_reader.shutil.which", return_value="/usr/bin/upsc")
    @patch("app.ups_reader.subprocess.run")
    def test_timestamp_is_present(self, mock_run, mock_which):
        mock_run.return_value = MagicMock(
            stdout=SAMPLE_UPSC_OUTPUT, returncode=0
        )
        result = get_ups_data()
        assert "timestamp" in result

    @patch("app.ups_reader.shutil.which", return_value="/usr/bin/upsc")
    @patch("app.ups_reader.subprocess.run")
    def test_timestamp_is_valid_iso8601(self, mock_run, mock_which):
        mock_run.return_value = MagicMock(
            stdout=SAMPLE_UPSC_OUTPUT, returncode=0
        )
        result = get_ups_data()
        # Should not raise if it's valid ISO 8601
        ts = datetime.fromisoformat(result["timestamp"])
        assert isinstance(ts, datetime)

    @patch("app.ups_reader.shutil.which", return_value="/usr/bin/upsc")
    @patch("app.ups_reader.subprocess.run")
    def test_calls_upsc_command(self, mock_run, mock_which):
        mock_run.return_value = MagicMock(
            stdout=SAMPLE_UPSC_OUTPUT, returncode=0
        )
        get_ups_data()
        mock_run.assert_called_once()
        args = mock_run.call_args
        cmd = args[0][0] if args[0] else args[1].get("args", [])
        assert any("upsc" in str(c) for c in cmd)


# ===================================================================
# get_ups_data — failure modes
# ===================================================================


class TestGetUpsDataFailures:
    """Verify get_ups_data() handles subprocess failures gracefully."""

    @patch("app.ups_reader.shutil.which", return_value=None)
    def test_upsc_not_found_returns_error_dict(self, mock_which):
        """When upsc is not installed, get_ups_data returns an error dict."""
        result = get_ups_data()
        assert isinstance(result, dict)
        assert "error" in result
        assert "timestamp" in result

    @patch("app.ups_reader.shutil.which", return_value="/usr/bin/upsc")
    @patch("app.ups_reader.subprocess.run")
    def test_oserror_returns_error_dict(self, mock_run, mock_which):
        """When subprocess raises OSError, get_ups_data returns an error dict."""
        mock_run.side_effect = OSError("upsc execution failed")
        result = get_ups_data()
        assert isinstance(result, dict)
        assert "error" in result
        assert "timestamp" in result

    @patch("app.ups_reader.shutil.which", return_value="/usr/bin/upsc")
    @patch("app.ups_reader.subprocess.run")
    def test_nonzero_exit_code_returns_error_dict(self, mock_run, mock_which):
        """When upsc returns non-zero exit code, get_ups_data returns an error dict."""
        mock_run.return_value = MagicMock(
            stdout="", stderr="Error: Connection failure", returncode=1
        )
        result = get_ups_data()
        assert isinstance(result, dict)
        assert "error" in result
        assert "timestamp" in result

    @patch("app.ups_reader.shutil.which", return_value="/usr/bin/upsc")
    @patch("app.ups_reader.subprocess.run")
    def test_timeout_returns_error_dict(self, mock_run, mock_which):
        """When upsc times out, get_ups_data returns an error dict."""
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="upsc", timeout=10)
        result = get_ups_data()
        assert isinstance(result, dict)
        assert "error" in result
        assert "timed out" in result["error"].lower()
