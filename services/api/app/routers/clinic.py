from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import check_auth
from ..database import get_db
from ..models.run import Run
from ..models.run_event import RunEvent
from .run import RunRequest, RunResponse, _launch_run

router = APIRouter(prefix="/clinic", tags=["clinic"])


@router.get("/sessions")
def list_sessions(
    limit: int = 50,
    offset: int = 0,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        """
        List recent run sessions for the Clinic UI.
        """

        q = db.query(Run).order_by(Run.started_at.desc())
        total = q.count()
        runs: List[Run] = q.offset(offset).limit(limit).all()

        items: List[Dict[str, Any]] = []
        for r in runs:
            items.append(
                {
                    "requestId": r.request_id,
                    "runId": r.id,
                    "status": r.status,
                    "model": r.model,
                    "source": r.source,
                    "tokens": r.tokens,
                    "cost": r.cost,
                    "latencyMs": r.latency_ms,
                    "startedAt": r.started_at.isoformat() if r.started_at else None,
                    "finishedAt": r.finished_at.isoformat() if r.finished_at else None,
                }
            )

        return {"ok": True, "total": total, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.get("/session/{request_id}")
def get_session(
    request_id: str,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        """
        Return details for a single session (run) including all events.
        """

        run: Run | None = (
            db.query(Run)
            .filter(Run.request_id == request_id)
            .order_by(Run.started_at.desc())
            .first()
        )
        if not run:
            raise HTTPException(
                status_code=404, detail={"ok": False, "error": "session not found"}
            )

        events: List[RunEvent] = (
            db.query(RunEvent)
            .filter(RunEvent.run_id == run.id)
            .order_by(RunEvent.ts.asc(), RunEvent.id.asc())
            .all()
        )

        event_payloads: List[Dict[str, Any]] = []
        for ev in events:
            event_payloads.append(
                {
                    "type": ev.type,
                    "payload": ev.payload,
                    "ts": ev.ts.isoformat() if ev.ts else None,
                }
            )

        summary = {
            "status": run.status,
            "latency_ms": run.latency_ms,
            "tokens": run.tokens,
            "cost": run.cost,
            "model": run.model,
            "source": run.source,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        }

        return {
            "ok": True,
            "session": {
                "request_id": run.request_id,
                "run_id": run.id,
                "events": event_payloads,
                "summary": summary,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.post("/replay/{request_id}", response_model=RunResponse)
def replay_session(
    request_id: str,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
) -> RunResponse:
    try:
        """
        Start a new run using the stored config from a previous run.
        """

        original: Run | None = (
            db.query(Run)
            .filter(Run.request_id == request_id)
            .order_by(Run.started_at.asc())
            .first()
        )
        if not original:
            raise HTTPException(
                status_code=404, detail={"ok": False, "error": "session not found"}
            )

        if not original.config:
            raise HTTPException(
                status_code=400,
                detail={"ok": False, "error": "session has no stored config to replay"},
            )

        body = RunRequest(**original.config)
        return _launch_run(body, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})
