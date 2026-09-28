"""
Initialize EpistemicOps memory structures in a running Hindsight instance.

Creates (idempotently):
  • Memory bank  : epistemic-sre
  • Mental Model : Microservice Resolution Runbook  (id: microservice-resolution-runbook)

Run from the project root after `docker compose up -d`:

    python scripts/init_hindsight.py

The script retries the Hindsight readiness probe for up to 60 seconds before
giving up, so it is safe to run immediately after `docker compose up`.
"""

import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load backend .env so HINDSIGHT_* vars are available
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

import os

HINDSIGHT_BASE = os.getenv("HINDSIGHT_BASE_URL", "http://127.0.0.1:8888")
BANK_ID = os.getenv("HINDSIGHT_BANK_ID", "epistemic-sre")
MODEL_ID = os.getenv("HINDSIGHT_MENTAL_MODEL_ID", "microservice-resolution-runbook")

HEADERS = {"Content-Type": "application/json"}


# ── readiness ────────────────────────────────────────────────────────────────


def wait_for_hindsight(timeout: int = 60) -> None:
    url = f"{HINDSIGHT_BASE}/health/live"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = httpx.get(url, timeout=3.0)
            if r.is_success:
                print(f"  Hindsight is ready ({r.status_code})")
                return
        except Exception:
            pass
        remaining = int(deadline - time.time())
        print(f"  Waiting for Hindsight at {url} … ({remaining}s left)", end="\r")
        time.sleep(2)
    print()
    print(f"ERROR: Hindsight did not become ready within {timeout}s.")
    print(f"  Check: docker compose ps")
    print(f"  Logs:  docker compose logs hindsight")
    sys.exit(1)


# ── bank ─────────────────────────────────────────────────────────────────────


def create_bank(client: httpx.Client) -> None:
    url = f"{HINDSIGHT_BASE}/v1/default/banks/{BANK_ID}"
    payload = {
        "reflect_mission": (
            "You are an SRE knowledge base. Use retained postmortems to answer "
            "questions about infrastructure incidents, root causes, and resolutions."
        ),
        "retain_mission": (
            "Extract concise, structured facts about the incident: affected service, "
            "root cause, contributing factors, resolution steps, and lessons learned."
        ),
        "retain_extraction_mode": "concise",
        "enable_observations": True,
        "observations_mission": (
            "Synthesise patterns across incidents. Identify recurring failure modes, "
            "common root causes, and effective resolution strategies for microservices."
        ),
        "enable_text_search": True,
        "enable_temporal_retrieval": True,
        "enable_graph_retrieval": True,
        "enable_reranking": False,
    }
    r = client.put(url, json=payload, headers=HEADERS)
    if r.status_code in (200, 201):
        print(f"  Bank '{BANK_ID}' created / updated.")
    else:
        print(f"ERROR: Failed to create bank '{BANK_ID}': {r.status_code} {r.text}")
        sys.exit(1)


# ── mental model ──────────────────────────────────────────────────────────────


def _update_env_model_id(assigned_id: str) -> None:
    """Rewrite HINDSIGHT_MENTAL_MODEL_ID in backend/.env to the server-assigned id."""
    env_path = Path(__file__).parent.parent / "backend" / ".env"
    try:
        text = env_path.read_text()
        new_text = "\n".join(
            f"HINDSIGHT_MENTAL_MODEL_ID={assigned_id}"
            if line.startswith("HINDSIGHT_MENTAL_MODEL_ID=")
            else line
            for line in text.splitlines()
        ) + "\n"
        env_path.write_text(new_text)
        print(f"  Updated backend/.env → HINDSIGHT_MENTAL_MODEL_ID={assigned_id}")
    except Exception as exc:
        print(
            f"  WARNING: Could not auto-update backend/.env: {exc}\n"
            f"  Set manually: HINDSIGHT_MENTAL_MODEL_ID={assigned_id}"
        )


def _find_existing_model(client: httpx.Client) -> str | None:
    """Return model id if 'Microservice Resolution Runbook' already exists."""
    url = f"{HINDSIGHT_BASE}/v1/default/banks/{BANK_ID}/mental-models"
    try:
        r = client.get(url, timeout=5.0)
        if r.is_success:
            for model in r.json().get("items", []):
                if model.get("id") == MODEL_ID or "Resolution Runbook" in model.get("name", ""):
                    return model["id"]
    except Exception:
        pass
    return None


def create_mental_model(client: httpx.Client) -> None:
    existing_id = _find_existing_model(client)
    if existing_id:
        print(f"  Mental Model already exists (id={existing_id}). Skipping creation.")
        # Reconcile backend/.env if it still points at a different (e.g. placeholder) id,
        # so the backend queries the id Hindsight actually assigned.
        if existing_id != MODEL_ID:
            _update_env_model_id(existing_id)
        return

    # Try PUT first (upsert with explicit id); fall back to POST if not supported.
    put_url = f"{HINDSIGHT_BASE}/v1/default/banks/{BANK_ID}/mental-models/{MODEL_ID}"
    post_url = f"{HINDSIGHT_BASE}/v1/default/banks/{BANK_ID}/mental-models"
    payload = {
        "name": "Microservice Resolution Runbook",
        "description": (
            "Evolving SRE runbook derived from resolved incident postmortems. "
            "Records recurring failure patterns, root-cause signatures, and "
            "proven remediation playbooks for microservice infrastructure."
        ),
        "source_query": (
            "microservice incident root cause diagnosis resolution steps "
            "failure pattern remediation SRE postmortem"
        ),
        "tags": ["sre", "incident", "runbook", "microservices"],
    }

    # Attempt PUT (upsert)
    r = client.put(put_url, json=payload, headers=HEADERS)
    if r.status_code in (200, 201):
        print(f"  Mental Model '{MODEL_ID}' created via PUT.")
        return

    # Fall back to POST
    if r.status_code == 405:
        r = client.post(post_url, json=payload, headers=HEADERS)
        if r.status_code in (200, 201):
            assigned_id = r.json().get("mental_model_id", "<unknown>")
            print(f"  Mental Model created via POST. Assigned id: {assigned_id}")
            if assigned_id != MODEL_ID and assigned_id != "<unknown>":
                _update_env_model_id(assigned_id)
            return

    print(f"ERROR: Failed to create Mental Model: {r.status_code} {r.text}")
    sys.exit(1)


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    print(f"Connecting to Hindsight at {HINDSIGHT_BASE} …")
    wait_for_hindsight()

    with httpx.Client(timeout=10.0) as client:
        print(f"Creating memory bank '{BANK_ID}' …")
        create_bank(client)

        print(f"Creating Mental Model '{MODEL_ID}' …")
        create_mental_model(client)

    # Re-read MODEL_ID in case _update_env_model_id wrote a new value
    final_model_id = os.getenv("HINDSIGHT_MENTAL_MODEL_ID", MODEL_ID)
    print("\nHindsight initialised successfully.")
    print(f"  Bank:          {BANK_ID}")
    print(f"  Mental Model:  {final_model_id}")


if __name__ == "__main__":
    main()
