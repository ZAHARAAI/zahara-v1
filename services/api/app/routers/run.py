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
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import check_auth  # legacy demo auth for /run
from ..database import get_db
from ..middleware.auth import get_current_user
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
    Run start payload used for legacy /runs and compatibility shims.
    New Job6 flow is typically /agents/{id}/run, but keeping this for old clients.
    """

    prompt: str = ""
    model: str = "gpt-4o-mini"
    provider: Optional[str] = None
    source: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


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


def _event_to_dto(ev: RunEventModel) -> RunEventDTO:
    return RunEventDTO(
        id=ev.id,
        type=ev.type,
        payload=ev.payload,
        created_at=_dt_to_iso_z(ev.created_at),
    )


def _create_event(
    db: Session, run_id: str, type_: str, payload: Dict[str, Any]
) -> None:
    ev = RunEventModel(
        run_id=run_id,
        type=type_,
        payload=payload,
    )
    db.add(ev)
    db.commit()


def _create_initial_events(db: Session, run: RunModel, body: RunRequest) -> None:
    _create_event(
        db,
        run.id,
        "system",
        {
            "request_id": run.request_id,
            "run_id": run.id,
            "ts": _dt_to_iso_z(datetime.now(timezone.utc)),
            "model": run.model,
            "provider": run.provider,
            "source": run.source,
        },
    )
    if body.prompt:
        _create_event(
            db,
            run.id,
            "log",
            {"message": "prompt_received", "prompt_preview": body.prompt[:200]},
        )


# ---------------------------------------------------------------------------
# Job6: Clinic list endpoint
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
    List runs for the authenticated user (Clinic).

    Supports pagination via limit/offset and optional filters:
    - agent_id: limit results to a single agent
    - status: pending|running|success|error
    """
    allowed_status = {"pending", "running", "success", "error"}
    if status_filter is not None and status_filter not in allowed_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_status",
                "message": f"Invalid status '{status_filter}'. Allowed: {sorted(allowed_status)}",
            },
        )

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


# ---------------------------------------------------------------------------
# Run detail + events + SSE
# ---------------------------------------------------------------------------


@router.get("/{run_id}", response_model=RunDetailResponse)
def get_run_detail(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunDetailResponse:
    run = (
        db.query(RunModel)
        .filter(RunModel.id == run_id, RunModel.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="run_not_found")

    events = (
        db.query(RunEventModel)
        .filter(RunEventModel.run_id == run_id)
        .order_by(RunEventModel.created_at.asc())
        .limit(5000)
        .all()
    )

    return RunDetailResponse(
        ok=True,
        run=_run_to_detail(run),
        events=[_event_to_dto(e) for e in events],
    )


@router.get("/{run_id}/events")
def stream_run_events(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    SSE stream of run events.
    Emits a stable heartbeat ping every 180 seconds.
    Injects request_id into every event payload (propagation).
    """

    run = (
        db.query(RunModel)
        .filter(RunModel.id == run_id, RunModel.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="run_not_found")

    async def event_generator() -> AsyncGenerator[bytes, None]:
        last_id = 0
        last_ping = time.time()
        rid = run.request_id

        while True:
            new_events = (
                db.query(RunEventModel)
                .filter(RunEventModel.run_id == run_id, RunEventModel.id > last_id)
                .order_by(RunEventModel.id.asc())
                .limit(200)
                .all()
            )

            for ev in new_events:
                last_id = ev.id

                payload = ev.payload or {}
                # Propagate request_id into each event payload
                if isinstance(payload, dict) and "request_id" not in payload:
                    payload = {**payload, "request_id": rid}

                out = {
                    "type": ev.type,
                    "payload": payload,
                    "created_at": _dt_to_iso_z(ev.created_at),
                    "request_id": rid,  # also top-level for convenience
                }
                yield f"data: {json.dumps(out)}\n\n".encode("utf-8")

                if ev.type in {"done", "error"}:
                    return

            now = time.time()
            if now - last_ping >= HEARTBEAT_INTERVAL_SECONDS:
                last_ping = now
                ping_out = {
                    "type": "ping",
                    "payload": {
                        "ts": _dt_to_iso_z(datetime.now(timezone.utc)),
                        "request_id": rid,
                    },
                    "created_at": _dt_to_iso_z(datetime.now(timezone.utc)),
                    "request_id": rid,
                }
                yield f"data: {json.dumps(ping_out)}\n\n".encode("utf-8")

            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Legacy /runs endpoint retained for backward compatibility
# ---------------------------------------------------------------------------


@router.post("", response_model=RunResponse)
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
        user_id=1,  # legacy demo auth user
        request_id=request_id,
        status="pending",
        model=body.model,
        provider=body.provider,
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
    Compatibility shim used by `clinic.py` for repl
    """
    request_id = str(uuid4())
    run_id = _new_run_id()

    run = RunModel(
        id=run_id,
        agent_id=None,
        user_id=1,  # legacy user
        request_id=request_id,
        status="pending",
        model=body.model,
        provider=body.provider,
        source=body.source,
        config=body.config,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    _create_initial_events(db, run, body)
    return RunResponse(ok=True, run_id=run.id, request_id=run.request_id)
