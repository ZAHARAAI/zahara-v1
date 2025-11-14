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


# --- Request / response models ---


class RunRequest(BaseModel):
    prompt: Optional[str] = None
    model: Optional[str] = None
    source: Optional[str] = None
    # you can add more fields that your frontend sends:
    # flowId: Optional[str] = None
    # agentId: Optional[str] = None


class RunResponse(BaseModel):
    ok: bool
    runId: str
    requestId: str


@router.post("", response_model=RunResponse)
def start_run(
    body: RunRequest,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
) -> RunResponse:
    """
    Start a new run.

    For now this still simulates events, but they are stored in the DB
    (Run + RunEvent) instead of in-memory dicts.
    """

    run_id = str(uuid4())
    request_id = run_id  # or generate differently if you want

    # 1) Create the Run row with status 'running'
    run = Run(
        id=run_id,
        request_id=request_id,
        status="running",
        model=body.model or "demo-model",
        source=body.source or "pro-ide",
        started_at=datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # 2) Simulate some events (replace with real executor later)
    events: list[RunEvent] = []

    def add_event(event_type: str, payload: Dict[str, Any]) -> None:
        events.append(
            RunEvent(
                run_id=run_id,
                type=event_type,
                payload=payload,
            )
        )

    # status: started
    add_event("status", {"status": "started"})

    # log messages
    add_event("log", {"level": "info", "message": "Run started"})
    if body.prompt:
        add_event("log", {"level": "debug", "message": f"Prompt: {body.prompt}"})
    add_event("log", {"level": "info", "message": "Calling LLM..."})

    # metric event (tokens, cost, latency)
    latency_ms = 180
    tokens = 256
    cost = 0.0008

    add_event(
        "metric",
        {
            "latency_ms": latency_ms,
            "tokens": tokens,
            "cost": cost,
        },
    )

    # status: succeeded
    add_event("status", {"status": "succeeded"})

    # 3) Persist events
    db.add_all(events)
    db.commit()

    # 4) Update run summary fields
    run.status = "succeeded"
    run.tokens = tokens
    run.cost = cost
    run.latency_ms = latency_ms
    run.finished_at = datetime.utcnow()
    db.add(run)
    db.commit()

    return RunResponse(ok=True, runId=run.id, requestId=run.request_id)
