from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import check_auth  # legacy demo auth for /run
from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.agent import Agent as AgentModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..models.user import User

router = APIRouter(prefix="/runs", tags=["runs"])

# Stable 3-minute heartbeat per spec
HEARTBEAT_INTERVAL_SECONDS = 180


def _dt_to_iso_z(dt: Optional[datetime]) -> str:
    if dt is None:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_run_id() -> str:
    return "run_" + uuid4().hex[:16]


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class RunRequest(BaseModel):
    """
    Run start payload used by both new and legacy endpoints.

    For Job 6 we care about:
    - input: user message or payload
    - source: where the run was triggered from (vibe | pro | flow | agui | api | clinic)
    - config: optional execution config (stored on the run row)
    """

    input: str = Field(..., description="User input or message for the agent.")
    source: str = Field(
        "vibe",
        description="Run source: vibe | pro | flow | agui | api | clinic",
    )
    config: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional execution config to persist on the run."
    )


class RunResponse(BaseModel):
    ok: bool = True
    run_id: str
    request_id: str


class RunListItem(BaseModel):
    id: str
    agent_id: Optional[str] = None
    status: str
    model: Optional[str] = None
    provider: Optional[str] = None
    source: Optional[str] = None
    latency_ms: Optional[int] = None
    tokens_total: Optional[int] = None
    cost_estimate_usd: Optional[float] = None
    created_at: str


class RunListResponse(BaseModel):
    ok: bool = True
    items: List[RunListItem]
    total: int
    limit: int
    offset: int


class RunDetail(BaseModel):
    id: str
    agent_id: Optional[str] = None
    user_id: Optional[int] = None
    request_id: Optional[str] = None
    status: str
    model: Optional[str] = None
    provider: Optional[str] = None
    source: Optional[str] = None
    latency_ms: Optional[int] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    tokens_total: Optional[int] = None
    cost_estimate_usd: Optional[float] = None
    error_message: Optional[str] = None
    created_at: str
    updated_at: str
    config: Optional[Dict[str, Any]] = None


class RunEventDTO(BaseModel):
    id: int
    type: str
    payload: Dict[str, Any]
    created_at: str


class RunDetailResponse(BaseModel):
    ok: bool = True
    run: RunDetail
    events: List[RunEventDTO]


# ---------------------------------------------------------------------------
# Internal mappers / helpers
# ---------------------------------------------------------------------------


def _run_to_list_item(run: RunModel) -> RunListItem:
    return RunListItem(
        id=run.id,
        agent_id=run.agent_id,
        status=run.status,
        model=run.model,
        provider=run.provider,
        source=run.source,
        latency_ms=run.latency_ms,
        tokens_total=run.tokens_total,
        cost_estimate_usd=run.cost_estimate_usd,
        created_at=_dt_to_iso_z(run.created_at),
    )


def _run_to_detail(run: RunModel) -> RunDetail:
    return RunDetail(
        id=run.id,
        agent_id=run.agent_id,
        user_id=run.user_id,
        request_id=run.request_id,
        status=run.status,
        model=run.model,
        provider=run.provider,
        source=run.source,
        latency_ms=run.latency_ms,
        tokens_in=run.tokens_in,
        tokens_out=run.tokens_out,
        tokens_total=run.tokens_total,
        cost_estimate_usd=run.cost_estimate_usd,
        error_message=run.error_message,
        created_at=_dt_to_iso_z(run.created_at),
        updated_at=_dt_to_iso_z(run.updated_at),
        config=run.config,
    )


def _format_sse(event: str, data: Any) -> str:
    if not isinstance(data, str):
        data_str = json.dumps(data)
    else:
        data_str = data
    return f"event: {event}\ndata: {data_str}\n\n"


def _create_initial_events(db: Session, run: RunModel, body: RunRequest) -> None:
    """
    Create initial run events for the newly-started run.

    These are simple and will be augmented by the LLM router in Job 6 Step 4.
    """
    evt = RunEventModel(
        run_id=run.id,
        type="log",
        payload={
            "message": "Run started",
            "input": body.input,
            "source": body.source,
        },
    )
    db.add(evt)
    db.commit()


def _start_run_record(
    db: Session,
    *,
    current_user: User,
    agent: AgentModel,
    body: RunRequest,
    request_id: Optional[str] = None,
) -> RunModel:
    """
    Create the Run row and initial events.

    Actual LLM execution will be handled by the centralized router (Job 6).
    """
    run_id = _new_run_id()
    if not request_id:
        request_id = str(uuid4())

    # These will later be populated from the router / agent spec
    model = None
    provider = None

    run = RunModel(
        id=run_id,
        agent_id=agent.id,
        user_id=current_user.id,
        request_id=request_id,
        status="running",
        model=model,
        provider=provider,
        source=body.source,
        latency_ms=None,
        tokens_in=None,
        tokens_out=None,
        tokens_total=None,
        cost_estimate_usd=None,
        error_message=None,
        config=body.config,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    _create_initial_events(db, run, body)
    return run


# ---------------------------------------------------------------------------
# Job 6: runs listing + detail for Clinic
# ---------------------------------------------------------------------------


@router.get("", response_model=RunListResponse)
def list_runs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    agent_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filter by status: pending|running|success|error",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunListResponse:
    """
    List runs for the authenticated user, optionally filtered by agent_id and status.

    Matches Job 6 spec semantics for Clinic.
    """
    q = db.query(RunModel).filter(RunModel.user_id == current_user.id)

    if agent_id:
        q = q.filter(RunModel.agent_id == agent_id)
    if status_filter:
        q = q.filter(RunModel.status == status_filter)

    total = q.count()
    runs = q.order_by(RunModel.created_at.desc()).offset(offset).limit(limit).all()

    items = [_run_to_list_item(r) for r in runs]

    return RunListResponse(
        ok=True,
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{run_id}", response_model=RunDetailResponse)
def get_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunDetailResponse:
    """Return full run details plus associated events for Clinic detail view."""
    run: RunModel | None = (
        db.query(RunModel)
        .filter(
            RunModel.id == run_id,
            RunModel.user_id == current_user.id,
        )
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Run not found"},
            },
        )

    events: List[RunEventModel] = (
        db.query(RunEventModel)
        .filter(RunEventModel.run_id == run_id)
        .order_by(RunEventModel.created_at.asc())
        .all()
    )
    events_dto = [
        RunEventDTO(
            id=e.id,
            type=e.type,
            payload=e.payload or {},
            created_at=_dt_to_iso_z(e.created_at),
        )
        for e in events
    ]

    return RunDetailResponse(
        ok=True,
        run=_run_to_detail(run),
        events=events_dto,
    )


# ---------------------------------------------------------------------------
# Job 6: SSE streaming – GET /runs/{run_id}/events
# ---------------------------------------------------------------------------


async def _event_stream(
    db: Session,
    run: RunModel,
    current_user: User,
) -> AsyncGenerator[str, None]:
    """
    Async generator yielding Server-Sent Events for a run.

    Events:
    - token:       streaming text tokens (to be added by router in Step 4)
    - log:         log / debug messages
    - tool_call:   tool invocations
    - tool_result: tool responses
    - error:       error events
    - done:        terminal event
    - ping:        heartbeat every HEARTBEAT_INTERVAL_SECONDS

    The generator terminates after a done event has been sent or the run
    status is success/error and no more events are arriving.
    """
    last_event_created_at: Optional[datetime] = None
    sent_done = False
    last_heartbeat = time.monotonic()

    while True:
        # Reload run status periodically
        db.refresh(run)

        # Fetch new events since last_event_created_at
        q = db.query(RunEventModel).filter(RunEventModel.run_id == run.id)
        if last_event_created_at is not None:
            q = q.filter(RunEventModel.created_at > last_event_created_at)
        events = q.order_by(RunEventModel.created_at.asc()).all()

        for ev in events:
            last_event_created_at = ev.created_at
            payload = ev.payload or {}
            event_type = ev.type or "log"
            yield _format_sse(event_type, payload)
            if event_type == "done":
                sent_done = True

        now = time.monotonic()
        if now - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
            last_heartbeat = now
            # Heartbeat ping with empty payload
            yield _format_sse("ping", {})

        # If we've already sent done OR run is completed, send a final done and exit
        if run.status in ("success", "error"):
            if not sent_done:
                yield _format_sse(
                    "done",
                    {
                        "status": run.status,
                        "request_id": run.request_id,
                    },
                )
            break

        # Avoid tight loop; also controls how quickly we see new events
        await asyncio.sleep(1.0)


@router.get("/{run_id}/events")
async def stream_run_events(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    SSE endpoint used by V1 UI (Pro/Clinic) to stream run events.

    Client usage example:

        const es = new EventSource(`/runs/${runId}/events`);
        es.addEventListener("token", ...);
        es.addEventListener("log", ...);
        es.addEventListener("error", ...);
        es.addEventListener("done", ...);
        es.addEventListener("ping", ...);

    Includes a stable 3-minute heartbeat (`ping` events) as required by Job 6.
    """
    run: RunModel | None = (
        db.query(RunModel)
        .filter(
            RunModel.id == run_id,
            RunModel.user_id == current_user.id,
        )
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Run not found"},
            },
        )

    generator = _event_stream(db, run, current_user)
    return StreamingResponse(generator, media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Legacy /run endpoint for backwards compatibility
# ---------------------------------------------------------------------------


@router.post("/runs", response_model=RunResponse)
def legacy_start_run(
    body: RunRequest,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
) -> RunResponse:
    """
    Legacy /runs endpoint.

    For Job 6, this just creates an ad-hoc run with no agent_id. This keeps
    older experimental clients from breaking while we migrate them.
    """
    request_id = str(uuid4())
    run_id = _new_run_id()

    run = RunModel(
        id=run_id,
        agent_id=None,
        user_id=None,
        request_id=request_id,
        status="running",
        model=None,
        provider=None,
        source=body.source,
        latency_ms=None,
        tokens_in=None,
        tokens_out=None,
        tokens_total=None,
        cost_estimate_usd=None,
        error_message=None,
        config=body.config,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    _create_initial_events(db, run, body)

    return RunResponse(ok=True, run_id=run.id, request_id=run.request_id)


# For Clinic.replay compatibility; older code imports `_launch_run`
def _launch_run(body: RunRequest, db: Session) -> RunResponse:
    """
    Compatibility shim used by `clinic.py` for replay.

    It behaves like the legacy /run endpoint but can be called directly.
    """
    request_id = str(uuid4())
    run_id = _new_run_id()

    run = RunModel(
        id=run_id,
        agent_id=None,
        user_id=None,
        request_id=request_id,
        status="running",
        model=None,
        provider=None,
        source=body.source,
        latency_ms=None,
        tokens_in=None,
        tokens_out=None,
        tokens_total=None,
        cost_estimate_usd=None,
        error_message=None,
        config=body.config,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    _create_initial_events(db, run, body)

    return RunResponse(ok=True, run_id=run.id, request_id=run.request_id)
