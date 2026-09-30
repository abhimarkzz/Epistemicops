#!/usr/bin/env bash
# ==============================================================================
# EpistemicOps — Automated Server Setup Script
# Target: Ubuntu 22.04 / 24.04 LTS on Oracle Cloud Infrastructure (Always Free)
# Architecture: Single-VM (2 OCPUs, 12 GB RAM or 1 OCPU, 1 GB RAM)
# Cost: $0 (Always Free Tier)
# ==============================================================================
set -euo pipefail

echo "=========================================================="
echo " Starting EpistemicOps Production Server Deployment"
echo "=========================================================="

if [ "$(id -u)" -ne 0 ]; then
    echo "[ERROR] This setup script must be run as root (or with sudo)."
    exit 1
fi

APP_USER="epistemicops"
APP_DIR="/home/${APP_USER}/epistemicops"

# 1. Update system packages
echo "[1/8] Updating operating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get upgrade -y
apt-get install -y \
    curl \
    git \
    build-essential \
    python3 \
    python3-venv \
    python3-pip \
    nginx \
    ufw \
    tar \
    gzip

# 2. Install Node.js 20 LTS (if node < 20)
echo "[2/8] Verifying Node.js 20+..."
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
    echo "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node.js version: $(node -v), npm version: $(npm -v)"

# 3. Create service user if it doesn't exist
echo "[3/8] Configuring application user (${APP_USER})..."
if ! id "$APP_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$APP_USER"
fi

# Ensure user directory permissions
mkdir -p "$APP_DIR" "/home/${APP_USER}/.hindsight" "/home/${APP_USER}/backups"
chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}"

# 4. Clone or update repository
echo "[4/8] Preparing repository in ${APP_DIR}..."
if [ ! -f "${APP_DIR}/package.json" ]; then
    echo "Please clone the repository into ${APP_DIR} or ensure files are in place."
    echo "Example: git clone https://github.com/abhimarkzz/Epistemicops.git ${APP_DIR}"
fi

# 5. Set up Python virtual environments as the application user
echo "[5/8] Setting up backend and Hindsight Python virtual environments..."
sudo -u "$APP_USER" bash << 'EOF'
set -euo pipefail
cd "$HOME/epistemicops"

# Backend venv
if [ ! -d "backend/.venv" ]; then
    python3 -m venv backend/.venv
fi
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt

# Native Hindsight venv (with ONNX embedding and RRF reranker)
if [ ! -d ".venv-hindsight" ]; then
    python3 -m venv .venv-hindsight
fi
.venv-hindsight/bin/pip install --upgrade pip
.venv-hindsight/bin/pip install 'hindsight-api-slim[local-onnx,embedded-db]'

# Prepare environment file if missing
if [ ! -f "backend/.env" ]; then
    cp .env.example backend/.env
    echo "[!] Created backend/.env template. Remember to insert your GROQ_API_KEY!"
fi
EOF

# 6. Build the frontend production bundle
echo "[6/8] Building frontend production bundle..."
sudo -u "$APP_USER" bash << 'EOF'
set -euo pipefail
cd "$HOME/epistemicops/frontend"
npm ci || npm install
npm run build
EOF

# 7. Configure firewall (UFW)
echo "[7/8] Hardening firewall (only ports 22, 80, 443 permitted)..."
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
# Ensure internal ports are never exposed
ufw deny 8000/tcp comment 'Block FastAPI direct access'
ufw deny 8888/tcp comment 'Block Hindsight API direct access'
ufw deny 9999/tcp comment 'Block Hindsight UI direct access'
ufw --force enable

# 8. Install systemd services and Nginx configuration
echo "[8/8] Installing systemd units and Nginx configuration..."
cp "${APP_DIR}/deploy/systemd/hindsight.service" /etc/systemd/system/
cp "${APP_DIR}/deploy/systemd/epistemicops-backend.service" /etc/systemd/system/

systemctl daemon-reload
systemctl enable hindsight
systemctl enable epistemicops-backend

cp "${APP_DIR}/deploy/nginx/epistemicops.conf" /etc/nginx/sites-available/epistemicops
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/epistemicops /etc/nginx/sites-enabled/epistemicops

nginx -t
systemctl restart nginx

# Setup daily backup cron job
chmod +x "${APP_DIR}/deploy/scripts/backup-hindsight.sh"
(crontab -u "$APP_USER" -l 2>/dev/null | grep -v 'backup-hindsight.sh' || true; echo "0 3 * * * ${APP_DIR}/deploy/scripts/backup-hindsight.sh > /dev/null 2>&1") | crontab -u "$APP_USER" -

echo "=========================================================="
echo " EpistemicOps Server Setup Complete!"
echo " Next Steps:"
echo " 1. Edit /home/${APP_USER}/epistemicops/backend/.env with your GROQ_API_KEY"
echo " 2. Start services: systemctl start hindsight epistemicops-backend"
echo " 3. Verify health: curl http://127.0.0.1:8000/health"
echo " 4. (Optional) Setup HTTPS with certbot: apt-get install -y certbot python3-certbot-nginx && certbot --nginx"
echo "=========================================================="
