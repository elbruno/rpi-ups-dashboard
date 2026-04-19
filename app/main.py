"""Flask application serving UPS telemetry, history, and the web dashboard."""

import os
from flask import Flask, jsonify, send_from_directory
from app.ups_reader import get_ups_data
from app.history_store import UpsHistoryStore

app = Flask(__name__, static_folder="static", static_url_path="")

history_store = UpsHistoryStore.from_environment()


def _parse_limit_arg(raw_value: str | None, default: int = 120, max_value: int = 2000) -> int:
    """Parse and clamp a positive integer query argument."""
    if raw_value is None:
        return default

    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return default

    if value <= 0:
        return default

    return min(value, max_value)


@app.after_request
def add_cors_headers(response):
    """Allow cross-origin requests for local development."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return response


@app.route("/")
def index():
    """Serve the dashboard UI."""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/ups")
def api_ups():
    """Return current UPS data as JSON.

    Returns 503 if NUT/upsc is unavailable or returns an error.
    """
    data = get_ups_data()
    if "error" in data:
        return jsonify(data), 503

    history_store.append_sample(data)
    return jsonify(data)


@app.route("/api/ups/history")
def api_ups_history():
    """Return recent UPS telemetry history samples for charts."""
    from flask import request

    limit = _parse_limit_arg(request.args.get("limit"), default=120, max_value=2000)
    samples = history_store.get_recent(limit)

    return jsonify(
        {
            "samples": samples,
            "count": len(samples),
            "limit": limit,
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
