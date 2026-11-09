#!/usr/bin/env bash
# Friend's Night — one-time server setup for a fresh Oracle Cloud "Always Free" Ubuntu VM.
#
#   sudo bash setup.sh <friends-night-repo-url> <domain> [email]
#   e.g.
#   sudo bash setup.sh https://github.com/Avijit0104/friends_night.git friendsnight.duckdns.org
#
# Safe to run again: every step checks first and skips what's already done.
set -euo pipefail

REPO="${1:-}"; DOMAIN="${2:-}"; EMAIL="${3:-}"
if [[ -z "$REPO" || -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash setup.sh <friends-night-repo-url> <domain> [email]"; exit 1
fi
if [[ $EUID -ne 0 ]]; then echo "Run it with sudo."; exit 1; fi
RUN_AS="${SUDO_USER:-ubuntu}"
RUN_HOME="$(getent passwd "$RUN_AS" | cut -d: -f6)"
ROOT=/opt/friendsnight
step() { echo; echo "==> $*"; }

step "Updating Ubuntu (a few minutes the first time)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https \
  iptables-persistent unattended-upgrades

step "Turning on automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

step "Opening ports 80 and 443 in the VM's own firewall"
# Oracle's Ubuntu images block everything except SSH in iptables. You ALSO have to open 80/443 in the
# Oracle web console (Security List), see GUIDE.md step 3.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    # must go BEFORE Oracle's "REJECT everything else" rule
    reject_line="$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')"
    if [[ -n "$reject_line" ]]; then
      iptables -I INPUT "$reject_line" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    else
      iptables -A INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    fi
  fi
done
netfilter-persistent save

step "Adding swap space (a safety net if memory ever runs low)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Installing Node.js 22"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

step "Installing pm2 (keeps every game running and restarts it if it crashes)"
command -v pm2 >/dev/null || npm install -g pm2

step "Installing Caddy (web server with automatic free HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

step "Getting the Friend's Night code"
mkdir -p "$ROOT"
chown "$RUN_AS:$RUN_AS" "$ROOT"
if [[ ! -d "$ROOT/app/.git" ]]; then
  sudo -u "$RUN_AS" git clone --depth 1 "$REPO" "$ROOT/app"
fi
cat > "$ROOT/site.env" <<EOF
DOMAIN="$DOMAIN"
BRANCH="main"
EOF
chown "$RUN_AS:$RUN_AS" "$ROOT/site.env"

step "Pointing Caddy at the generated config"
touch "$ROOT/Caddyfile" && chown "$RUN_AS:$RUN_AS" "$ROOT/Caddyfile"
{
  echo "# Friend's Night. The real site list is generated into $ROOT/Caddyfile by sync.js."
  if [[ -n "$EMAIL" ]]; then echo "{"; echo "	email $EMAIL"; echo "}"; fi
  echo "import $ROOT/Caddyfile"
} > /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy

step "Making pm2 start the games after a reboot"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$RUN_AS" --hp "$RUN_HOME" >/dev/null
sudo -u "$RUN_AS" pm2 install pm2-logrotate >/dev/null 2>&1 || true   # keeps game logs from filling the disk

step "Auto-deploy: check GitHub every 2 minutes"
cat > /etc/systemd/system/friendsnight-sync.service <<EOF
[Unit]
Description=Friend's Night: update hub + games from GitHub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$RUN_AS
Environment=FN_ROOT=$ROOT
ExecStart=/usr/bin/node $ROOT/app/server/sync.js
TimeoutStartSec=900
EOF
cat > /etc/systemd/system/friendsnight-sync.timer <<'EOF'
[Unit]
Description=Run Friend's Night sync every 2 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now friendsnight-sync.timer

step "First sync: installing and starting every game (can take a few minutes)"
sudo -u "$RUN_AS" env FN_ROOT="$ROOT" node "$ROOT/app/server/sync.js"
sudo -u "$RUN_AS" pm2 save --force >/dev/null

echo
echo "✅ Done!"
sudo -u "$RUN_AS" pm2 ls
echo
echo "Your addresses:"
grep -E '^[a-z0-9.-]+ \{$' "$ROOT/Caddyfile" | sed -e 's/ {$//' -e 's|^|  https://|' || true
echo
echo "Caddy is getting the free HTTPS certificates now. If an address doesn't open yet, wait a minute and try again."
echo "Logs:  pm2 logs   |   journalctl -u friendsnight-sync -f   |   journalctl -u caddy -f"
