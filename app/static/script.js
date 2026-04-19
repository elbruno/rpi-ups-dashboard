/**
 * UPS Monitor Dashboard — real-time polling of /api/ups
 * Vanilla JS, no frameworks, lightweight for Raspberry Pi.
 */
(function () {
  "use strict";

  const POLL_INTERVAL_MS = 5000;
  const API_URL = "/api/ups";

  // DOM references
  const dom = {
    connectionStatus: document.getElementById("connection-status"),
    connectionText: document.getElementById("connection-text"),
    statusBanner: document.getElementById("status-banner"),
    statusIcon: document.getElementById("status-icon"),
    statusText: document.getElementById("status-text"),
    statusDetail: document.getElementById("status-detail"),
    upsModel: document.getElementById("ups-model"),
    batteryValue: document.getElementById("battery-value"),
    batteryBar: document.getElementById("battery-bar"),
    runtimeValue: document.getElementById("runtime-value"),
    runtimeSeconds: document.getElementById("runtime-seconds"),
    inputVoltage: document.getElementById("input-voltage-value"),
    outputVoltage: document.getElementById("output-voltage-value"),
    loadValue: document.getElementById("load-value"),
    loadBar: document.getElementById("load-bar"),
    lastUpdatedValue: document.getElementById("last-updated-value"),
    lastUpdatedAgo: document.getElementById("last-updated-ago"),
    estimatedPowerValue: document.getElementById("estimated-power-value"),
    estimatedPowerSub: document.getElementById("estimated-power-sub"),
    runtimeHealthBadge: document.getElementById("runtime-health-badge"),
    timeToLowValue: document.getElementById("time-to-low-value"),
    batteryVoltageValue: document.getElementById("battery-voltage-value"),
    statusFlags: document.getElementById("status-flags"),
    diagMfr: document.getElementById("diag-mfr"),
    diagSerial: document.getElementById("diag-serial"),
    diagBatteryType: document.getElementById("diag-battery-type"),
    diagBeeper: document.getElementById("diag-beeper"),
    diagDriver: document.getElementById("diag-driver"),
    diagDriverState: document.getElementById("diag-driver-state"),
    diagInputNominal: document.getElementById("diag-input-nominal"),
    diagPowerNominal: document.getElementById("diag-power-nominal"),
  };

  let lastFetchTime = null;
  let agoTimer = null;
  let isFirstLoad = true;

  // ── Status mapping ───────────────────────────────────────────
  const STATUS_MAP = {
    OL: { label: "Online (AC Power)", level: "ok", icon: "✅" },
    "OL CHRG": { label: "Online — Charging", level: "ok", icon: "🔌" },
    OB: { label: "On Battery", level: "warn", icon: "🔋" },
    "OB DISCHRG": {
      label: "On Battery — Discharging",
      level: "warn",
      icon: "⚠️",
    },
    LB: { label: "Low Battery!", level: "critical", icon: "🚨" },
  };

  function resolveStatus(raw) {
    if (!raw) return { label: "Unknown", level: "warn", icon: "❓" };
    const key = raw.trim().toUpperCase();
    return STATUS_MAP[key] || { label: raw, level: "warn", icon: "❓" };
  }

  // ── Helpers ──────────────────────────────────────────────────
  function formatRuntime(seconds) {
    const s = parseInt(seconds, 10);
    if (isNaN(s) || s < 0) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m";
    return s + "s";
  }

  function barLevel(percent) {
    if (percent <= 20) return "critical";
    if (percent <= 50) return "warn";
    return "";
  }

  function loadBarLevel(percent) {
    if (percent >= 90) return "critical";
    if (percent >= 70) return "warn";
    return "";
  }

  function formatDiffTime(seconds) {
    var s = parseInt(seconds, 10);
    if (isNaN(s)) return "—";
    if (s <= 0) return "now";
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m";
    return s + "s";
  }

  function setHealthBadge(level, label) {
    dom.runtimeHealthBadge.className = "health-badge health-" + level;
    dom.runtimeHealthBadge.textContent = label;
  }

  function renderStatusFlags(rawStatus) {
    dom.statusFlags.innerHTML = "";

    if (!rawStatus) {
      var unknown = document.createElement("span");
      unknown.className = "flag-chip flag-unknown";
      unknown.textContent = "UNKNOWN";
      dom.statusFlags.appendChild(unknown);
      return;
    }

    rawStatus
      .trim()
      .toUpperCase()
      .split(/\s+/)
      .forEach(function (flag) {
        var chip = document.createElement("span");
        chip.className = "flag-chip";

        if (flag === "OL") chip.className += " flag-ok";
        else if (flag === "OB" || flag === "DISCHRG") chip.className += " flag-warn";
        else if (flag === "LB") chip.className += " flag-critical";
        else chip.className += " flag-unknown";

        chip.textContent = flag;
        dom.statusFlags.appendChild(chip);
      });
  }

  // ── Loading state ────────────────────────────────────────────
  function showLoading() {
    document.querySelectorAll(".metric-card").forEach(function (card) {
      card.classList.add("loading");
    });
  }

  function hideLoading() {
    document.querySelectorAll(".metric-card").forEach(function (card) {
      card.classList.remove("loading");
    });
  }

  // ── Connection indicator ─────────────────────────────────────
  function setConnected(connected) {
    if (connected) {
      dom.connectionStatus.className = "connection-indicator connected";
      dom.connectionText.textContent = "Connected";
    } else {
      dom.connectionStatus.className = "connection-indicator disconnected";
      dom.connectionText.textContent = "Connection lost";
    }
  }

  // ── Update "ago" counter ─────────────────────────────────────
  function startAgoCounter() {
    if (agoTimer) clearInterval(agoTimer);
    agoTimer = setInterval(updateAgo, 1000);
  }

  function updateAgo() {
    if (!lastFetchTime) return;
    var diff = Math.round((Date.now() - lastFetchTime) / 1000);
    if (diff < 2) {
      dom.lastUpdatedAgo.textContent = "just now";
    } else {
      dom.lastUpdatedAgo.textContent = diff + "s ago";
    }
  }

  // ── Render data ──────────────────────────────────────────────
  function render(data) {
    // Status banner
    var status = resolveStatus(data["ups.status"]);
    dom.statusBanner.className = "status-banner status-" + status.level;
    dom.statusIcon.textContent = status.icon;
    dom.statusText.textContent = status.label;
    dom.statusDetail.textContent = "";
    dom.upsModel.textContent = data["ups.model"] || "—";

    // Battery charge
    var charge = parseFloat(data["battery.charge"]);
    dom.batteryValue.textContent = isNaN(charge) ? "—" : charge + "%";
    if (!isNaN(charge)) {
      dom.batteryBar.style.width = Math.min(charge, 100) + "%";
      dom.batteryBar.setAttribute("aria-valuenow", charge);
      dom.batteryBar.className = "battery-bar-fill " + barLevel(charge);
    }

    // Runtime
    var runtime = data["battery.runtime"];
    dom.runtimeValue.textContent = formatRuntime(runtime);
    dom.runtimeSeconds.textContent =
      runtime && !isNaN(parseInt(runtime, 10))
        ? parseInt(runtime, 10).toLocaleString() + " seconds"
        : "—";

    // Voltages
    dom.inputVoltage.textContent = data["input.voltage"]
      ? parseFloat(data["input.voltage"]).toFixed(1)
      : "—";
    dom.outputVoltage.textContent = data["output.voltage"]
      ? parseFloat(data["output.voltage"]).toFixed(1)
      : "—";

    // Load
    var load = parseFloat(data["ups.load"]);
    dom.loadValue.textContent = isNaN(load) ? "—" : load + "%";
    if (!isNaN(load)) {
      dom.loadBar.style.width = Math.min(load, 100) + "%";
      dom.loadBar.setAttribute("aria-valuenow", load);
      dom.loadBar.className = "load-bar-fill " + loadBarLevel(load);
    }

    // Computed power estimate
    var nominalPower = parseFloat(data["ups.realpower.nominal"]);
    if (!isNaN(load) && !isNaN(nominalPower)) {
      var watts = Math.round((load / 100) * nominalPower);
      dom.estimatedPowerValue.textContent = watts + " W";
      dom.estimatedPowerSub.textContent = load.toFixed(0) + "% of " + nominalPower.toFixed(0) + " W nominal";
    } else {
      dom.estimatedPowerValue.textContent = "—";
      dom.estimatedPowerSub.textContent = "requires load + nominal power";
    }

    // Runtime health + time to low threshold
    var runtimeInt = parseInt(data["battery.runtime"], 10);
    var runtimeLowInt = parseInt(data["battery.runtime.low"], 10);
    var statusRaw = data["ups.status"] || "";

    if (!isNaN(runtimeInt) && !isNaN(runtimeLowInt)) {
      var secondsToLow = runtimeInt - runtimeLowInt;
      dom.timeToLowValue.textContent = "time to low: " + formatDiffTime(secondsToLow);

      if (secondsToLow <= 0 || /LB/.test(statusRaw)) {
        setHealthBadge("critical", "Critical");
      } else if (secondsToLow <= 600 || /OB/.test(statusRaw)) {
        setHealthBadge("warn", "Caution");
      } else {
        setHealthBadge("ok", "Good");
      }
    } else {
      dom.timeToLowValue.textContent = "time to low: —";
      setHealthBadge("unknown", "Unknown");
    }

    // Battery voltage
    var batteryVoltage = parseFloat(data["battery.voltage"]);
    dom.batteryVoltageValue.textContent = isNaN(batteryVoltage) ? "—" : batteryVoltage.toFixed(1);

    // Status flags
    renderStatusFlags(statusRaw);

    // Advanced diagnostics
    dom.diagMfr.textContent = data["device.mfr"] || data["ups.mfr"] || "—";
    dom.diagSerial.textContent = data["device.serial"] || data["ups.serial"] || "—";
    dom.diagBatteryType.textContent = data["battery.type"] || "—";
    dom.diagBeeper.textContent = data["ups.beeper.status"] || "—";
    dom.diagDriver.textContent = data["driver.name"] && data["driver.version"]
      ? data["driver.name"] + " " + data["driver.version"]
      : data["driver.name"] || data["driver.version"] || "—";
    dom.diagDriverState.textContent = data["driver.state"] || "—";
    dom.diagInputNominal.textContent = data["input.voltage.nominal"]
      ? parseFloat(data["input.voltage.nominal"]).toFixed(0) + " VAC"
      : "—";
    dom.diagPowerNominal.textContent = !isNaN(nominalPower) ? nominalPower.toFixed(0) + " W" : "—";

    // Timestamp
    if (data.timestamp) {
      var ts = new Date(data.timestamp);
      dom.lastUpdatedValue.textContent = ts.toLocaleTimeString();
    } else {
      dom.lastUpdatedValue.textContent = new Date().toLocaleTimeString();
    }

    lastFetchTime = Date.now();
    updateAgo();
  }

  function renderError(errorMessage, payload) {
    var message = errorMessage || "Unable to fetch UPS data";
    var ts = payload && payload.timestamp ? new Date(payload.timestamp) : new Date();

    dom.statusBanner.className = "status-banner status-critical";
    dom.statusIcon.textContent = "🚨";
    dom.statusText.textContent = "UPS data unavailable";
    dom.statusDetail.textContent = message;
    dom.upsModel.textContent = "Check NUT driver / USB connection";

    dom.batteryValue.textContent = "—";
    dom.runtimeValue.textContent = "—";
    dom.runtimeSeconds.textContent = "No telemetry yet";
    dom.inputVoltage.textContent = "—";
    dom.outputVoltage.textContent = "—";
    dom.loadValue.textContent = "—";
    dom.estimatedPowerValue.textContent = "—";
    dom.estimatedPowerSub.textContent = "waiting for healthy UPS telemetry";
    dom.timeToLowValue.textContent = "time to low: —";
    dom.batteryVoltageValue.textContent = "—";
    setHealthBadge("critical", "Unavailable");

    dom.statusFlags.innerHTML = "";
    var errorChip = document.createElement("span");
    errorChip.className = "flag-chip flag-critical";
    errorChip.textContent = "NO DATA";
    dom.statusFlags.appendChild(errorChip);

    dom.diagMfr.textContent = "—";
    dom.diagSerial.textContent = "—";
    dom.diagBatteryType.textContent = "—";
    dom.diagBeeper.textContent = "—";
    dom.diagDriver.textContent = "—";
    dom.diagDriverState.textContent = "—";
    dom.diagInputNominal.textContent = "—";
    dom.diagPowerNominal.textContent = "—";

    dom.batteryBar.style.width = "0%";
    dom.batteryBar.setAttribute("aria-valuenow", "0");
    dom.batteryBar.className = "battery-bar-fill critical";

    dom.loadBar.style.width = "0%";
    dom.loadBar.setAttribute("aria-valuenow", "0");
    dom.loadBar.className = "load-bar-fill";

    dom.lastUpdatedValue.textContent = ts.toLocaleTimeString();
    dom.lastUpdatedAgo.textContent = "waiting for healthy UPS telemetry";
  }

  // ── Fetch cycle ──────────────────────────────────────────────
  function fetchData() {
    fetch(API_URL)
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            var err = new Error("HTTP " + res.status);
            err.payload = data;
            throw err;
          }
          return data;
        });
      })
      .then(function (data) {
        if (isFirstLoad) {
          hideLoading();
          isFirstLoad = false;
          startAgoCounter();
        }
        setConnected(true);
        render(data);
      })
      .catch(function (err) {
        if (isFirstLoad) {
          hideLoading();
          isFirstLoad = false;
          startAgoCounter();
        }
        setConnected(false);
        var payload = err && err.payload ? err.payload : null;
        var message = payload && payload.error ? payload.error : "Cannot reach /api/ups";
        renderError(message, payload);
      });
  }

  // ── Boot ─────────────────────────────────────────────────────
  showLoading();
  fetchData();
  setInterval(fetchData, POLL_INTERVAL_MS);
})();
