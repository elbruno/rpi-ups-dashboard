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

DISABLED_APT_BACKUPS=()

cleanup_apt_sources() {
    if [ "${#DISABLED_APT_BACKUPS[@]}" -eq 0 ]; then
        return 0
    fi

    info "Restoring temporarily disabled APT repositories"
    for backup_file in "${DISABLED_APT_BACKUPS[@]}"; do
        target_file="${backup_file%.ups-installer.bak}"
        if [ -f "$backup_file" ]; then
            mv -f "$backup_file" "$target_file"
            ok "Restored ${target_file}"
        fi
    done
}

disable_apt_sources_for_host() {
    host="$1"
    host_regex="${host//./\\.}"
    changed=false

    for source_file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
        [ -f "$source_file" ] || continue

        if grep -Eq "^[[:space:]]*deb(-src)?[[:space:]].*${host_regex}" "$source_file"; then
            backup_file="${source_file}.ups-installer.bak"
            if [ ! -f "$backup_file" ]; then
                cp "$source_file" "$backup_file"
                DISABLED_APT_BACKUPS+=("$backup_file")
            fi

            sed -i -E "/^[[:space:]]*#/! s|^([[:space:]]*deb(-src)?[[:space:]].*${host_regex}.*)$|# disabled-by-ups-installer \\1|" "$source_file"
            changed=true
        fi
    done

    if [ "$changed" = true ]; then
        return 0
    fi
    return 1
}

resilient_apt_update() {
    if apt-get update -qq; then
        ok "Package indexes refreshed"
        return 0
    fi

    warn "apt-get update failed (often caused by a broken third-party repo). Retrying with temporary repo isolation."

    update_output="$(apt-get update 2>&1 || true)"
    echo "$update_output"

    failed_hosts="$(printf "%s\n" "$update_output" \
        | sed -n "s/.*repository '\\(https\\?:\\/\\/[^ ]*\\).*/\\1/p" \
        | awk -F/ '{print $3}' \
        | sort -u)"

    if [ -z "$failed_hosts" ]; then
        fail "Unable to detect failed repository host from apt output. Please fix apt sources and re-run."
    fi

    disabled_any=false
    while IFS= read -r host; do
        [ -n "$host" ] || continue
        if disable_apt_sources_for_host "$host"; then
            warn "Temporarily disabled APT source entries for ${host}"
            disabled_any=true
        fi
    done <<< "$failed_hosts"

    if [ "$disabled_any" = false ]; then
        fail "No matching APT source files found for failed hosts: $failed_hosts"
    fi

    apt-get update -qq || fail "apt-get update still failing after isolating third-party repositories"
    ok "Package indexes refreshed after temporarily disabling failed third-party repos"
}

systemd_unit_exists() {
    unit_name="$1"
    systemctl list-unit-files "$unit_name" --no-legend 2>/dev/null | grep -q "^${unit_name}"
}

restart_and_enable_if_present() {
    unit_name="$1"
    label="$2"

    if systemd_unit_exists "$unit_name"; then
        systemctl restart "$unit_name" || warn "${label} restart failed"
        systemctl enable "$unit_name" 2>/dev/null || warn "${label} enable failed"
    else
        warn "${label} not found on this OS (${unit_name})"
    fi
}

apply_nut_usb_permissions() {
    local_rule_src="${SCRIPT_DIR}/99-ups-dashboard-nut-usb.rules"
    local_rule_dst="/etc/udev/rules.d/99-ups-dashboard-nut-usb.rules"

    if [ -f "$local_rule_src" ]; then
        cp "$local_rule_src" "$local_rule_dst"
        chmod 644 "$local_rule_dst"
        ok "Installed local NUT USB udev rule"
    else
        warn "Local udev rule template missing: ${local_rule_src}"
    fi

    if command -v udevadm > /dev/null 2>&1; then
        udevadm control --reload-rules
        # Re-apply permissions for already-connected CyberPower USB devices.
        udevadm trigger --subsystem-match=usb --attr-match=idVendor=0764 || true
        ok "Reloaded udev rules for USB UPS devices"
    else
        warn "udevadm not found — cannot reload USB permission rules automatically"
    fi
}

trap cleanup_apt_sources EXIT

# --- Pre-flight checks -------------------------------------------------------
info "Checking prerequisites"

if [ "$(id -u)" -ne 0 ]; then
    fail "This script must be run as root. Use: sudo bash deploy/install.sh"
fi
ok "Running as root"

# --- Step 1: Install system packages -----------------------------------------
info "Installing system packages (NUT, Python3)"

resilient_apt_update
apt-get install -y -qq nut nut-client nut-server python3 python3-pip rsync > /dev/null 2>&1
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

apply_nut_usb_permissions

# --- Step 3: Start NUT services ----------------------------------------------
info "Starting NUT services"

systemctl daemon-reload
restart_and_enable_if_present "nut-driver.service" "nut-driver"
restart_and_enable_if_present "nut-driver-enumerator.service" "nut-driver-enumerator"
restart_and_enable_if_present "nut-server.service" "nut-server"
restart_and_enable_if_present "nut-monitor.service" "nut-monitor"
ok "NUT services processed"

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
