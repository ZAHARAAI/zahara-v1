from typing import Any, Dict, Optional

from pydantic import BaseModel


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
