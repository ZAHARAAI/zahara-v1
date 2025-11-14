from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import check_auth
from ..database import get_db
from ..models.run import Run
from ..models.run_event import RunEvent

router = APIRouter(prefix="/run", tags=["run"])


class RunRequest(BaseModel):
    prompt: Optional[str] = None
    model: Optional[str] = None
    source: Optional[str] = None
    flowId: Optional[str] = None
    entry: Optional[str] = None
    code: Optional[str] = None


class RunResponse(BaseModel):
    ok: bool
    runId: str
    requestId: str


def _launch_run(body: RunRequest, db: Session) -> RunResponse:
    """
    Create a Run + RunEvent rows from a RunRequest.
    Used by /run and by Clinic replay.
    """

    run_id = str(uuid4())
    request_id = run_id  # or something else if you want stable external ids

    config: Dict[str, Any] = body.dict()

    run = Run(
        id=run_id,
        request_id=request_id,
        status="running",
        model=body.model or "demo-model",
        source=body.source or "pro-ide",
        started_at=datetime.utcnow(),
        config=config,  # 👈 store config for replay
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    events: list[RunEvent] = []

    def add_event(event_type: str, payload: Dict[str, Any]) -> None:
        events.append(
            RunEvent(
                run_id=run_id,
                type=event_type,
                payload=payload,
            )
        )

    # --- demo events (replace with real executor later) ---
    add_event("status", {"status": "started"})
    add_event(
        "log",
        {
            "level": "info",
            "message": f"Run started (source={run.source}, model={run.model})",
        },
    )
    if body.prompt:
        add_event("log", {"level": "debug", "message": f"Prompt: {body.prompt}"})

    latency_ms = 180
    tokens = 256
    cost = 0.0008

    add_event("metric", {"latency_ms": latency_ms, "tokens": tokens, "cost": cost})
    add_event("status", {"status": "succeeded"})
    # ------------------------------------------------------

    db.add_all(events)
    db.commit()

    run.status = "succeeded"
    run.tokens = tokens
    run.cost = cost
    run.latency_ms = latency_ms
    run.finished_at = datetime.utcnow()
    db.add(run)
    db.commit()

    return RunResponse(ok=True, runId=run.id, requestId=run.request_id)


@router.post("", response_model=RunResponse)
def start_run(
    body: RunRequest,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
) -> RunResponse:
    return _launch_run(body, db)
