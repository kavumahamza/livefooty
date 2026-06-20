#!/usr/bin/env bash
#
# LiveFooty — Oracle Cloud "Always Free" VM setup (Ubuntu 22.04/24.04, ARM or x86).
#
# Idempotent: installs Docker Engine + Compose plugin, opens the host firewall
# for the chosen HTTP port, and adds you to the docker group.
#
# Usage (on the VM, as the default 'ubuntu' user):
#   curl -fsSL https://raw.githubusercontent.com/kavumahamza/livefooty/master/deploy/oracle-setup.sh | bash -s -- 80
#   # or, after cloning the repo:
#   bash deploy/oracle-setup.sh 80
#
# Arg 1 = the host port to open (default 80). Use 8080 if you keep the default mapping.
#
set -euo pipefail

PORT="${1:-80}"

echo "==> LiveFooty Oracle setup — opening port ${PORT}, installing Docker"

# ---------------------------------------------------------------------------
# 1. Install Docker Engine + Compose plugin (official convenience script)
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh
else
  echo "==> Docker already installed: $(docker --version)"
fi

# Compose plugin (get.docker.com installs it; verify)
if ! docker compose version >/dev/null 2>&1; then
  echo "==> Installing docker compose plugin..."
  sudo apt-get update -y
  sudo apt-get install -y docker-compose-plugin
fi

# Let the current user run docker without sudo (takes effect on next login)
if ! groups "$USER" | grep -q '\bdocker\b'; then
  echo "==> Adding $USER to the docker group (re-login or 'newgrp docker' to apply)"
  sudo usermod -aG docker "$USER"
fi

# ---------------------------------------------------------------------------
# 2. Open the HOST firewall (Oracle's Ubuntu images block ports via iptables).
#    NOTE: this is only ONE of the two firewall layers — you ALSO must add an
#    ingress rule in the OCI Console (VCN > Security List). See DEPLOY-ORACLE.md.
# ---------------------------------------------------------------------------
echo "==> Opening host firewall for tcp/${PORT}"
# Insert an ACCEPT rule before the default REJECT in the INPUT chain.
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "${PORT}" -j ACCEPT || \
  sudo iptables -I INPUT -p tcp --dport "${PORT}" -j ACCEPT
# Persist iptables rules across reboots
sudo apt-get install -y netfilter-persistent iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save >/dev/null 2>&1 || sudo sh -c 'iptables-save > /etc/iptables/rules.v4' || true

echo ""
echo "============================================================"
echo " Docker ready. Host firewall opened for tcp/${PORT}."
echo ""
echo " STILL REQUIRED (one-time, in the Oracle Cloud Console):"
echo "   VCN > Security List > Add Ingress Rule:"
echo "     Source 0.0.0.0/0, IP Protocol TCP, Dest port ${PORT}"
echo ""
echo " Next:"
echo "   1) log out & back in (so 'docker' works without sudo), or run: newgrp docker"
echo "   2) git clone https://github.com/kavumahamza/livefooty && cd livefooty"
echo "   3) cp .env.example .env   # then edit it (see DEPLOY-ORACLE.md)"
echo "   4) docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build"
echo "   5) open http://<your-vm-public-ip>:${PORT}"
echo "============================================================"
