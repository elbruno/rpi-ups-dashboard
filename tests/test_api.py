"""Tests for the Flask API defined in app.main."""

from unittest.mock import patch, MagicMock
import json
import subprocess

import pytest

from app.main import app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_UPS_DATA = {
    "battery.charge": "100",
    "battery.charge.low": "10",
    "battery.charge.warning": "20",
    "battery.runtime": "3600",
    "battery.runtime.low": "120",
    "battery.type": "PbAc",
    "device.mfr": "CPS",
    "device.model": "CP1500AVRLCD",
    "device.type": "ups",
    "driver.name": "usbhid-ups",
    "driver.version": "2.8.0",
    "input.voltage": "122.0",
    "input.voltage.nominal": "120",
    "output.voltage": "122.0",
    "ups.delay.shutdown": "20",
    "ups.delay.start": "30",
    "ups.load": "25",
    "ups.mfr": "CPS",
    "ups.model": "CP1500AVRLCD",
    "ups.productid": "0501",
    "ups.status": "OL",
    "ups.vendorid": "0764",
    "timestamp": "2026-04-19T12:00:00",
}


@pytest.fixture
def client():
    """Create a Flask test client."""
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


# ===================================================================
# GET /api/ups — happy path
# ===================================================================


class TestApiUpsEndpoint:
    """Verify GET /api/ups returns correct JSON when UPS data is available."""

    @pytest.fixture(autouse=True)
    def setup_client(self, client):
        self.client = client

    @patch("app.main.get_ups_data")
    def test_returns_200(self, mock_get):
        mock_get.return_value = SAMPLE_UPS_DATA
        response = self.client.get("/api/ups")
        assert response.status_code == 200

    @patch("app.main.get_ups_data")
    def test_returns_json_content_type(self, mock_get):
        mock_get.return_value = SAMPLE_UPS_DATA
        response = self.client.get("/api/ups")
        assert "application/json" in response.content_type

    @patch("app.main.get_ups_data")
    def test_response_is_valid_json(self, mock_get):
        mock_get.return_value = SAMPLE_UPS_DATA
        response = self.client.get("/api/ups")
        data = json.loads(response.data)
        assert isinstance(data, dict)

    @patch("app.main.get_ups_data")
    def test_response_contains_battery_charge(self, mock_get):
        mock_get.return_value = SAMPLE_UPS_DATA
        response = self.client.get("/api/ups")
        data = json.loads(response.data)
        assert "battery.charge" in data

    @patch("app.main.get_ups_data")
    def test_response_contains_ups_status(self, mock_get):
        mock_get.return_value = SAMPLE_UPS_DATA
        response = self.client.get("/api/ups")
        data = json.loads(response.data)
        assert "ups.status" in data

    @patch("app.main.get_ups_data")
    def test_response_contains_timestamp(self, mock_get):
        mock_get.return_value = SAMPLE_UPS_DATA
        response = self.client.get("/api/ups")
        data = json.loads(response.data)
        assert "timestamp" in data

    @patch("app.main.get_ups_data")
    def test_response_contains_all_expected_keys(self, mock_get):
        mock_get.return_value = SAMPLE_UPS_DATA
        response = self.client.get("/api/ups")
        data = json.loads(response.data)
        for key in SAMPLE_UPS_DATA:
            assert key in data, f"Missing key in API response: {key}"


# ===================================================================
# GET /api/ups — error handling
# ===================================================================


class TestApiUpsErrors:
    """Verify GET /api/ups handles NUT unavailability correctly."""

    @pytest.fixture(autouse=True)
    def setup_client(self, client):
        self.client = client

    @patch("app.main.get_ups_data")
    def test_returns_503_when_nut_unavailable(self, mock_get):
        """When get_ups_data returns an error dict, API should return 503."""
        mock_get.return_value = {"error": "NUT not available", "timestamp": "2026-04-19T12:00:00"}
        response = self.client.get("/api/ups")
        assert response.status_code == 503

    @patch("app.main.get_ups_data")
    def test_503_response_is_json(self, mock_get):
        mock_get.return_value = {"error": "NUT not available", "timestamp": "2026-04-19T12:00:00"}
        response = self.client.get("/api/ups")
        assert "application/json" in response.content_type

    @patch("app.main.get_ups_data")
    def test_503_response_contains_error_message(self, mock_get):
        mock_get.return_value = {"error": "NUT not available", "timestamp": "2026-04-19T12:00:00"}
        response = self.client.get("/api/ups")
        data = json.loads(response.data)
        assert "error" in data

    @patch("app.main.get_ups_data")
    def test_upsc_not_found_returns_503(self, mock_get):
        """When upsc binary is missing, API returns error dict → 503."""
        mock_get.return_value = {"error": "upsc command not found", "timestamp": "2026-04-19T12:00:00"}
        response = self.client.get("/api/ups")
        assert response.status_code == 503


# ===================================================================
# GET / — static file serving
# ===================================================================


class TestStaticServing:
    """Verify the root route serves the index page."""

    @pytest.fixture(autouse=True)
    def setup_client(self, client):
        self.client = client

    def test_root_returns_200(self):
        response = self.client.get("/")
        assert response.status_code == 200
