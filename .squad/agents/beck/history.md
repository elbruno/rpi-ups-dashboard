# Project Context

- **Owner:** Bruno Capuano
- **Project:** rpi-ups-dashboard — Real-time UPS monitoring web app for Raspberry Pi + CyberPower UPS via NUT
- **Stack:** Python (backend API), HTML/CSS/JS (frontend dashboard), NUT (Network UPS Tools), Raspberry Pi
- **Architecture:** UPS → USB → Raspberry Pi → NUT → Backend API (GET /api/ups) → Web App
- **Created:** 2026-04-19

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-19 — Initial Deployment Files Created

**Created:** Full `deploy/` directory with 6 files:
- `ups.conf` — NUT UPS device config for CyberPower (usbhid-ups driver, vendorid 0764)
- `upsd.conf` — NUT daemon listens on localhost:3493 only
- `upsd.users` — NUT admin user for upsmon master
- `nut.conf` — Standalone mode (single Pi manages UPS directly)
- `ups-dashboard.service` — systemd unit: runs Flask app as www-data, restarts on failure, hardened with ProtectSystem/NoNewPrivileges
- `install.sh` — Idempotent deployment script: installs NUT + Python, configures UPS, deploys app to /opt/rpi-ups-dashboard, enables services

**Key decisions:**
- Used `www-data` user (not `pi`) for the Flask service — better security, no login shell
- NUT listens only on 127.0.0.1 — Flask app is local, no need to expose port 3493
- `install.sh` backs up existing NUT configs on first run, uses rsync for idempotent app deployment
- systemd service includes `ProtectSystem=strict` and `NoNewPrivileges=true` for hardening
- `RestartSec=5` with `StartLimitBurst=5` prevents restart storms at 3 AM
