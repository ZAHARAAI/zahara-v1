from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import check_auth
from ..database import get_db
from ..models.run import Run
from ..models.run_event import RunEvent

router = APIRouter(prefix="/run", tags=["run"])


class RunRequest(BaseModel):
    source: str
    payload: Dict[str, Any]
    model: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class RunResponse(BaseModel):
    run_id: str
    request_id: str
    status: str
    started_at: str


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _launch_run(body: RunRequest, db: Session) -> RunResponse:
    """Create a Run row and seed its initial status event.

    Shared by:
    - POST /run
    - /clinic/replay/{run_id} (imports _launch_run)
    """
    try:
        run_id = f"r_{uuid4().hex[:10]}"
        request_id = f"req_{uuid4().hex[:10]}"
        now = _now_utc()

        run = Run(
            id=run_id,
            request_id=request_id,
            status="running",
            model=body.model or "unknown",
            source=body.source,
            config={
                "source": body.source,
                "payload": body.payload,
                "model": body.model,
                "metadata": body.metadata,
            },
            started_at=now,
        )
        db.add(run)
        db.flush()  # make sure run.id is available

        # Initial status event
        status_event = RunEvent(
            run_id=run_id,
            type="status",
            payload={
                "type": "status",
                "status": "started",
                "runId": run_id,
                "requestId": request_id,
                "ts": _isoformat(now),
            },
        )
        db.add(status_event)
        db.commit()

        return RunResponse(
            run_id=run_id,
            request_id=request_id,
            status=run.status,
            started_at=_isoformat(now),
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.post("", response_model=RunResponse)
def start_run(
    body: RunRequest,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
) -> RunResponse:
    """Start a new run."""
    return _launch_run(body, db)
