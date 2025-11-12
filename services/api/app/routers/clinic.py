from fastapi import APIRouter, Depends, HTTPException

from ..auth import check_auth
from ..store import EVENTS, RUNS

router = APIRouter(prefix="/clinic")


@router.get("/sessions")
def clinic_sessions(limit: int = 25, offset: int = 0, token: str = Depends(check_auth)):
    items = []
    for run_id, r in list(RUNS.items())[::-1][offset : offset + limit]:
        items.append(
            {
                "request_id": r["request_id"],
                "run_id": run_id,
                "status": r["status"],
                "source": r.get("source", "unknown"),
                "model": r.get("model", "unknown"),
                "latency_ms": (0 if "ended_at" not in r else 1800),
                "attempts": 1,
                "tokens": 900,
                "cost": 0.0023,
                "started_at": r["started_at"],
                "ended_at": r.get("ended_at"),
            }
        )
    return {"items": items, "total": len(RUNS)}


@router.get("/replay/{request_id}")
def clinic_replay(request_id: str, token: str = Depends(check_auth)):
    for run_id, r in RUNS.items():
        if r["request_id"] == request_id:
            ev = EVENTS.get(run_id, [])
            return {
                "request_id": request_id,
                "run_id": run_id,
                "events": ev,
                "summary": {
                    "status": r["status"],
                    "latency_ms": 1800,
                    "tokens": 900,
                    "cost": 0.0023,
                    "model": r.get("model", "unknown"),
                    "source": r.get("source", "unknown"),
                },
            }
    raise HTTPException(404, "request_id not found")
