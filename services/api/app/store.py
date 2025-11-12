import time
import uuid
from typing import Any, Dict, List


def ts() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


RUNS: Dict[str, Dict[str, Any]] = {}
EVENTS: Dict[str, List[dict]] = {}


def new_run(source: str, model: str | None = None) -> dict:
    run_id = f"r_{uuid.uuid4().hex[:10]}"
    request_id = f"req_{uuid.uuid4().hex[:10]}"
    now = ts()
    RUNS[run_id] = {
        "request_id": request_id,
        "status": "started",
        "started_at": now,
        "source": source,
        "model": model or "unknown",
    }
    EVENTS[run_id] = [{"type": "status", "ts": now, "status": "started"}]
    return {"run_id": run_id, "request_id": request_id, "now": now}
