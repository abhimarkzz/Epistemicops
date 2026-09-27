from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the .env file relative to this file so the path is correct
# regardless of the working directory uvicorn is launched from.
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    # Ollama
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:8b"

    # Hindsight
    hindsight_base_url: str = "http://127.0.0.1:8888"
    hindsight_bank_id: str = "epistemic-sre"
    hindsight_mental_model_id: str = "microservice-resolution-runbook"

    # Backend server
    cors_origin: str = "http://localhost:5173"
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000

    # Agent behaviour
    max_agent_steps: int = 8

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
