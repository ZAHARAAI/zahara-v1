from __future__ import annotations

import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import check_auth
from ..database import get_db
from ..models.flow import Flow as FlowModel

router = APIRouter(prefix="/flows", tags=["flows"])

# ---------------------------
# Helpers
# ---------------------------


def _now_iso_z() -> str:
    """Return current UTC time in ISO-8601 format with trailing Z."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _dt_to_iso_z(dt: Optional[datetime]) -> str:
    """Convert a datetime to ISO-8601 with trailing Z (UTC)."""
    if dt is None:
        return _now_iso_z()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (
        dt.astimezone(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _new_flow_id() -> str:
    """Generate a stable external flow id."""
    # Example style: flow_01HZX8W7J2
    return "flow_" + uuid4().hex[:10].upper()


# ---------------------------
# Pydantic Models
# ---------------------------


class Graph(BaseModel):
    # Shape is compatible with React Flow: { nodes: [...], edges: [...] }
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
# Internal mapping helpers
# ---------------------------


def _db_flow_to_flow(db_flow: FlowModel) -> Flow:
    """Map SQLAlchemy Flow row to API Flow model."""
    graph_raw: Dict[str, Any] = db_flow.graph or {}
    # Make sure we always have nodes/edges keys
    graph = Graph(
        nodes=graph_raw.get("nodes", []),
        edges=graph_raw.get("edges", []),
    )

    updated_at = db_flow.updated_at or db_flow.created_at
    return Flow(
        id=db_flow.id,
        name=db_flow.name,
        graph=graph,
        updatedAt=_dt_to_iso_z(updated_at),
    )


def _db_flow_to_list_item(db_flow: FlowModel) -> FlowListItem:
    updated_at = db_flow.updated_at or db_flow.created_at
    return FlowListItem(
        id=db_flow.id,
        name=db_flow.name,
        updatedAt=_dt_to_iso_z(updated_at),
    )


# ---------------------------
# Routes
# ---------------------------


@router.get("/", response_model=ListResponse)
def list_flows(
    owner: Optional[str] = Query(default=None, description='e.g. "me"'),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=200),
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    try:
        """
        List flows with pagination.

        NOTE: `owner` is currently not wired to any user identity because
        `check_auth` only validates a shared demo token. The column
        `owner_id` exists on the flows table and can be connected later
        when you have per-user auth.
        """
        query = db.query(FlowModel)

        # In the future, you can filter by owner_id here once you have
        # a real user identity associated with the token.
        # if owner == "me":
        #     query = query.filter(FlowModel.owner_id == current_user.id)

        total = query.count()

        flows = (
            query.order_by(
                FlowModel.updated_at.desc().nullslast(),
                FlowModel.created_at.desc().nullslast(),
            )
            .offset((page - 1) * pageSize)
            .limit(pageSize)
            .all()
        )

        items = [_db_flow_to_list_item(f) for f in flows]

        return ListResponse(
            ok=True, items=items, page=page, pageSize=pageSize, total=total
        )
    except Exception as e:
        # capture full traceback for logs
        tb = traceback.format_exc()

        # return safe json error to frontend
        raise HTTPException(
            status_code=500,
            detail={
                "error": str(e),
                "trace": tb,  # remove this in production if needed
            },
        )


@router.post("/", response_model=FlowEnvelope, status_code=status.HTTP_201_CREATED)
def create_flow(
    payload: FlowCreate,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    """
    Create a new flow backed by the database.
    """
    flow_id = _new_flow_id()

    db_flow = FlowModel(
        id=flow_id,
        name=payload.name,
        graph=payload.graph.dict(),  # store as JSONB
        # owner_id can be wired later when you have a per-user auth system
    )

    db.add(db_flow)
    db.commit()
    db.refresh(db_flow)

    return FlowEnvelope(ok=True, flow=_db_flow_to_flow(db_flow))


@router.get("/{flow_id}", response_model=FlowEnvelope)
def get_flow(
    flow_id: str,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    """
    Fetch a single flow by id.
    """
    db_flow = db.query(FlowModel).filter(FlowModel.id == flow_id).first()
    if not db_flow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Flow not found"},
            },
        )

    return FlowEnvelope(ok=True, flow=_db_flow_to_flow(db_flow))


@router.put("/{flow_id}", response_model=OkUpdated)
def update_flow(
    flow_id: str,
    payload: FlowUpdate,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    """
    Update flow name and/or graph.
    """
    db_flow = db.query(FlowModel).filter(FlowModel.id == flow_id).first()
    if not db_flow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Flow not found"},
            },
        )

    if payload.name is not None:
        db_flow.name = payload.name
    if payload.graph is not None:
        db_flow.graph = payload.graph.dict()

    # SQLAlchemy + DB will update updated_at for us (onupdate=func.now())
    db.add(db_flow)
    db.commit()
    db.refresh(db_flow)

    return OkUpdated(ok=True, updated=True)
