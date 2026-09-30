# EpistemicOps — $0 No-Credit-Card Public Evaluation Deployment Guide
## Architecture: Render Free Web Service + Neon Serverless PostgreSQL

**Deployment Type:** **$0 Public Evaluation / Hackathon Demo Deployment**  
*(Note: Render Free web services spin down after 15 minutes of idle traffic; first request after idle takes ~45–60s to wake up)*  
**Target Audience:** Beginners & Developers without a credit card  
**Selected Hosting Stack:** **Render (Free Web Service)** + **Neon (Serverless PostgreSQL with pgvector)**  
**Total Recurring Cost:** **$0.00 / Free Forever**  
**Credit / Debit Card Required:** **NO (Neither service asks for payment info)**

---

## 1. Chosen Platform & Architecture

```
                  Public Internet (User Browser)
                               │
               HTTPS (https://epistemicops.onrender.com)
                               ▼
        ┌──────────────────────────────────────────────┐
        │        Render Free Web Service (Docker)      │
        │        • Free CPU (0.1 to 0.5 vCPU)          │
        │        • Free 512 MB RAM Ceiling             │
        │        • Port 8000                           │
        │                                              │
        │   ┌──────────────────────────────────────┐   │
        │   │ FastAPI Web Application (:8000)      │   │
        │   │  • Serves React 18 + Three.js UI     │   │
        │   │  • Streams SSE Investigation Events  │   │
        │   │  • Runs LangGraph SRE Agent (~100 MB)│   │
        │   └───────────────┬──────────────────────┘   │
        │                   │                          │
        │   ┌───────────────▼──────────────────────┐   │
        │   │ Native Hindsight Daemon (:8888)      │   │
        │   │  • Local ONNX Embeddings             │   │
        │   │    (intfloat/multilingual-e5-small)  │   │
        │   │  • RRF Passthrough Reranker (0 MB)   │   │
        │   │  • Native memory vector logic        │   │
        │   │  • No external embedding API required│   │
        │   └───────────────┬──────────────────────┘   │
        └───────────────────┼──────────────────────────┘
                            │ Encrypted TLS (Port 5432)
                            ▼
        ┌──────────────────────────────────────────────┐
        │     Neon Serverless PostgreSQL (Free)        │
        │     • pgvector extension enabled             │
        │     • 0.5 GB permanent storage               │
        │     • Retains all memories across restarts   │
        └──────────────────────────────────────────────┘
```

---

## 2. Why This Stack Was Selected Over All Others

| Provider | Credit Card Required? | Free RAM | Free Storage Persistence | Sleep / Cold Start Behavior | Verdict |
|---|---|---|---|---|---|
| **Render (ONNX + RRF) + Neon** | **NO** | 512 MB | **Persistent (Neon pgvector)** | Spins down after 15 min; cold start ~50s | **SELECTED (Verified $0 No-Card, Zero API Dependency)** |
| **Render (Full Neural Reranker)**| **NO** | 512 MB | Persistent (Neon pgvector) | Exceeds memory ceiling with FlashRank/cross-encoders | **DISQUALIFIED (Triggers OOM kill on 512 MB)** |
| **GitHub Codespaces** | **NO** | 8 GB | Persistent per environment | Shuts down after 30 min idle | **VIABLE ALTERNATIVE (Full Local ONNX, 8 GB RAM)** |
| **Hugging Face Spaces** | **YES** (for compute SDKs) | 16 GB | Ephemeral unless paid disk | N/A | **DISQUALIFIED (Docker requires paid plan)** |
| **Oracle Cloud** | **YES** (Card required for signup) | 12 GB (A1) | Persistent 50 GB | No sleep | Disqualified (Card mandatory for signup) |
| **Fly.io** | **YES** | Pay-as-you-go | Persistent volumes are paid | Fast wake | Disqualified (Card mandatory) |
| **Railway** | **YES** (Paid only) | None | Paid only | None | Disqualified (No free tier) |
| **Koyeb** | Often prompts for card | 512 MB | Ephemeral on free tier | Sleeps on idle | Disqualified (Card verification triggers) |
| **Vercel / Netlify** | **NO** | N/A | Serverless only (10-15s timeout) | Instant | Disqualified (SSE investigations timeout) |

### Key Reasons:
1. **Zero Card Verification:** Both Render and Neon allow instant account creation with just a GitHub account. Neither asks for payment information.
2. **True Memory Persistence:** Render's local container disk is ephemeral (wiped on restart). By connecting Hindsight to Neon PostgreSQL (`HINDSIGHT_API_DATABASE_URL`), all incident memories, mental models, and runbooks **survive restarts, sleeps, and code updates permanently**.
3. **No External Embedding API Dependency:** By using local ONNX `multilingual-e5-small` embeddings and the `rrf` passthrough cross-encoder, Hindsight requires zero external embedding API keys and is immune to 403 project-denied errors!
4. **Permanent Free Database:** Unlike Render's internal PostgreSQL which expires after 30 days, Neon's free tier has **no 30-day expiration window**.
5. **Reliable SSE Streaming:** Render natively supports unbuffered HTTP response streaming for Server-Sent Events (SSE).

---

## 3. Official Source Links

- [Render Free Web Service Documentation](https://render.com/docs/free)
- [Render Docker Deployments](https://render.com/docs/docker)
- [Neon Serverless PostgreSQL Documentation](https://neon.tech/docs/introduction)
- [Neon Free Tier Pricing & Limits](https://neon.tech/pricing)
- [Vectorize Hindsight External PostgreSQL Documentation](https://docs.vectorize.io/)

---

## 4. Exact Step-by-Step Deployment Procedure (Beginner-Friendly)

### Step 1: Create Your Free Database on Neon (Takes 2 Minutes)
1. Go to [https://neon.tech/](https://neon.tech/) and click **Sign Up** (use your GitHub account).
2. Click **Create Project**.
   - Name: `epistemicops-memory`
   - Region: Pick the region closest to your target audience (e.g., `Singapore` or `Frankfurt`).
3. Click the **SQL Editor** tab in Neon and run this command:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. On your project dashboard, find the **Connection Details** box.
5. Copy the connection string. It looks like:
   `postgresql://neondb_owner:npg_xyz@ep-xyz.neon.tech/neondb?sslmode=require`

---

### Step 2: Push Repository to GitHub
Ensure all latest files (`Dockerfile`, `start.sh`, `backend/`, `frontend/`, `data/`) are pushed to your GitHub repository:
```bash
git add Dockerfile start.sh backend/ README.md
git commit -m "Configure no-card Docker deployment for Render"
git push origin main
```

---

### Step 3: Create Your Free Web Service on Render (Takes 2 Minutes)
1. Go to [https://render.com/](https://render.com/) and click **Sign Up** using your GitHub account (no card requested).
2. Click **New +** in the top right → Select **Web Service**.
3. Select **Build and deploy from a Git repository** → Choose your `Epistemicops` repository.
4. Fill in the service configuration:
   - **Name:** `epistemicops`
   - **Region:** Pick the region closest to your Neon database (e.g., `Frankfurt` or `Singapore`).
   - **Branch:** `main`
   - **Language / Environment:** Select **Docker**.
   - **Instance Type:** Select **Free** (0.5 CPU, 512 MB RAM).
5. Scroll down to **Environment Variables** and add:
   - `PORT` = `8000`
   - `GROQ_API_KEY` = `gsk_...` (Your free Groq key from [console.groq.com](https://console.groq.com))
   - `HINDSIGHT_API_EMBEDDINGS_PROVIDER` = `onnx`
   - `HINDSIGHT_API_EMBEDDINGS_ONNX_MODEL_ID` = `intfloat/multilingual-e5-small`
   - `HINDSIGHT_API_EMBEDDINGS_ONNX_FILE` = `onnx/model.onnx`
   - `HINDSIGHT_API_EMBEDDINGS_ONNX_DIMENSIONS` = `384`
   - `HINDSIGHT_API_EMBEDDINGS_ONNX_BATCH_SIZE` = `8`
   - `HINDSIGHT_API_EMBEDDINGS_ONNX_CPU_MEM_ARENA` = `false`
   - `HINDSIGHT_API_RERANKER_PROVIDER` = `rrf`
   - `HINDSIGHT_API_DATABASE_URL` = *(Paste the Neon connection string from Step 1)*
   - `ALLOW_PUBLIC_RESET` = `false`
   - `ADMIN_TOKEN` = `any_secret_password_you_choose`
6. Click **Create Web Service**.

Render will pull your Dockerfile, build the static React bundle, install the native Hindsight vector engine, and deploy. In about 3–4 minutes, your live public URL will be active at:
`https://epistemicops.onrender.com`

---

## 5. Persistence Setup & Verification

- **How it works:** When Hindsight starts, `start.sh` automatically passes `HINDSIGHT_API_DATABASE_URL` to the Hindsight engine.
- **Verification Test:**
  1. Open your live Render URL.
  2. Select incident `inc-003`, click **Live**, and run the investigation.
  3. Once diagnosis completes, approve the postmortem memory in the Runbook panel.
  4. In the Render Dashboard, click **Manual Deploy → Clear build cache & deploy** to deliberately wipe the local container.
  5. Reload the URL: Notice that the **Runbook panel** and **Prior Memories** are **100% preserved** from Neon!

---

## 6. Free-Tier Limitations & Honest Expectations

1. **Spin-down after Inactivity:** Render's free web service spins down after **15 minutes** of idle traffic.
2. **Cold Start Latency:** When opening the URL after it has spun down, the first request takes **45 to 60 seconds** to wake up. Once awake, all interactions and investigation streaming happen in real-time.
3. **RAM Ceiling & Empirical Measurements:** The instance has 512 MB of RAM. 
   - When running full local ONNX (`multilingual-e5-small`) + FlashRank reranker, memory peaks at **673.4 MB RSS**, which **exceeds Render's 512 MB hard ceiling and triggers an OOM kill**.
   - Under **Local ONNX + RRF Mode** (`HINDSIGHT_API_EMBEDDINGS_PROVIDER=onnx`, `HINDSIGHT_API_RERANKER_PROVIDER=rrf`), the system runs without any local neural cross-encoder and without PyTorch, requiring 0 external embedding API calls while remaining within container limits.
   - The concurrency semaphore (`MAX_CONCURRENT_INVESTIGATIONS=2`) prevents traffic surges from exhausting resources.
4. **Database Quota:** Neon provides 0.5 GB of free vector storage. EpistemicOps postmortems use ~1 KB per incident, which accommodates over 50,000 incident postmortems without cost.
5. **No 30-Day Limit:** Because we use Neon for PostgreSQL instead of Render's internal database, your data does not expire after 30 days.

---

## 7. Rollback Procedure

If a deployment has issues:
1. In the Render Dashboard, click **Deploys**.
2. Find the previous successful build and click **Rollback to this deploy**.
3. Because all memories are safely stored in Neon, no incident memory or runbook data is lost during code rollbacks!
