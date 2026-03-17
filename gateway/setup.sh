#!/usr/bin/env bash
# DataCaffe LLM Gateway — one-time setup on your DigitalOcean GPU droplet
# Run as root: bash setup.sh

set -euo pipefail

INSTALL_DIR="/opt/datacaffe-gateway"
ADMIN_TOKEN=$(python3 -c "import secrets; print(secrets.token_hex(32))")

echo "=== DataCaffe LLM Gateway Setup ==="

# 1. Install Caddy
if ! command -v caddy &>/dev/null; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -q && apt-get install -y caddy
    echo "Caddy installed"
fi

# 2. Create install directory
mkdir -p "$INSTALL_DIR"

# 3. Copy gateway files
cp app.py requirements.txt "$INSTALL_DIR/"

# 4. Create venv and install deps
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip -q
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt" -q

# 5. Write .env file
cat > "$INSTALL_DIR/.env" <<EOF
ADMIN_TOKEN=$ADMIN_TOKEN
ALLOWED_MODELS=qwen3.5:27b,devstral:24b,qwen3:14b
OLLAMA_URL=http://127.0.0.1:11434
DB_PATH=$INSTALL_DIR/keys.db
EOF
chmod 600 "$INSTALL_DIR/.env"

# 6. Set ownership
chown -R brewai:brewai "$INSTALL_DIR"

# 7. Install systemd service
cp datacaffe-gateway.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable datacaffe-gateway
systemctl start datacaffe-gateway

# 8. Install Caddyfile (EDIT domain first!)
cp Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Your ADMIN_TOKEN (save this securely!):"
echo "  $ADMIN_TOKEN"
echo ""
echo "IMPORTANT: Edit /etc/caddy/Caddyfile and replace 'llm.yourdomain.com' with your domain"
echo "Then: systemctl reload caddy"
echo ""
echo "Create your first API key:"
echo "  curl -X POST 'http://127.0.0.1:8001/admin/keys?user_name=nitish' \\"
echo "       -H 'X-Admin-Token: $ADMIN_TOKEN'"
echo ""
echo "Check logs: journalctl -u datacaffe-gateway -f"
