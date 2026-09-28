"""Basic smoke tests for the FastAPI application."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_200():
    response = client.get("/health")
    assert response.status_code == 200


def test_health_body():
    response = client.get("/health")
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "epistemicops-backend"
    assert "services" in body
    assert "llm" in body["services"]
    assert body["services"]["llm"]["provider"] in ("gemini", "groq")
    assert "hindsight" in body["services"]


def test_incidents_returns_list():
    response = client.get("/api/incidents")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_incidents_no_ground_truth():
    response = client.get("/api/incidents")
    for incident in response.json():
        for key in incident:
            assert not key.startswith("_"), f"Private key '{key}' leaked to client"


def test_incident_not_found():
    response = client.get("/api/incidents/does-not-exist")
    assert response.status_code == 404
