#!/usr/bin/env bash
# BrewAI production deploy script
# Run on your DigitalOcean server as root or with sudo
# Usage: bash deploy.sh

set -euo pipefail

BREWAI_DIR="/opt/brewai"
BREWAI_USER="brewai"

echo "=== BrewAI Production Deploy ==="

# 1. Create system user (if not exists)
if ! id "$BREWAI_USER" &>/dev/null; then
    useradd --system --home-dir "$BREWAI_DIR" --shell /bin/bash "$BREWAI_USER"
    echo "Created user: $BREWAI_USER"
fi

# 2. Install system dependencies (Ubuntu/Debian)
apt-get update -q
apt-get install -y -q \
    python3.11 python3.11-venv python3.11-dev \
    nodejs npm \
    nginx \
    postgresql postgresql-contrib \
    curl git

# 3. Copy project files (assumes you've already cloned/uploaded to /opt/brewai)
chown -R "$BREWAI_USER:$BREWAI_USER" "$BREWAI_DIR"

# 4. Backend — create venv and install deps
echo "--- Installing backend dependencies ---"
sudo -u "$BREWAI_USER" bash -c "
    cd $BREWAI_DIR/backend
    python3.11 -m venv venv
    venv/bin/pip install --upgrade pip -q
    venv/bin/pip install -r requirements.txt -q
"

# 5. Frontend — build Next.js
echo "--- Building frontend ---"
sudo -u "$BREWAI_USER" bash -c "
    cd $BREWAI_DIR/frontend
    npm ci --silent
    npm run build
"

# 6. Install systemd services
echo "--- Installing systemd services ---"
cp "$BREWAI_DIR/deploy/brewai-backend.service" /etc/systemd/system/
cp "$BREWAI_DIR/deploy/brewai-frontend.service" /etc/systemd/system/
systemctl daemon-reload

# 7. Configure nginx
cp "$BREWAI_DIR/deploy/nginx.conf" /etc/nginx/sites-available/brewai
ln -sf /etc/nginx/sites-available/brewai /etc/nginx/sites-enabled/brewai
rm -f /etc/nginx/sites-enabled/default  # remove default site
nginx -t && systemctl reload nginx

# 8. Enable + start services
systemctl enable brewai-backend brewai-frontend
systemctl restart brewai-backend brewai-frontend

echo ""
echo "=== Deploy complete! ==="
echo ""
echo "Next steps:"
echo "  1. Edit /opt/brewai/.env — set POSTGRES_PASSWORD, SECRET_KEY, OLLAMA_HOST, etc."
echo "  2. Replace YOUR_DOMAIN_OR_IP in /etc/nginx/sites-available/brewai"
echo "  3. Get SSL cert: certbot --nginx -d your-domain.com"
echo "  4. Check logs:"
echo "       journalctl -u brewai-backend -f"
echo "       journalctl -u brewai-frontend -f"
echo ""
echo "  Status check:"
echo "       systemctl status brewai-backend brewai-frontend nginx"
