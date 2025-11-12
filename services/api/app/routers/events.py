from fastapi import APIRouter, Depends

from ..auth import check_auth
from ..sse import sse_response

router = APIRouter()


@router.get("/events/{run_id}")
async def stream_events(run_id: str, token: str = Depends(check_auth)):
    return sse_response(run_id)
