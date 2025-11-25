from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.run import Run
from ..models.run_event import RunEvent

router = APIRouter(prefix="/events", tags=["events"])


def _isoformat(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


async def _event_stream(db: Session, run_id: str) -> AsyncGenerator[str, None]:
    """Server-Sent Events (SSE) stream for a run.

    Behavior:
    - Keep the connection open while the run is active.
    - Emit a heartbeat event on a fixed interval (15s here), which is
      well under the 3-minute heartbeat.
    - When the run status becomes "succeeded" or "failed", emit a
      final "done" event and close the stream.
    """
    # Make sure the run exists at the start
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        # Yield a single error event then stop
        error_event = {"type": "error", "error": "run_not_found", "runId": run_id}
        yield "event: error\n"
        yield f"data: {json.dumps(error_event)}\n\n"
        return

    last_event_id: int | None = None
    heartbeat_interval = 15  # seconds – comfortably < 3 minutes

    while True:
        # Fetch any new events for this run
        query = (
            db.query(RunEvent)
            .filter(RunEvent.run_id == run_id)
            .order_by(RunEvent.id.asc())
        )
        if last_event_id is not None:
            query = query.filter(RunEvent.id > last_event_id)

        new_events = query.all()

        for ev in new_events:
            last_event_id = ev.id
            ts = _isoformat(ev.ts or datetime.now(timezone.utc))
            payload = ev.payload or {}

            event_body = {
                "type": ev.type,
                "ts": ts,
                "runId": run_id,
                **payload,
            }

            event_type = ev.type or payload.get("type", "log")
            yield f"event: {event_type}\n"
            yield f"data: {json.dumps(event_body)}\n\n"

        # Heartbeat event – sent every loop, regardless of new data.
        hb_body = {
            "type": "heartbeat",
            "runId": run_id,
            "ts": _isoformat(datetime.now(timezone.utc)),
        }
        yield "event: heartbeat\n"
        yield f"data: {json.dumps(hb_body)}\n\n"

        # Wait for the heartbeat interval
        await asyncio.sleep(heartbeat_interval)

        # Refresh run status
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            error_event = {"type": "error", "error": "run_deleted", "runId": run_id}
            yield "event: error\n"
            yield f"data: {json.dumps(error_event)}\n\n"
            break

        if run.status in ("succeeded", "failed"):
            done_body = {
                "type": "done",
                "status": run.status,
                "runId": run_id,
                "requestId": run.request_id,
                "finishedAt": _isoformat(run.finished_at) if run.finished_at else None,
            }
            yield "event: done\n"
            yield f"data: {json.dumps(done_body)}\n\n"
            break


@router.get("/{run_id}")
async def stream_run_events(
    run_id: str,
    # token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    """SSE endpoint used by Pro/Clinic to stream run events.

    Client-side usage typically looks like:

        const es = new EventSource(`/events/${runId}`);
        es.addEventListener("log", ...);
        es.addEventListener("metric", ...);
        es.addEventListener("status", ...);
        es.addEventListener("heartbeat", ...);
        es.addEventListener("done", ...);

    """
    try:
        generator = _event_stream(db, run_id)
        return StreamingResponse(generator, media_type="text/event-stream")
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})
