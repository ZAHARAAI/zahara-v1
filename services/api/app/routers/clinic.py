from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.agent import Agent as AgentModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..models.user import User
from ..services.run_executor import execute_run_via_router

router = APIRouter(prefix="/clinic", tags=["clinic"])


def _session_item(run: RunModel) -> Dict[str, Any]:
    return {
        "request_id": run.request_id,
        "run_id": run.id,
        "agent_id": run.agent_id,
        "status": run.status,
        "model": run.model,
        "provider": run.provider,
        "source": run.source,
        "latency_ms": run.latency_ms,
        "tokens_in": run.tokens_in,
        "tokens_out": run.tokens_out,
        "tokens_total": run.tokens_total,
        "cost_estimate_usd": run.cost_estimate_usd,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None,
        "input": run.input,
    }


@router.get("/sessions")
def list_sessions(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    q = (
        db.query(RunModel)
        .filter(RunModel.user_id == current_user.id)
        .order_by(RunModel.created_at.desc())
    )
    total = q.count()
    runs = q.offset(offset).limit(limit).all()
    return {"ok": True, "total": total, "items": [_session_item(r) for r in runs]}


@router.get("/session/{request_id}")
def get_session(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    run: Optional[RunModel] = (
        db.query(RunModel)
        .filter(RunModel.request_id == request_id, RunModel.user_id == current_user.id)
        .order_by(RunModel.created_at.desc())
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=404, detail={"ok": False, "error": "session not found"}
        )

    events: List[RunEventModel] = (
        db.query(RunEventModel)
        .filter(RunEventModel.run_id == run.id)
        .order_by(RunEventModel.created_at.asc(), RunEventModel.id.asc())
        .all()
    )

    event_payloads: List[Dict[str, Any]] = []
    for ev in events:
        event_payloads.append(
            {
                "type": ev.type,
                "payload": ev.payload,
                "ts": ev.created_at.isoformat() if ev.created_at else None,
            }
        )

    return {
        "ok": True,
        "session": {
            "request_id": run.request_id,
            "run_id": run.id,
            "events": event_payloads,
            "summary": _session_item(run),
        },
    }


@router.post("/replay/{request_id}")
def replay_session(
    request_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Start a new run using the stored config/input from a previous run."""

    original: Optional[RunModel] = (
        db.query(RunModel)
        .filter(RunModel.request_id == request_id, RunModel.user_id == current_user.id)
        .order_by(RunModel.created_at.asc())
        .first()
    )
    if not original:
        raise HTTPException(
            status_code=404, detail={"ok": False, "error": "session not found"}
        )

    # Ensure the original agent still belongs to the user.
    if original.agent_id:
        agent_ok = (
            db.query(AgentModel)
            .filter(
                AgentModel.id == original.agent_id,
                AgentModel.user_id == current_user.id,
            )
            .first()
        )
        if not agent_ok:
            raise HTTPException(
                status_code=404, detail={"ok": False, "error": "agent not found"}
            )

    new_run_id = "run_" + uuid4().hex[:16]
    new_request_id = str(uuid4())
    new_run = RunModel(
        id=new_run_id,
        agent_id=original.agent_id,
        user_id=current_user.id,
        request_id=new_request_id,
        status="pending",
        source=original.source or "clinic",
        input=original.input,
        config=original.config,
    )
    db.add(new_run)
    db.commit()
    db.refresh(new_run)

    db.add(
        RunEventModel(
            run_id=new_run.id,
            type="system",
            payload={
                "event": "run_replay",
                "original_request_id": request_id,
                "request_id": new_request_id,
            },
        )
    )
    db.commit()

    background_tasks.add_task(execute_run_via_router, new_run.id)
    return {"ok": True, "run_id": new_run.id, "request_id": new_request_id}
