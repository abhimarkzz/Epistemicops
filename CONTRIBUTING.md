# Contributing to EpistemicOps

Thank you for your interest in contributing to EpistemicOps! We welcome contributions to improve our SRE investigation workflows, memory integration, evaluator coverage, and documentation.

---

## 1. Development Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- Free Groq API key ([console.groq.com](https://console.groq.com))

### Local Environment Setup
```bash
# 1. Clone repository
git clone https://github.com/abhimarkzz/Epistemops.git
cd Epistemops

# 2. Configure backend environment
cp .env.example backend/.env
# Edit backend/.env and add your GROQ_API_KEY

# 3. Setup Python backend virtual environment
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# 4. Setup frontend dependencies
cd frontend
npm ci
cd ..
```

---

## 2. Running Services

```bash
# Terminal 1: Native Hindsight Memory Engine
bash scripts/hindsight-native.sh

# Terminal 2: FastAPI Backend Server
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 3: Frontend Development Server
cd frontend
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 3. Running Tests & Quality Verification

Before submitting any code changes, ensure all automated tests and typechecks pass:

```bash
# Run backend pytest suite (152 tests)
cd backend
source .venv/bin/activate
pytest tests/ -v
cd ..

# Run frontend test suite (9 tests)
npm test --prefix frontend -- --run

# Run frontend TypeScript check & production bundle build
npm run build --prefix frontend
```

---

## 4. Branching and Pull Request Expectations

- **Branch Naming:** Use clear branch names such as `fix/investigate-timeout`, `feat/prom-connector`, or `docs/deployment-guide`.
- **Atomic Commits:** Keep commits focused with descriptive commit messages explaining *why* changes were made.
- **Code Quality:**
  - Write comments explaining **why**, not merely repeating what the code syntax does.
  - Preserve ground-truth isolation: never allow ground-truth scoring keys to leak into agent tools or public API responses.
  - Maintain strictly read-only tool boundaries: do not introduce mutating shell or cluster operations.
- **Pull Request Description:** Use the provided [Pull Request Template](.github/pull_request_template.md) to document changes, testing evidence, and any documentation updates.

---

## 5. Security Warning Regarding Secrets

- **NEVER** commit API keys (`GROQ_API_KEY`, `GEMINI_API_KEY`), database connection strings (`HINDSIGHT_API_DATABASE_URL`), or passwords to Git.
- Always use `backend/.env` for secrets. Verify that `git status` shows zero tracked `.env` files before committing.
