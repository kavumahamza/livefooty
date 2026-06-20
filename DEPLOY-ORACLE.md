# Deploying LiveFooty free, 24/7, on an Oracle Cloud "Always Free" VM

Oracle Cloud's **Always Free** tier gives you an ARM VM (up to **4 cores / 24 GB RAM / 200 GB**, no expiry) — the one place you can run this app's full `docker compose` stack (web + poller + Redis + frontend) for free, forever, with no sleeping. This guide takes you from zero to a public URL.

**Time:** ~30–45 min (most of it is the one-time Oracle signup).

> ⚠️ **The #1 Oracle gotcha:** there are **TWO firewalls** between the internet and your app — the **OCI Security List** (cloud side) *and* the **VM's own iptables** (OS side). You must open your port in **both**, or the site will silently time out. The setup script handles the OS side; you open the cloud side in the Console. This guide flags both.

---

## Step 1 — Create the Always-Free VM

1. Sign up at **https://www.oracle.com/cloud/free/** (a credit/debit card is required for identity verification — **Always Free resources are never charged**; to be extra safe you can leave the account as "Always Free" and not upgrade).
2. In the Console: **Compute → Instances → Create Instance**.
3. Configure:
   - **Image:** Canonical **Ubuntu 22.04** (or 24.04).
   - **Shape:** click *Change Shape* → **Ampere (ARM)** → `VM.Standard.A1.Flex`. Set **2 OCPU / 12 GB RAM** (well within Always Free; you can go up to 4/24). Confirm it says **"Always Free-eligible."**
   - **SSH keys:** upload your public key, or let it generate one and **download the private key** (you'll need it to log in).
   - Leave networking as default (it creates a VCN + subnet).
4. **Create.** When it's running, copy the **Public IP address** (you'll use it as `VM_IP` below).

> If ARM capacity is unavailable in your region ("out of host capacity"), try a different Availability Domain, or retry later — it's a common Always-Free hiccup.

---

## Step 2 — Open the port in the OCI Security List (cloud firewall)

1. Console → **Networking → Virtual Cloud Networks** → your VCN → **Security Lists** → *Default Security List*.
2. **Add Ingress Rules**:
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** TCP
   - **Destination Port Range:** `80`
   - Save.
3. (Optional, for HTTPS later) add another rule for port `443`.

---

## Step 3 — SSH into the VM

```bash
chmod 600 /path/to/your-private-key
ssh -i /path/to/your-private-key ubuntu@VM_IP
```

---

## Step 4 — Install Docker + open the OS firewall (one command)

On the VM:

```bash
curl -fsSL https://raw.githubusercontent.com/kavumahamza/livefooty/master/deploy/oracle-setup.sh | bash -s -- 80
```

This installs Docker + the Compose plugin, adds you to the `docker` group, and opens **tcp/80** in the VM's iptables (the OS-side firewall). Then apply the docker group membership:

```bash
newgrp docker        # or just log out and back in
```

---

## Step 5 — Clone and configure

```bash
git clone https://github.com/kavumahamza/livefooty
cd livefooty
cp .env.example .env
nano .env            # edit the values below
```

Set these in `.env` (the important production ones in **bold**):

```ini
# Data source: "mock" works with zero setup; "api_football" for real live data
PROVIDER=api_football
API_FOOTBALL_KEY=your_api_football_key      # from dashboard.api-football.com (see note)
POLL_INTERVAL=60

# --- Production security (REQUIRED on a public VM) ---
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=PASTE_A_LONG_RANDOM_STRING
DJANGO_ALLOWED_HOSTS=VM_IP                   # your VM's public IP (and domain if you add one)

REDIS_URL=redis://redis:6379/0
```

Generate a strong secret key:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(50))'
```

> **Why `DJANGO_ALLOWED_HOSTS=VM_IP` matters:** with `DEBUG=0`, Django validates the `Host` header. nginx forwards the browser's host, so your VM's IP (or domain) **must** be listed here or every request returns **400 Bad Request**. Add a domain later by making it `DJANGO_ALLOWED_HOSTS=VM_IP,yourdomain.com`.

> **Free API tier = 100 requests/day.** Fine to validate; it won't sustain `POLL_INTERVAL=60` all day. For continuous live data, use API-Football **Pro ($19/mo)** and drop `POLL_INTERVAL` to 20. Or keep `PROVIDER=mock` for a free, always-on demo with sample data.

---

## Step 6 — Launch the stack

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

The prod override serves the frontend on **port 80** and sets `restart: always` so everything survives reboots. First build takes a few minutes (it compiles the React app and pulls images — all multi-arch, so ARM is fine).

Check it's healthy:

```bash
docker compose ps
docker compose logs -f poller     # real team names = working; auth/quota errors show here
```

---

## Step 7 — Open it 🎉

Visit **http://VM_IP** in your browser.

(With `PROVIDER=mock` you'll see sample data + initials; with `api_football` and a valid key you'll see real live matches, crests, and the momentum wave.)

---

## Optional — a domain + HTTPS

HTTP-on-an-IP is fine for a demo, but for a real URL with a green padlock:

1. Point a domain's **A record** at `VM_IP` (any registrar; freedns/duckdns work for free subdomains).
2. Add the domain to `DJANGO_ALLOWED_HOSTS` in `.env`.
3. Easiest TLS: put **Caddy** in front (it auto-provisions Let's Encrypt certs). Add a `caddy` service that reverse-proxies to the `frontend` container, open port 443 in both firewalls, and Caddy handles the rest. (Ask and I'll generate the Caddy compose + config.)

---

## Day-2 operations

```bash
# Update to the latest code
cd ~/livefooty && git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build

# Logs / status
docker compose logs -f                # all services
docker compose ps

# Stop / restart
docker compose down
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **Site times out / won't load** | One of the two firewalls isn't open. Confirm the **OCI Security List** ingress rule (Step 2) **and** the OS iptables (`sudo iptables -L INPUT -n --line-numbers` should show ACCEPT for your port). |
| **400 Bad Request** | `DJANGO_ALLOWED_HOSTS` doesn't include the IP/domain you're visiting (with `DEBUG=0`). Add it, then `docker compose ... up -d`. |
| **Empty data / "no live matches"** | With `api_football`: check `docker compose logs poller` for quota/auth errors. With `mock`: it should always have sample data — re-run `docker compose exec poller python manage.py seed_cache`. With either: there may genuinely be no matches live right now. |
| **`docker: permission denied`** | Run `newgrp docker` or log out/in (group membership from Step 4). |
| **ARM build issues** | All base images here are multi-arch; if a future dependency isn't, switch the instance shape to a free x86 micro (lower specs) — but ARM is the recommended free shape. |
| **Reboot lost the stack** | The prod override sets `restart: always`; if you started without it, re-run the Step 6 command. |
