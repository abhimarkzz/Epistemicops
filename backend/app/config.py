from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the .env file relative to this file so the path is correct
# regardless of the working directory uvicorn is launched from.
_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    # LLM provider. "gemini" (default) or "groq". Groq is a free-tier option
    # and is selected automatically when a GROQ_API_KEY is present and no
    # explicit provider is set.
    llm_provider: str = ""

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"

    # Groq (optional free-tier provider)
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

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
    # Seconds to wait for a single LLM response before raising TimeoutError
    llm_timeout: int = 60

    # Public deployment & security settings
    allow_public_reset: bool = True
    admin_token: str = ""
    max_concurrent_investigations: int = 2

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def active_provider(self) -> str:
        """Which LLM provider the agent will use.

        Honors an explicit LLM_PROVIDER; otherwise prefers Groq when a Groq key
        is configured (so a blocked Gemini key never stalls the live demo), and
        falls back to Gemini.
        """
        explicit = self.llm_provider.strip().lower()
        if explicit in ("gemini", "groq"):
            return explicit
        if self.groq_api_key:
            return "groq"
        return "gemini"


settings = Settings()
