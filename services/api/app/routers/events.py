from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..auth import check_auth
from ..database import get_db
from ..models.run import Run
from ..models.run_event import RunEvent

router = APIRouter(prefix="/events", tags=["events"])


def _sse_event(event: str | None, data: dict) -> str:
    """
    Format an SSE event string.
    If event is None, it's a default unnamed event.
    """
    payload = json.dumps(data, default=str)
    if event:
        return f"event: {event}\ndata: {payload}\n\n"
    else:
        return f"data: {payload}\n\n"


async def _event_stream(
    db: Session,
    run_id: str,
) -> AsyncGenerator[str, None]:
    """
    Very simple implementation:
    - Load all events for the run.
    - Stream them out once.
    - Send 'done' event.
    """

    # Check run exists
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        # Yield a one-off error then end
        yield _sse_event("error", {"error": "run_not_found"})
        return

    # Load events in order
    events = (
        db.query(RunEvent)
        .filter(RunEvent.run_id == run_id)
        .order_by(RunEvent.ts.asc(), RunEvent.id.asc())
        .all()
    )

    for ev in events:
        data = {
            "runId": run_id,
            "type": ev.type,
            "payload": ev.payload,
            "ts": ev.ts.isoformat() if ev.ts else None,
        }
        # Use event type as the SSE event name
        yield _sse_event(ev.type, data)
        # Tiny sleep so it looks "streamy" in the UI
        await asyncio.sleep(0.01)

    # Final "done" event so frontend can close the stream
    yield _sse_event(
        "done",
        {
            "runId": run_id,
            "status": run.status,
        },
    )


@router.get("/{run_id}")
async def stream_run_events(
    run_id: str,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    """
    SSE endpoint used by Pro/Clinic to stream run events.
    """
    generator = _event_stream(db, run_id)
    return StreamingResponse(generator, media_type="text/event-stream")
