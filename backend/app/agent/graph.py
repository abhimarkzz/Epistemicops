"""LangGraph bounded state machine for SRE incident investigation.

Flow: load_incident → query_memory → investigate → analyze → validate
      → produce_result → retain_postmortem → END

Any node that sets state["error"] is immediately routed to error_end → END.
The LLM is injected so tests can substitute a mock without calling live LLM APIs.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, AsyncGenerator

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, StateGraph

from app.config import settings
from app.fixtures import FixtureService, IncidentNotFoundError

from .memory import query_incident_patterns, retain_incident_full
from .prompts import SYSTEM_PROMPT, build_analysis_prompt
from .tools import TOOL_ORDER, InvestigationTools
from .types import AgentEvent, AgentState, DiagnosisResult

# ── helpers ────────────────────────────────────────────────────────────────────

HIDDEN_GT_FIELDS = {
    "_ground_truth", "ground_truth", "root_cause", "root_cause_category",
    "expected_evidence", "canonical_fix", "fix_tool", "forbidden_categories",
    "resolution_steps",
}


def _make_default_llm() -> BaseChatModel:
    """Build the diagnosis LLM for the configured provider.

    Groq (free tier) is the primary provider.
    Both are swapped for a mock in tests, so neither key is needed to run the suite.
    """
    if settings.active_provider() == "gemini":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI

            return ChatGoogleGenerativeAI(
                model=settings.gemini_model,
                google_api_key=settings.gemini_api_key,
                temperature=0,
            )
        except ImportError as exc:
            raise RuntimeError(
                "langchain-google-genai is not installed. Use Groq provider instead."
            ) from exc
    from langchain_groq import ChatGroq

    return ChatGroq(
        model=settings.groq_model,
        api_key=settings.groq_api_key,
        temperature=0,
    )


def _strip_thinking(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _parse_llm_json(raw: str) -> dict[str, Any]:
    cleaned = _strip_thinking(raw)
    cleaned = re.sub(r"```json\s*", "", cleaned)
    cleaned = re.sub(r"```\s*", "", cleaned)
    return json.loads(cleaned.strip())


def _summarize_tool_result(tool_name: str, result: Any) -> str:
    if result is None:
        return "No data available."
    if tool_name == "get_logs":
        n = len(result) if isinstance(result, list) else 0
        return f"{n} log line(s) retrieved."
    if tool_name == "get_metrics":
        n = len(result) if isinstance(result, dict) else 0
        return f"{n} metric series retrieved."
    if tool_name == "get_trace":
        if isinstance(result, list):
            return f"{len(result)} spans retrieved."
        if isinstance(result, dict):
            return f"Trace data retrieved ({len(result.get('spans') or [])} spans)."
        return "Trace data retrieved."
    if tool_name == "get_pod_status":
        pods = (result or {}).get("pods", [])
        return f"{len(pods)} pod(s) in status."
    return "Data retrieved."


def _route(ok_node: str):
    def fn(state: AgentState) -> str:
        return "error_end" if state.get("error") else ok_node
    return fn


# ── nodes ──────────────────────────────────────────────────────────────────────

def _node_load_incident(fixture_svc: FixtureService):
    def node(state: AgentState) -> dict:
        inc_id = state["incident_id"]
        try:
            incident = fixture_svc.get_incident(inc_id)
        except IncidentNotFoundError as exc:
            err = str(exc)
            return {
                "error": err,
                "events": [AgentEvent(event="run_failed", data={"error": err})],
            }
        # Verify public dict contains no ground-truth fields before passing to agent
        for key in HIDDEN_GT_FIELDS:
            if key in incident:
                err = f"Ground-truth field '{key}' leaked into public incident view"
                return {
                    "error": err,
                    "events": [AgentEvent(event="run_failed", data={"error": err})],
                }
        return {
            "incident": incident,
            "events": [
                AgentEvent(
                    event="incident_started",
                    data={
                        "incident_id": inc_id,
                        "title": incident.get("title", ""),
                        "service": incident.get("service", ""),
                        "severity": incident.get("severity", ""),
                    },
                )
            ],
        }
    return node


def _node_query_memory():
    async def node(state: AgentState) -> dict:
        if state.get("skip_memory", False):
            # Baseline intentionally skips Hindsight retrieval so it can serve as the memory-off experimental control.
            return {
                "memory_context": None,
                "events": [AgentEvent(event="memory_skipped", data={"reason": "baseline mode"})],
            }
        incident = state["incident"]
        alert = incident.get("alert") or {}
        query = (
            f"service={incident.get('service', '')} "
            f"category={incident.get('category', '')} "
            f"alert: {alert.get('title', '')}"
        )
        events: list[AgentEvent] = [
            AgentEvent(event="memory_query_started", data={"query": query})
        ]
        context = await query_incident_patterns(query)
        events.append(
            AgentEvent(
                event="memory_result",
                data={
                    "found": bool(context),
                    "summary": context[:200] if context else "No prior patterns found.",
                },
            )
        )
        return {"memory_context": context or None, "events": events}
    return node


def _node_investigate(fixture_svc: FixtureService):
    tools = InvestigationTools(fixture_svc)

    async def node(state: AgentState) -> dict:
        inc_id = state["incident_id"]
        results: dict[str, Any] = {}
        events: list[AgentEvent] = []
        new_tool_calls: list[str] = []

        for tool_name in TOOL_ORDER:
            events.append(AgentEvent(event="tool_started", data={"tool": tool_name}))
            new_tool_calls.append(tool_name)
            try:
                result = getattr(tools, tool_name)(inc_id)
                key = tool_name.removeprefix("get_")
                results[key] = result
                summary = _summarize_tool_result(tool_name, result)
                events.append(
                    AgentEvent(
                        event="tool_result_summary",
                        data={"tool": tool_name, "summary": summary},
                    )
                )
            except IncidentNotFoundError as exc:
                err = str(exc)
                return {
                    "error": err,
                    "tool_call_names": new_tool_calls,
                    "events": events + [AgentEvent(event="run_failed", data={"error": err})],
                }

        # Signal that evidence collection is done and the LLM is next.
        events.append(AgentEvent(event="diagnosis_started", data={}))
        return {"tool_results": results, "tool_call_names": new_tool_calls, "events": events}
    return node


def _node_analyze(llm: BaseChatModel):
    async def node(state: AgentState) -> dict:
        events: list[AgentEvent] = []
        prompt = build_analysis_prompt(
            state["incident"],
            state.get("memory_context"),
            state.get("tool_results", {}),
        )
        messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)]
        try:
            response = await asyncio.wait_for(
                llm.ainvoke(messages),
                timeout=settings.llm_timeout,
            )
            content = response.content if hasattr(response, "content") else str(response)
            # Gemini 3.x returns structured content blocks (list of dicts with 'text' key).
            # Extract and join all text blocks; non-text blocks (thinking signatures) are skipped.
            if isinstance(content, list):
                raw = " ".join(
                    b["text"] for b in content
                    if isinstance(b, dict) and b.get("type") == "text" and b.get("text")
                )
            else:
                raw = content
            return {"llm_analysis": raw, "events": events}
        except asyncio.TimeoutError:
            model = settings.groq_model if settings.active_provider() == "groq" else settings.gemini_model
            err = f"LLM call timed out after {settings.llm_timeout}s (model: {model})"
            return {
                "error": err,
                "events": events + [AgentEvent(event="run_failed", data={"error": err})],
            }
        except Exception as exc:
            err = f"LLM call failed: {exc}"
            return {
                "error": err,
                "events": events + [AgentEvent(event="run_failed", data={"error": err})],
            }
    return node


def _node_validate(state: AgentState) -> dict:
    raw = state.get("llm_analysis") or ""
    inc_id = state["incident_id"]
    tool_calls = list(state.get("tool_call_names", []))
    memory_used = bool(state.get("memory_context"))
    try:
        parsed = _parse_llm_json(raw)
        diagnosis = DiagnosisResult(
            incident_id=inc_id,
            root_cause=parsed["root_cause"],
            evidence=parsed.get("evidence", []),
            recommended_remediation=parsed["recommended_remediation"],
            confidence=float(parsed.get("confidence", 0.5)),
            memory_used=memory_used,
            tool_calls=tool_calls,
            status="completed",
        )
        return {"diagnosis": diagnosis}
    except Exception as exc:
        err = f"Could not parse LLM response: {exc}"
        return {
            "error": err,
            "events": [AgentEvent(event="run_failed", data={"error": err})],
        }


def _node_produce_result(state: AgentState) -> dict:
    diagnosis = state["diagnosis"]
    return {
        "events": [
            AgentEvent(
                event="diagnosis_completed",
                data={
                    "incident_id": diagnosis.incident_id,
                    "root_cause": diagnosis.root_cause,
                    "evidence": diagnosis.evidence,
                    "recommended_remediation": diagnosis.recommended_remediation,
                    "confidence": diagnosis.confidence,
                    "status": diagnosis.status,
                    "memory_used": diagnosis.memory_used,
                    "tool_calls": diagnosis.tool_calls,
                },
            )
        ]
    }


def _node_retain_postmortem():
    async def node(state: AgentState) -> dict:
        diagnosis = state["diagnosis"]
        incident = state["incident"]
        tags = list(
            {
                t
                for t in [
                    incident.get("service"),
                    incident.get("category"),
                    "postmortem",
                ]
                if t
            }
        )
        events: list[AgentEvent] = [
            AgentEvent(event="memory_retention_started", data={"tags": tags})
        ]
        success = await retain_incident_full(incident, diagnosis)
        events.append(AgentEvent(event="postmortem_created", data={"success": success}))
        events.append(
            AgentEvent(event="run_completed", data={"incident_id": diagnosis.incident_id})
        )
        return {"postmortem_retained": success, "events": events}
    return node


def _node_error_end(state: AgentState) -> dict:
    return {}


# ── graph builder ──────────────────────────────────────────────────────────────

def build_graph(
    fixture_svc: FixtureService,
    llm: BaseChatModel | None = None,
):
    if llm is None:
        llm = _make_default_llm()

    g = StateGraph(AgentState)
    g.add_node("load_incident", _node_load_incident(fixture_svc))
    g.add_node("query_memory", _node_query_memory())
    g.add_node("investigate", _node_investigate(fixture_svc))
    g.add_node("analyze", _node_analyze(llm))
    g.add_node("validate", _node_validate)
    g.add_node("produce_result", _node_produce_result)
    g.add_node("retain_postmortem", _node_retain_postmortem())
    g.add_node("error_end", _node_error_end)

    g.set_entry_point("load_incident")
    g.add_conditional_edges(
        "load_incident", _route("query_memory"),
        {"query_memory": "query_memory", "error_end": "error_end"},
    )
    g.add_edge("query_memory", "investigate")
    g.add_conditional_edges(
        "investigate", _route("analyze"),
        {"analyze": "analyze", "error_end": "error_end"},
    )
    g.add_conditional_edges(
        "analyze", _route("validate"),
        {"validate": "validate", "error_end": "error_end"},
    )
    g.add_conditional_edges(
        "validate", _route("produce_result"),
        {"produce_result": "produce_result", "error_end": "error_end"},
    )
    g.add_edge("produce_result", "retain_postmortem")
    g.add_edge("retain_postmortem", END)
    g.add_edge("error_end", END)

    return g.compile()


async def run_investigation(
    incident_id: str,
    fixture_svc: FixtureService,
    llm: BaseChatModel | None = None,
    skip_memory: bool = False,
    recursion_limit: int | None = None,
) -> AsyncGenerator[AgentEvent, None]:
    """Run the investigation state machine and yield UI events as they occur.

    The graph is a bounded acyclic DAG, so it always terminates. As a defensive
    hard cap, LangGraph's recursion_limit is set from settings.max_agent_steps;
    if the graph ever exceeds it, GraphRecursionError is caught and surfaced as
    a run_failed event rather than propagating.
    """
    limit = recursion_limit if recursion_limit is not None else settings.max_agent_steps
    graph = build_graph(fixture_svc, llm)
    initial: AgentState = {
        "incident_id": incident_id,
        "incident": {},
        "memory_context": None,
        "tool_results": {},
        "tool_call_names": [],
        "llm_analysis": None,
        "diagnosis": None,
        "events": [],
        "error": None,
        "postmortem_retained": False,
        "skip_memory": skip_memory,
    }
    try:
        async for updates in graph.astream(
            initial,
            stream_mode="updates",
            config={"recursion_limit": limit},
        ):
            for node_updates in updates.values():
                if not node_updates:
                    continue
                for event in node_updates.get("events", []):
                    yield event
    except GraphRecursionError:
        err = f"Agent exceeded step limit ({limit}); terminated to prevent a stall."
        yield AgentEvent(event="run_failed", data={"error": err})
