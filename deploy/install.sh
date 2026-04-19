#!/bin/bash
# =============================================================================
# install.sh — Raspberry Pi UPS Dashboard deployment script
# Installs NUT, configures CyberPower UPS monitoring, and sets up the Flask
# dashboard as a systemd service.
#
# Usage: sudo bash deploy/install.sh
# Safe to re-run (idempotent).
# =============================================================================

set -euo pipefail

# --- Configuration -----------------------------------------------------------
APP_DIR="/opt/rpi-ups-dashboard"
SERVICE_NAME="ups-dashboard"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NUT_CONF_DIR="/etc/nut"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# --- Helpers -----------------------------------------------------------------
info()  { echo -e "\n\033[1;34m==>\033[0m \033[1m$*\033[0m"; }
ok()    { echo -e "    \033[1;32m✓\033[0m $*"; }
warn()  { echo -e "    \033[1;33m⚠\033[0m $*"; }
fail()  { echo -e "    \033[1;31m✗\033[0m $*"; exit 1; }

# --- Pre-flight checks -------------------------------------------------------
info "Checking prerequisites"

if [ "$(id -u)" -ne 0 ]; then
    fail "This script must be run as root. Use: sudo bash deploy/install.sh"
fi
ok "Running as root"

# --- Step 1: Install system packages -----------------------------------------
info "Installing system packages (NUT, Python3)"

apt-get update -qq
apt-get install -y -qq nut nut-client nut-server python3 python3-pip > /dev/null 2>&1
ok "Packages installed"

# --- Step 2: Configure NUT for CyberPower UPS --------------------------------
info "Configuring NUT for CyberPower UPS (vendorid 0764)"

# Back up existing NUT configs (only first time)
for conf_file in ups.conf upsd.conf upsd.users nut.conf; do
    target="${NUT_CONF_DIR}/${conf_file}"
    if [ -f "$target" ] && [ ! -f "${target}.bak" ]; then
        cp "$target" "${target}.bak"
        ok "Backed up original ${conf_file}"
    fi
done

# Copy our NUT configuration files
cp "${SCRIPT_DIR}/ups.conf"    "${NUT_CONF_DIR}/ups.conf"
cp "${SCRIPT_DIR}/upsd.conf"   "${NUT_CONF_DIR}/upsd.conf"
cp "${SCRIPT_DIR}/upsd.users"  "${NUT_CONF_DIR}/upsd.users"
cp "${SCRIPT_DIR}/nut.conf"    "${NUT_CONF_DIR}/nut.conf"

# Fix permissions — NUT config files must be owned by the nut user
chown root:nut "${NUT_CONF_DIR}/ups.conf" "${NUT_CONF_DIR}/upsd.conf" "${NUT_CONF_DIR}/nut.conf"
chown root:nut "${NUT_CONF_DIR}/upsd.users"
chmod 640 "${NUT_CONF_DIR}/upsd.users"
ok "NUT config files installed to ${NUT_CONF_DIR}"

# --- Step 3: Start NUT services ----------------------------------------------
info "Starting NUT services"

systemctl daemon-reload
systemctl restart nut-driver.service  || warn "nut-driver restart failed (UPS may not be plugged in)"
systemctl restart nut-server.service  || warn "nut-server restart failed"
systemctl enable nut-driver.service nut-server.service 2>/dev/null
ok "NUT services started and enabled"

# Quick sanity check — give the driver a moment to initialize
sleep 2
if command -v upsc > /dev/null 2>&1; then
    if upsc ups@localhost > /dev/null 2>&1; then
        ok "UPS responding on upsc ups@localhost"
    else
        warn "UPS not responding yet — check USB connection and run: upsc ups@localhost"
    fi
fi

# --- Step 4: Deploy the Flask application ------------------------------------
info "Deploying Flask application to ${APP_DIR}"

mkdir -p "$APP_DIR"

# Sync the repository into the app directory (idempotent)
if [ -d "${REPO_DIR}/app" ]; then
    # Running from the cloned repo — copy files over
    rsync -a --delete \
        --exclude='.git' \
        --exclude='__pycache__' \
        --exclude='.squad' \
        "${REPO_DIR}/" "${APP_DIR}/"
    ok "Application files synced from ${REPO_DIR}"
else
    warn "Source app/ directory not found in ${REPO_DIR} — skipping file sync"
    warn "Clone the repo to ${APP_DIR} manually if needed"
fi

# --- Step 5: Install Python dependencies -------------------------------------
info "Installing Python dependencies"

if [ -f "${APP_DIR}/requirements.txt" ]; then
    pip3 install --quiet --break-system-packages -r "${APP_DIR}/requirements.txt" 2>/dev/null \
        || pip3 install --quiet -r "${APP_DIR}/requirements.txt"
    ok "Python dependencies installed"
else
    warn "No requirements.txt found in ${APP_DIR}"
fi

# --- Step 6: Install and enable the systemd service --------------------------
info "Installing systemd service: ${SERVICE_NAME}"

cp "${SCRIPT_DIR}/ups-dashboard.service" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service" 2>/dev/null
systemctl restart "${SERVICE_NAME}.service"
ok "Service installed and started"

# --- Step 7: Final status -----------------------------------------------------
info "Deployment complete!"

echo ""
echo "  Service status:"
systemctl --no-pager status "${SERVICE_NAME}.service" 2>&1 | head -5 | sed 's/^/    /'
echo ""
echo "  NUT status:"
systemctl --no-pager status nut-server.service 2>&1 | head -3 | sed 's/^/    /'
echo ""

# Detect the Pi's IP for the dashboard URL
PI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
PI_IP="${PI_IP:-<raspberry-pi-ip>}"

echo "  ┌──────────────────────────────────────────────────┐"
echo "  │  UPS Dashboard: http://${PI_IP}:5000             │"
echo "  │  NUT query:     upsc ups@localhost               │"
echo "  │  Service logs:  journalctl -u ${SERVICE_NAME} -f │"
echo "  └──────────────────────────────────────────────────┘"
echo ""
