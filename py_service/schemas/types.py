"""
Pydantic v2 models for SimExam AI evaluation service.

These models define the request/response contracts between
the Node.js backend and the Python evaluation service.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ── Shared / Nested Models ──────────────────────────────────────────

class RubricDimension(BaseModel):
    """A single rubric dimension with name, weight, and description."""
    name: str
    weight: float = Field(ge=0.0, le=1.0)
    description: str = ""


class TestCase(BaseModel):
    """A single test case for code evaluation."""
    input: str
    expected_output: str
    hidden: Optional[bool] = False


class AgentEvent(BaseModel):
    """A timestamped event from the exam session."""
    event_type: str
    actor: str
    content: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChunkResult(BaseModel):
    """A single retrieval result with content and score."""
    content: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)
    source: str = ""


class Rubric(BaseModel):
    """Rubric with evaluation dimensions and a passing score."""
    dimensions: list[RubricDimension] = Field(default_factory=list)
    passing_score: float = 60.0


# ── Evaluation ───────────────────────────────────────────────────────

class EvalRequest(BaseModel):
    """Request payload for code evaluation."""
    assessment_type: str = "coding"
    final_code: str = Field(max_length=51200, default="")  # 50 KB limit
    test_cases: list[TestCase] = Field(default_factory=list)
    conversation_history: list[dict[str, Any]] = Field(default_factory=list)
    code_snapshots: list[str] = Field(default_factory=list)
    time_elapsed: float = 0.0
    curveball_fired: bool = False
    curveball_addressed: bool = False
    hints_given: int = 0
    rubric: Rubric = Field(default_factory=Rubric)
    org_slug: str = ""

    # -- test results forwarded from Node (Judge0) --
    tests_passed: int = 0
    tests_total: int = 0

    @field_validator("final_code")
    @classmethod
    def code_not_empty(cls, v: str, info) -> str:
        if info.data.get("assessment_type") == "coding" and not v.strip():
            raise ValueError("final_code must not be empty for coding assessment")
        return v


class EvalResponse(BaseModel):
    """Response payload from the evaluation pipeline."""
    tests_passed: int = 0
    tests_total: int = 0
    dimension_scores: dict[str, float] = Field(default_factory=dict)
    technical_accuracy: float = 0.0
    adaptability: float = 0.0
    communication: float = 0.0
    efficiency: float = 0.0
    doubt_resolution: float = 0.0
    independence: float = 0.0
    overall_feedback: str = ""
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    passed: bool = False
    overall_score: float = 0.0


# ── Document Ingestion ───────────────────────────────────────────────

class IngestRequest(BaseModel):
    """Request payload for document ingestion into the vector store."""
    doc_id: str
    org_id: str
    session_id: Optional[str] = None
    filename: str
    mime_type: str
    content_base64: str  # base64-encoded file bytes

    @field_validator("content_base64")
    @classmethod
    def content_not_too_large(cls, v: str) -> str:
        # base64 inflates size ~33%, so 20 MB file ≈ 27 MB base64
        if len(v) > 28_000_000:
            raise ValueError("content_base64 exceeds 20 MB file limit")
        return v


class IngestResponse(BaseModel):
    """Response from document ingestion."""
    doc_id: str
    status: str = "ok"
    chunk_count: int = 0


# ── Retrieval / RAG ─────────────────────────────────────────────────

class RetrieveRequest(BaseModel):
    """Request payload for semantic retrieval."""
    query: str = Field(min_length=1, max_length=2000)
    org_id: str
    session_id: Optional[str] = None
    k: int = Field(default=5, ge=1, le=50)


class RetrieveResponse(BaseModel):
    """Response from semantic retrieval."""
    chunks: list[ChunkResult] = Field(default_factory=list)
    query: str = ""


# ── Code Analysis ───────────────────────────────────────────────────

class AnalyseRequest(BaseModel):
    """Request payload for static code analysis."""
    code: str = Field(max_length=51200)
    language: str = "python"


class AnalyseResponse(BaseModel):
    """Response from static code analysis."""
    cyclomatic_complexity: list[dict[str, Any]] = Field(default_factory=list)
    has_recursion: bool = False
    estimated_complexity: str = "O(1)"
    syntax_valid: bool = True
    code_smells: list[str] = Field(default_factory=list)
    variable_names: list[str] = Field(default_factory=list)


# ── Behavioural Analysis ────────────────────────────────────────────

class BehaviouralRequest(BaseModel):
    """Request payload for behavioural analysis."""
    events: list[AgentEvent] = Field(default_factory=list)
    config: dict[str, Any] = Field(default_factory=dict)


class BehaviouralResponse(BaseModel):
    """Response from behavioural analysis."""
    process_quality: float = 5.0
    adaptability: float = 5.0
    independence: float = 5.0
    signals: dict[str, Any] = Field(default_factory=dict)
