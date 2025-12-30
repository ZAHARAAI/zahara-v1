from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..models.user import User

router = APIRouter(prefix="/runs", tags=["runs"])

HEARTBEAT_INTERVAL_SECONDS = 180


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

    run.status = "cancelled"
    run.error_message = "Cancelled by user"
    db.add(run)
    db.commit()

    _create_event(
        db,
        run.id,
        "cancelled",
        {"message": "Cancelled by user", "request_id": run.request_id},
    )

    return RunCancelResponse(ok=True, run_id=run.id, status=run.status)


@router.delete("/{run_id}", response_model=RunDeleteResponse)
def delete_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunDeleteResponse:
    # Ensure the run belongs to the current user (isolation)
    run = (
        db.query(RunModel)
        .filter(RunModel.id == run_id, RunModel.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="run_not_found")

    try:
        # Delete related run events first (avoid FK violations)
        deleted_events = (
            db.query(RunEventModel)
            .filter(RunEventModel.run_id == run_id)
            .delete(synchronize_session=False)
        )

        # Then delete the run itself
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
    framed: bool = Query(False, description="If true, emit SSE 'event:' lines"),
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
        last_id = 0
        last_ping = time.time()

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
                    yield f"event: {ev.type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode(
                        "utf-8"
                    )
                else:
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode(
                        "utf-8"
                    )

                # Terminal events (stop stream)
                if ev.type in {"done", "error", "cancelled"}:
                    return

            now = time.time()
            if now - last_ping >= HEARTBEAT_INTERVAL_SECONDS:
                last_ping = now
                ping = {
                    "type": "ping",
                    "ts": _dt_to_iso_z(datetime.now(timezone.utc)),
                    "created_at": _dt_to_iso_z(datetime.now(timezone.utc)),
                    "request_id": run.request_id,
                    "payload": {"request_id": run.request_id},
                    "message": "ping",
                }
                if framed:
                    yield f"event: ping\ndata: {json.dumps(ping, ensure_ascii=False)}\n\n".encode(
                        "utf-8"
                    )
                else:
                    yield f"data: {json.dumps(ping, ensure_ascii=False)}\n\n".encode(
                        "utf-8"
                    )

            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
