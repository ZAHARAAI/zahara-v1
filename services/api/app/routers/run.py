from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone  # noqa: F401
from typing import Any, AsyncGenerator, Dict, List, Optional
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func  # noqa: F401
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..middleware.auth import get_current_user
from ..models.agent import Agent as AgentModel
from ..models.agent_spec import AgentSpec as AgentSpecModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..models.user import User
from ..services.audit import log_audit_event
from ..services.budget import evaluate_agent_budget
from ..services.run_executor import execute_run_via_router

router = APIRouter(prefix="/runs", tags=["runs"])

# Job7 SSE hardening: keep connections alive behind proxies (15-30s recommended)
HEARTBEAT_INTERVAL_SECONDS = 20


def _dt_to_iso_z(dt: Optional[datetime]) -> str:
    if dt is None:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_run_id() -> str:
    return "run_" + uuid4().hex[:16]


class RunRequest(BaseModel):
    prompt: str = ""
    model: str = "gpt-4o-mini"
    provider: Optional[str] = None
    source: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class RunResponse(BaseModel):
    ok: bool = True
    run_id: str
    request_id: str


class RunCancelResponse(BaseModel):
    ok: bool = True
    run_id: str
    status: str


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
    cost_is_approximate: Optional[bool] = None
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
    agent_spec_id: Optional[str] = None
    retry_of_run_id: Optional[str] = None
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
    cost_is_approximate: Optional[bool] = None
    error_message: Optional[str] = None
    input: Optional[str] = None
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


class RunDeleteResponse(BaseModel):
    ok: bool = True
    run_id: str
    deleted_events: int = 0


class RunRetryResponse(BaseModel):
    ok: bool = True
    new_run_id: str
    retry_of: str


class RunExportResponse(BaseModel):
    ok: bool = True
    run: RunDetail
    events: List[RunEventDTO]
    agent: Optional[Dict[str, Any]] = None
    spec: Optional[Dict[str, Any]] = None


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
        cost_is_approximate=bool(getattr(run, "cost_is_approximate", False))
        if run.cost_estimate_usd is not None
        else True,
        created_at=_dt_to_iso_z(run.created_at),
    )


def _run_to_detail(run: RunModel) -> RunDetail:
    return RunDetail(
        id=run.id,
        agent_id=run.agent_id,
        agent_spec_id=getattr(run, "agent_spec_id", None),
        retry_of_run_id=getattr(run, "retry_of_run_id", None),
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
        cost_is_approximate=bool(getattr(run, "cost_is_approximate", False))
        if run.cost_estimate_usd is not None
        else True,
        error_message=run.error_message,
        input=run.input,
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
    ev = RunEventModel(run_id=run_id, type=type_, payload=payload)
    db.add(ev)
    db.commit()


def _cancel_run_row(db: Session, run: RunModel, *, message: str) -> None:
    """
    Shared cancel logic so we can reuse behavior consistently.
    """
    if run.status in {"success", "error", "cancelled"}:
        return

    run.status = "cancelled"
    run.error_message = message
    db.add(run)
    db.commit()

    _create_event(
        db,
        run.id,
        "cancelled",
        {"message": message, "request_id": run.request_id},
    )


@router.get("", response_model=RunListResponse)
def list_runs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    agent_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunListResponse:
    allowed_status = {"pending", "running", "success", "error", "cancelled"}
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
    return RunListResponse(
        ok=True,
        items=[_run_to_list_item(r) for r in runs],
        total=total,
        limit=limit,
        offset=offset,
    )


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
        ok=True, run=_run_to_detail(run), events=[_event_to_dto(e) for e in events]
    )


@router.post("/{run_id}/retry", response_model=RunRetryResponse)
def retry_run(
    run_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunRetryResponse:
    """Create a new run that retries an existing run using the same AgentSpec version."""

    old = (
        db.query(RunModel)
        .filter(RunModel.id == run_id, RunModel.user_id == current_user.id)
        .first()
    )
    if not old:
        raise HTTPException(status_code=404, detail="run_not_found")
    if not old.agent_id:
        raise HTTPException(status_code=400, detail="run_missing_agent")

    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == old.agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(status_code=404, detail="agent_not_found")

    if getattr(agent, "status", "active") != "active":
        raise HTTPException(
            status_code=409,
            detail={
                "ok": False,
                "error": {
                    "code": "AGENT_NOT_ACTIVE",
                    "message": f"Agent is {agent.status}. Activate it to run.",
                },
            },
        )

    # Ensure we retry with the same spec version
    agent_spec_id = getattr(old, "agent_spec_id", None)
    if agent_spec_id:
        spec = (
            db.query(AgentSpecModel).filter(AgentSpecModel.id == agent_spec_id).first()
        )
        if not spec:
            agent_spec_id = None

    # If old run does not have a spec tracked yet, fall back to latest version.
    if not agent_spec_id:
        spec = (
            db.query(AgentSpecModel)
            .filter(AgentSpecModel.agent_id == agent.id)
            .order_by(AgentSpecModel.version.desc())
            .first()
        )
        agent_spec_id = spec.id if spec else None

    # Best-effort daily budget enforcement
    _meta, exceeded = evaluate_agent_budget(
        db,
        user_id=current_user.id,
        agent_id=agent.id,
        budget_daily_usd=getattr(agent, "budget_daily_usd", None),
    )
    if exceeded:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "ok": False,
                "error": {
                    "code": "BUDGET_EXCEEDED",
                    "message": "Daily budget exceeded for this agent.",
                    "meta": _meta.as_dict() if _meta is not None else {},
                },
            },
        )

    new_run_id = _new_run_id()
    request_id = str(uuid4())

    new_run = RunModel(
        id=new_run_id,
        agent_id=agent.id,
        agent_spec_id=agent_spec_id,
        retry_of_run_id=old.id,
        user_id=current_user.id,
        request_id=request_id,
        status="pending",
        source="clinic",
        input=old.input,
        config=old.config,
    )
    db.add(new_run)
    db.commit()
    db.refresh(new_run)

    db.add(
        RunEventModel(
            run_id=new_run.id,
            type="system",
            payload={
                "event": "run_created",
                "request_id": request_id,
                "retry_of": old.id,
            },
        )
    )
    db.commit()

    # Audit
    try:
        log_audit_event(
            db,
            user_id=current_user.id,
            event_type="run.retried",
            entity_type="run",
            entity_id=new_run.id,
            payload={"retry_of": old.id, "agent_id": agent.id},
        )
    except Exception:
        db.rollback()

    background_tasks.add_task(execute_run_via_router, new_run.id)

    return RunRetryResponse(ok=True, new_run_id=new_run.id, retry_of=old.id)


@router.get("/{run_id}/export", response_model=RunExportResponse)
def export_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunExportResponse:
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
        .limit(10000)
        .all()
    )

    agent_payload: Optional[Dict[str, Any]] = None
    spec_payload: Optional[Dict[str, Any]] = None

    if run.agent_id:
        agent = (
            db.query(AgentModel)
            .filter(
                AgentModel.id == run.agent_id, AgentModel.user_id == current_user.id
            )
            .first()
        )
        if agent:
            agent_payload = {
                "id": agent.id,
                "name": agent.name,
                "slug": getattr(agent, "slug", None),
                "status": getattr(agent, "status", None),
                "budget_daily_usd": float(agent.budget_daily_usd)
                if getattr(agent, "budget_daily_usd", None) is not None
                else None,
            }

    spec_id = getattr(run, "agent_spec_id", None)
    if spec_id:
        spec = db.query(AgentSpecModel).filter(AgentSpecModel.id == spec_id).first()
        if spec:
            spec_payload = {
                "id": spec.id,
                "agent_id": spec.agent_id,
                "version": spec.version,
                "content": spec.content,
                "created_at": _dt_to_iso_z(spec.created_at),
            }

    return RunExportResponse(
        ok=True,
        run=_run_to_detail(run),
        events=[_event_to_dto(e) for e in events],
        agent=agent_payload,
        spec=spec_payload,
    )


@router.post("/{run_id}/cancel", response_model=RunCancelResponse)
def cancel_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunCancelResponse:
    run = (
        db.query(RunModel)
        .filter(RunModel.id == run_id, RunModel.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="run_not_found")

    # If already terminal, return current status.
    if run.status in {"success", "error", "cancelled"}:
        return RunCancelResponse(ok=True, run_id=run.id, status=run.status)

    _cancel_run_row(db, run, message="Cancelled by user")
    return RunCancelResponse(ok=True, run_id=run.id, status=run.status)


@router.delete("/{run_id}", response_model=RunDeleteResponse)
def delete_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunDeleteResponse:
    run = (
        db.query(RunModel)
        .filter(RunModel.id == run_id, RunModel.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="run_not_found")

    try:
        deleted_events = (
            db.query(RunEventModel)
            .filter(RunEventModel.run_id == run_id)
            .delete(synchronize_session=False)
        )

        db.delete(run)
        db.commit()
        return RunDeleteResponse(ok=True, run_id=run_id, deleted_events=deleted_events)

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "delete_failed", "message": str(e)},
        )


@router.get("/{run_id}/events")
def stream_run_events(
    run_id: str,
    request: Request,
    framed: bool = Query(False, description="If true, emit SSE 'event:' lines"),
    after_event_id: int = Query(
        0,
        ge=0,
        description="Start streaming after this event id (helps resume on reconnect)",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    run = (
        db.query(RunModel)
        .filter(RunModel.id == run_id, RunModel.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="run_not_found")

    async def event_generator() -> AsyncGenerator[bytes, None]:
        # Support standard SSE resume header.
        header_last = 0
        try:
            if request is not None:
                header_last = int(request.headers.get("last-event-id", "0") or 0)
        except Exception:
            header_last = 0

        last_id = max(after_event_id or 0, header_last or 0)
        last_heartbeat = time.time()

        while True:
            # IMPORTANT: Do not keep a DB session open across yields.
            with SessionLocal() as s:
                new_events = (
                    s.query(RunEventModel)
                    .filter(RunEventModel.run_id == run_id, RunEventModel.id > last_id)
                    .order_by(RunEventModel.id.asc())
                    .limit(200)
                    .all()
                )

                for ev in new_events:
                    last_id = ev.id
                    data = {
                        "type": ev.type,
                        "ts": _dt_to_iso_z(ev.created_at),
                        "created_at": _dt_to_iso_z(ev.created_at),
                        "request_id": run.request_id,
                        "payload": ev.payload or {},
                        "id": ev.id,
                        "message": (ev.payload or {}).get("message"),
                    }

                    if framed:
                        yield (
                            f"event: {ev.type}\n"
                            f"id: {ev.id}\n"
                            f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                        ).encode("utf-8")
                    else:
                        yield (
                            f"id: {ev.id}\n"
                            f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                        ).encode("utf-8")

                    if ev.type in {"done", "error", "cancelled"}:
                        return

                # If no new events and run is terminal, stop streaming.
                if not new_events:
                    r = (
                        s.query(RunModel)
                        .filter(
                            RunModel.id == run_id, RunModel.user_id == current_user.id
                        )
                        .first()
                    )
                    if r and r.status in {"success", "error", "cancelled"}:
                        return

            now = time.time()
            if now - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
                last_heartbeat = now
                hb = {
                    "type": "heartbeat",
                    "ts": _dt_to_iso_z(datetime.now(timezone.utc)),
                    "created_at": _dt_to_iso_z(datetime.now(timezone.utc)),
                    "request_id": run.request_id,
                    "payload": {"request_id": run.request_id},
                    "message": "heartbeat",
                }
                if framed:
                    yield (
                        f"event: heartbeat\n"
                        f"data: {json.dumps(hb, ensure_ascii=False)}\n\n"
                    ).encode("utf-8")
                else:
                    yield f"data: {json.dumps(hb, ensure_ascii=False)}\n\n".encode(
                        "utf-8"
                    )

            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
