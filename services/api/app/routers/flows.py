from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import check_auth

router = APIRouter(prefix="/flows", tags=["flows"])

# ---------------------------
# In-memory store (thread-safe)
# ---------------------------
_flow_lock = threading.Lock()
_flows: Dict[str, "Flow"] = {}


def _now_iso_z() -> str:
    # Example format: 2025-11-02T18:15:03Z
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _new_flow_id() -> str:
    # Example style: flow_01HZX8W7J2
    return "flow_" + uuid4().hex[:10].upper()


# ---------------------------
# Models
# ---------------------------


class Graph(BaseModel):
    nodes: List[Any] = Field(default_factory=list)
    edges: List[Any] = Field(default_factory=list)


class FlowCreate(BaseModel):
    name: str
    graph: Graph


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    graph: Optional[Graph] = None


class Flow(BaseModel):
    id: str
    name: str
    graph: Graph
    updatedAt: str


class FlowListItem(BaseModel):
    id: str
    name: str
    updatedAt: str


class ListResponse(BaseModel):
    ok: bool = True
    items: List[FlowListItem]
    page: int
    pageSize: int
    total: int


class FlowEnvelope(BaseModel):
    ok: bool = True
    flow: Flow


class OkUpdated(BaseModel):
    ok: bool = True
    updated: bool


# ---------------------------
# Routes
# ---------------------------


@router.get("/", response_model=ListResponse)
def test_flows(
    owner: Optional[str] = Query(default=None, description='e.g. "me"'),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=200),
    token: str = Depends(check_auth),
):
    with _flow_lock:
        all_items = [
            FlowListItem(id=f.id, name=f.name, updatedAt=f.updatedAt)
            for f in _flows.values()
        ]
        total = len(all_items)
        start = (page - 1) * pageSize
        end = start + pageSize
        items = all_items[start:end]

    return ListResponse(ok=True, items=items, page=page, pageSize=pageSize, total=total)


@router.post("/", response_model=FlowEnvelope)
def create_flow(
    payload: FlowCreate,
    token: str = Depends(check_auth),
):
    flow = Flow(
        id=_new_flow_id(),
        name=payload.name,
        graph=payload.graph,
        updatedAt=_now_iso_z(),
    )
    with _flow_lock:
        _flows[flow.id] = flow
    return FlowEnvelope(ok=True, flow=flow)


@router.get("/{flow_id}", response_model=FlowEnvelope)
def get_flow(
    flow_id: str,
    token: str = Depends(check_auth),
):
    with _flow_lock:
        flow = _flows.get(flow_id)
    if not flow:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Flow not found"},
            },
        )
    return FlowEnvelope(ok=True, flow=flow)


@router.put("/{flow_id}", response_model=OkUpdated)
def update_flow(
    flow_id: str,
    payload: FlowUpdate,
    token: str = Depends(check_auth),
):
    with _flow_lock:
        flow = _flows.get(flow_id)
        if not flow:
            raise HTTPException(
                status_code=404,
                detail={
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "Flow not found"},
                },
            )

        if payload.name is not None:
            flow.name = payload.name
        if payload.graph is not None:
            flow.graph = payload.graph
        flow.updatedAt = _now_iso_z()
        _flows[flow_id] = flow

    return OkUpdated(ok=True, updated=True)


@router.get("/test")
def list_flows(token: str = Depends(check_auth)):
    return {"ok": True, "source": "zahara-ui"}
