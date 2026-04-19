"""Flask application serving UPS telemetry and the web dashboard."""

from flask import Flask, jsonify, send_from_directory
from app.ups_reader import get_ups_data

app = Flask(__name__, static_folder="static", static_url_path="")


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
    return jsonify(data)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
