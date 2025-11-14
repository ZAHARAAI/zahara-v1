from typing import Any, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import check_auth
from ..database import get_db
from ..models.flow import Flow

router = APIRouter(prefix="/flows", tags=["flows"])


class FlowGraph(BaseModel):
    nodes: List[Any]
    edges: List[Any]


class FlowCreate(BaseModel):
    name: str
    graph: FlowGraph


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    graph: Optional[FlowGraph] = None


class FlowSummary(BaseModel):
    id: str
    name: str
    updatedAt: str


@router.get("")
def list_flows(
    page: int = 1,
    pageSize: int = 20,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    q = db.query(Flow).order_by(Flow.updated_at.desc())
    total = q.count()
    items = q.offset((page - 1) * pageSize).limit(pageSize).all()
    return {
        "ok": True,
        "items": [
            {
                "id": f.id,
                "name": f.name,
                "updatedAt": f.updated_at.isoformat(),
            }
            for f in items
        ],
        "total": total,
        "page": page,
        "pageSize": pageSize,
    }


@router.get("/{flow_id}")
def get_flow(
    flow_id: str,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    flow = db.query(Flow).get(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return {
        "ok": True,
        "id": flow.id,
        "name": flow.name,
        "graph": flow.graph,
    }


@router.post("")
def create_flow(
    body: FlowCreate,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    flow = Flow(
        id=str(uuid4()),
        name=body.name,
        graph=body.graph.dict(),
    )
    db.add(flow)
    db.commit()
    db.refresh(flow)
    return {
        "ok": True,
        "id": flow.id,
        "name": flow.name,
        "graph": flow.graph,
    }


@router.put("/{flow_id}")
def update_flow(
    flow_id: str,
    body: FlowUpdate,
    token: str = Depends(check_auth),
    db: Session = Depends(get_db),
):
    flow = db.query(Flow).get(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    if body.name is not None:
        flow.name = body.name
    if body.graph is not None:
        flow.graph = body.graph.dict()

    db.add(flow)
    db.commit()
    db.refresh(flow)
    return {
        "ok": True,
        "id": flow.id,
        "name": flow.name,
        "graph": flow.graph,
    }
