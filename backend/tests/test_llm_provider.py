"""Provider-selection tests for the optional Groq/Gemini switch.

These assert the resolution logic and that the agent builds the right client
for the active provider. No live key is required — provider classes are patched.
"""

from __future__ import annotations

from unittest.mock import patch

from app.config import Settings


def _settings(**kw) -> Settings:
    # Ignore any real .env so tests are deterministic.
    return Settings(_env_file=None, **kw)


def test_default_provider_is_gemini():
    assert _settings().active_provider() == "gemini"


def test_groq_selected_when_key_present():
    assert _settings(groq_api_key="gsk_test").active_provider() == "groq"


def test_explicit_provider_overrides_autodetect():
    # Explicit gemini wins even if a groq key is present.
    s = _settings(llm_provider="gemini", groq_api_key="gsk_test")
    assert s.active_provider() == "gemini"


def test_explicit_groq_without_key_still_groq():
    assert _settings(llm_provider="groq").active_provider() == "groq"


def test_unknown_provider_falls_back_to_autodetect():
    assert _settings(llm_provider="banana").active_provider() == "gemini"


def test_make_llm_builds_groq_client_when_selected():
    from app.agent import graph
    with (
        patch.object(graph.settings, "groq_api_key", "gsk_test"),
        patch.object(graph.settings, "llm_provider", "groq"),
        patch("langchain_groq.ChatGroq") as chat_groq,
    ):
        graph._make_default_llm()
    chat_groq.assert_called_once()


def test_make_llm_builds_gemini_client_by_default():
    from app.agent import graph
    with (
        patch.object(graph.settings, "groq_api_key", ""),
        patch.object(graph.settings, "llm_provider", ""),
        patch("app.agent.graph.ChatGoogleGenerativeAI") as chat_gemini,
    ):
        graph._make_default_llm()
    chat_gemini.assert_called_once()
