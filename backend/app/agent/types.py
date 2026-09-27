from __future__ import annotations

import operator
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field
from typing_extensions import TypedDict


class DiagnosisResult(BaseModel):
    incident_id: str
    root_cause: str
    evidence: list[str] = Field(default_factory=list)
    recommended_remediation: str
    confidence: float
    memory_used: bool = False
    tool_calls: list[str] = Field(default_factory=list)
    status: Literal["completed", "failed", "inconclusive"] = "completed"


class AgentEvent(BaseModel):
    event: str
    data: dict[str, Any] = Field(default_factory=dict)


class AgentState(TypedDict):
    incident_id: str
    incident: dict[str, Any]
    memory_context: str | None
    tool_results: dict[str, Any]
    # Annotated with operator.add so nodes return only the NEW names/events
    # and LangGraph accumulates them automatically.
    tool_call_names: Annotated[list[str], operator.add]
    llm_analysis: str | None
    diagnosis: DiagnosisResult | None
    events: Annotated[list[AgentEvent], operator.add]
    error: str | None
    postmortem_retained: bool
