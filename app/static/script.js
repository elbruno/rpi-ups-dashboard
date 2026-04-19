/**
 * UPS Monitor Dashboard — real-time polling of /api/ups
 * Vanilla JS, no frameworks, lightweight for Raspberry Pi.
 */
(function () {
  "use strict";

  const POLL_INTERVAL_MS = 5000;
  const API_URL = "/api/ups";
  const HISTORY_URL = "/api/ups/history?limit=120";

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
    historyChart: document.getElementById("history-chart"),
    historyEmpty: document.getElementById("history-empty"),
    historyMeta: document.getElementById("history-meta"),
  };

  let lastFetchTime = null;
  let agoTimer = null;
  let isFirstLoad = true;
  let historyPoints = [];

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

  // ── History chart ────────────────────────────────────────────
  function drawHistoryChart(samples) {
    if (!dom.historyChart) return;

    var canvas = dom.historyChart;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var dpr = window.devicePixelRatio || 1;
    var cssWidth = canvas.clientWidth || 900;
    var cssHeight = canvas.clientHeight || 300;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (!samples || samples.length < 2) {
      if (dom.historyEmpty) dom.historyEmpty.style.display = "block";
      return;
    }

    if (dom.historyEmpty) dom.historyEmpty.style.display = "none";

    var pad = { top: 16, right: 16, bottom: 28, left: 36 };
    var w = cssWidth - pad.left - pad.right;
    var h = cssHeight - pad.top - pad.bottom;
    var baseX = pad.left;
    var baseY = pad.top;

    // Grid
    ctx.strokeStyle = "rgba(154, 160, 166, 0.2)";
    ctx.lineWidth = 1;
    for (var gy = 0; gy <= 4; gy++) {
      var y = baseY + (h * gy) / 4;
      ctx.beginPath();
      ctx.moveTo(baseX, y);
      ctx.lineTo(baseX + w, y);
      ctx.stroke();
    }

    var batteryPoints = [];
    var loadPoints = [];

    samples.forEach(function (sample, idx) {
      var x = baseX + (w * idx) / Math.max(samples.length - 1, 1);
      var b = parseFloat(sample["battery.charge"]);
      var l = parseFloat(sample["ups.load"]);

      if (!isNaN(b)) {
        batteryPoints.push({ x: x, y: baseY + h - (Math.max(0, Math.min(100, b)) / 100) * h });
      }
      if (!isNaN(l)) {
        loadPoints.push({ x: x, y: baseY + h - (Math.max(0, Math.min(100, l)) / 100) * h });
      }
    });

    function drawLine(points, color) {
      if (!points.length) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }

    drawLine(batteryPoints, "#34d399");
    drawLine(loadPoints, "#60a5fa");

    // Axis labels
    ctx.fillStyle = "rgba(232, 234, 237, 0.8)";
    ctx.font = "12px sans-serif";
    ctx.fillText("100%", 4, baseY + 4);
    ctx.fillText("0%", 10, baseY + h + 4);

    var firstTs = samples[0].timestamp ? new Date(samples[0].timestamp) : null;
    var lastTs = samples[samples.length - 1].timestamp
      ? new Date(samples[samples.length - 1].timestamp)
      : null;

    if (firstTs && lastTs) {
      ctx.fillStyle = "rgba(154, 160, 166, 0.9)";
      ctx.fillText(firstTs.toLocaleTimeString(), baseX, cssHeight - 6);
      var endLabel = lastTs.toLocaleTimeString();
      var textWidth = ctx.measureText(endLabel).width;
      ctx.fillText(endLabel, baseX + w - textWidth, cssHeight - 6);
    }
  }

  function fetchHistory() {
    return fetch(HISTORY_URL)
      .then(function (res) {
        return res.json();
      })
      .then(function (payload) {
        if (!payload || !Array.isArray(payload.samples)) {
          throw new Error("Invalid history payload");
        }

        historyPoints = payload.samples;
        drawHistoryChart(historyPoints);

        if (dom.historyMeta) {
          dom.historyMeta.textContent =
            payload.count + " samples" + (payload.count ? " · oldest → newest" : "");
        }
      })
      .catch(function () {
        historyPoints = [];
        drawHistoryChart(historyPoints);
        if (dom.historyMeta) {
          dom.historyMeta.textContent = "History unavailable";
        }
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
      })
      .finally(function () {
        fetchHistory();
      });
  }

  // ── Boot ─────────────────────────────────────────────────────
  showLoading();
  fetchData();
  setInterval(fetchData, POLL_INTERVAL_MS);
  window.addEventListener("resize", function () {
    drawHistoryChart(historyPoints);
  });
})();
