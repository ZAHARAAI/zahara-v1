import asyncio
import json

from fastapi.responses import StreamingResponse

from .store import EVENTS, RUNS, ts


async def stream_generator(run_id: str):
    sent = 0
    while True:
        while sent < len(EVENTS.get(run_id, [])):
            e = EVENTS[run_id][sent]
            sent += 1
            etype = e.get("type", "log")
            yield f"event: {etype}\n"
            yield f"data: {json.dumps(e)}\n\n"
        # heartbeat
        yield "event: heartbeat\n"
        yield "data: {}\n\n"
        await asyncio.sleep(15)
        if RUNS.get(run_id, {}).get("status") in ("succeeded", "failed"):
            yield "event: done\n"
            yield f"data: {json.dumps({'status': RUNS[run_id]['status'], 'request_id': RUNS[run_id]['request_id'], 'ended_at': RUNS[run_id].get('ended_at', ts())})}\n\n"
            break


def sse_response(run_id: str) -> StreamingResponse:
    return StreamingResponse(stream_generator(run_id), media_type="text/event-stream")
