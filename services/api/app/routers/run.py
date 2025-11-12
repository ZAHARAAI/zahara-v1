import asyncio

from fastapi import APIRouter, Depends

from ..auth import check_auth
from ..run_models import RunRequest, RunResponse
from ..store import EVENTS, RUNS, new_run, ts

router = APIRouter()


@router.post("/run", response_model=RunResponse)
async def start_run(body: RunRequest, token: str = Depends(check_auth)):
    ids = new_run(source=body.source, model=body.model)
    run_id = ids["run_id"]
    request_id = ids["request_id"]
    asyncio.create_task(simulate_work(run_id))
    return {
        "run_id": run_id,
        "request_id": request_id,
        "status": "started",
        "started_at": ids["now"],
    }


async def simulate_work(run_id: str):
    for i in range(3):
        EVENTS[run_id].append(
            {"type": "log", "ts": ts(), "level": "INFO", "message": f"step {i}"}
        )
        await asyncio.sleep(0.6)
    EVENTS[run_id].append(
        {
            "type": "metric",
            "ts": ts(),
            "latency_ms": 1800,
            "tokens": 900,
            "cost": 0.0023,
        }
    )
    EVENTS[run_id].append({"type": "status", "ts": ts(), "status": "succeeded"})
    RUNS[run_id]["status"] = "succeeded"
    RUNS[run_id]["ended_at"] = ts()
