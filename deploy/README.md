# EpistemicOps — Production Deployment Guide ($0 Cost)

This directory contains configuration files and automation scripts to deploy **EpistemicOps** as a publicly accessible, production-ready web application on an **Oracle Cloud Infrastructure (OCI) Always Free VM** (or any Ubuntu 22.04 / 24.04 LTS instance).

---

## 1. Directory Structure

```
deploy/
├── README.md                          # This deployment guide
├── setup-server.sh                    # Automated server provisioning script
├── systemd/
│   ├── hindsight.service              # Systemd unit for Native Hindsight vector memory
│   └── epistemicops-backend.service   # Systemd unit for FastAPI backend
├── nginx/
│   └── epistemicops.conf              # Reverse proxy with SSE streaming & security headers
├── caddy/
│   └── Caddyfile                      # Alternative single-binary proxy with auto Let's Encrypt HTTPS
└── scripts/
    └── backup-hindsight.sh            # Automated pg0 memory snapshot backup script
```

---

## 2. Architecture Map & Port Isolation

```
Internet (User Browser)
        │
    HTTPS (443) / HTTP (80)
        ▼
   [Reverse Proxy: Nginx / Caddy]
   ├── /                     ───>  /frontend/dist (Static HTML, JS, CSS)
   ├── /health               ───>  http://127.0.0.1:8000/health
   ├── /api/investigate/*    ───>  http://127.0.0.1:8000/api/investigate/* (SSE unbuffered)
   └── /api/*                ───>  http://127.0.0.1:8000/api/*
                                        │
                                        ▼
                             [FastAPI Backend :8000]
                             ├── LangGraph Agent
                             ├── Groq API (openai/gpt-oss-120b)
                             └── Hindsight Client
                                        │
                                        ▼
                             [Native Hindsight :8888]
                             └── Embedded pg0 DB (~/.hindsight/data)
```

**Port Security Rules:**
- **Publicly Exposed:** Port 22 (SSH), Port 80 (HTTP), Port 443 (HTTPS).
- **Private & Internal (Blocked by UFW):**
  - `127.0.0.1:8000` (FastAPI)
  - `127.0.0.1:8888` (Hindsight REST API)
  - `127.0.0.1:9999` (Hindsight Web UI)

---

## 3. Fast Deployment (Ubuntu 22.04 / 24.04)

### Step 1: Provision Oracle Always Free VM
1. Log into [Oracle Cloud Console](https://cloud.oracle.com/).
2. Navigate to **Compute → Instances → Create Instance**.
3. Shape: Select **Ampere A1 Flex** (Always Free eligible: 2 OCPUs, 12 GB RAM) or **VM.Standard.E2.1.Micro** (1 OCPU, 1 GB RAM).
4. Image: **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS**.
5. Networking: Assign a public IPv4 address.
6. SSH Keys: Upload your public SSH key (`id_ed25519.pub`).
7. In the **Virtual Cloud Network (VCN) Ingress Rules**, ensure ports **22, 80, and 443** are open from `0.0.0.0/0`.

### Step 2: Clone and Run Server Setup
SSH into your Oracle VM:
```bash
ssh ubuntu@<YOUR_VM_PUBLIC_IP>
```

Clone the repository and execute the setup script:
```bash
# Clone repository
git clone https://github.com/abhimarkzz/Epistemicops.git /home/epistemicops/epistemicops

# Run automated setup script as root
cd /home/epistemicops/epistemicops
sudo bash deploy/setup-server.sh
```

### Step 3: Configure Environment Variables
Edit `/home/epistemicops/epistemicops/backend/.env`:
```bash
sudo nano /home/epistemicops/epistemicops/backend/.env
```
Fill in your Groq API key:
```ini
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b

# Security settings for public demo
ALLOW_PUBLIC_RESET=false
ADMIN_TOKEN=your_secure_admin_token_here
MAX_CONCURRENT_INVESTIGATIONS=2
```

### Step 4: Start Services
```bash
sudo systemctl start hindsight
sudo systemctl start epistemicops-backend
```

Verify service status:
```bash
sudo systemctl status hindsight
sudo systemctl status epistemicops-backend
```

Verify backend health:
```bash
curl http://127.0.0.1:8000/health
```
Expected output:
```json
{"status":"ok","service":"epistemicops-backend","services":{"llm":{"provider":"groq","status":"ok",...},"hindsight":{"status":"ok",...}}}
```

---

## 4. Setting Up Free HTTPS with Let's Encrypt

If you point a domain (e.g. `epistemicops.yourdomain.com`) to your VM's public IP:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d epistemicops.yourdomain.com
```
Certbot will automatically obtain a free TLS certificate, configure HTTPS redirects, and enable automated renewal!

---

## 5. Persistence & Backups

Memory state is stored in the embedded pg0 database at `/home/epistemicops/.hindsight/data`.
A daily snapshot is automatically created at 03:00 AM by `deploy/scripts/backup-hindsight.sh` and saved to `/home/epistemicops/backups/hindsight/`.

To trigger a manual backup:
```bash
sudo -u epistemicops bash /home/epistemicops/epistemicops/deploy/scripts/backup-hindsight.sh
```

---

## 6. Service Management & Troubleshooting

| Action | Command |
|---|---|
| Restart all services | `sudo systemctl restart hindsight epistemicops-backend nginx` |
| View backend logs | `sudo journalctl -u epistemicops-backend -f` |
| View Hindsight logs | `sudo journalctl -u hindsight -f` |
| View Nginx access logs | `sudo tail -f /var/log/nginx/access.log` |
| View Nginx error logs | `sudo tail -f /var/log/nginx/error.log` |
