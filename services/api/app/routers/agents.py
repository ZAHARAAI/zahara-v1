from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..middleware.run_rate_limit import enforce_run_start_rate_limit
from ..models.agent import Agent as AgentModel
from ..models.agent_spec import AgentSpec as AgentSpecModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..models.user import User
from ..services.run_executor import execute_run_via_router

router = APIRouter(prefix="/agents", tags=["agents"])


def _dt_to_iso_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _slugify(name: str) -> str:
    slug = name.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    if not slug:
        slug = "agent"
    return slug


def _new_agent_id() -> str:
    """Generate a stable external agent id (similar to flows)."""
    return "ag_" + uuid4().hex[:10].upper()


def _new_run_id() -> str:
    """Generate a stable external run id."""
    return "run_" + uuid4().hex[:16]


def _new_spec_id() -> str:
    """Generate a stable external agent spec id."""
    return "as_" + uuid4().hex[:16]


# ---------------------------
# Pydantic models (agents)
# ---------------------------


class AgentCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    spec: Dict[str, Any] = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class AgentSpecCreate(BaseModel):
    spec: Dict[str, Any] = Field(default_factory=dict)


class AgentItem(BaseModel):
    id: str
    user_id: int
    name: str
    slug: str
    description: Optional[str] = None
    created_at: str
    updated_at: str


class AgentDetailResponse(BaseModel):
    ok: bool = True
    agent: AgentItem
    spec: Optional[Dict[str, Any]] = None
    spec_version: Optional[int] = None


class AgentListResponse(BaseModel):
    ok: bool = True
    items: List[AgentItem]


# ---------------------------
# Pydantic models (runs)
# ---------------------------


class RunRequest(BaseModel):
    """
    run request payload (used by web/services/job6.ts)
    """

    input: str = Field(..., description="User input or message for the agent.")
    source: str = Field(
        "vibe", description="Run source: vibe | pro | flow | agui | api | clinic"
    )
    config: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional execution config to persist on the run."
    )


class RunResponse(BaseModel):
    ok: bool = True
    run_id: str
    request_id: str


def _to_agent_item(model: AgentModel) -> AgentItem:
    return AgentItem(
        id=model.id,
        user_id=model.user_id,
        name=model.name,
        slug=model.slug,
        description=model.description,
        created_at=_dt_to_iso_z(model.created_at),
        updated_at=_dt_to_iso_z(model.updated_at),
    )


@router.get("", response_model=AgentListResponse)
def list_agents(
    q: Optional[str] = Query(None, description="Optional search query"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentListResponse:
    query = db.query(AgentModel).filter(AgentModel.user_id == current_user.id)
    if q:
        query = query.filter(AgentModel.name.ilike(f"%{q}%"))
    rows = query.order_by(AgentModel.created_at.desc()).all()
    return AgentListResponse(ok=True, items=[_to_agent_item(a) for a in rows])


@router.post("", response_model=AgentDetailResponse)
def create_agent(
    body: AgentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentDetailResponse:
    try:
        name = body.name.strip() if body.name else None
        slug = body.slug.strip() if body.slug else name

        if not name:
            raise HTTPException(
                status_code=400,
                detail={
                    "ok": False,
                    "error": {"code": "INVALID", "message": "name is required"},
                },
            )

        # If agent exists with same user_id and slug -> update agent
        agent = (
            db.query(AgentModel)
            .filter(
                AgentModel.slug == slug,
                AgentModel.user_id == current_user.id,
            )
            .first()
        )

        if agent:
            # update agent fields
            agent.name = name
            agent.slug = _slugify(slug)
            agent.description = body.description.strip() if body.description else None

            # find latest version
            last_spec = (
                db.query(AgentSpecModel)
                .filter(AgentSpecModel.agent_id == agent.id)
                .order_by(desc(AgentSpecModel.version))
                .first()
            )
            next_version = (last_spec.version if last_spec else 0) + 1

            spec_row = AgentSpecModel(
                id=_new_spec_id(),
                agent_id=agent.id,
                version=next_version,
                content=body.spec or {},
            )
            db.add(spec_row)
            db.commit()
            db.refresh(agent)
            db.refresh(spec_row)

            return AgentDetailResponse(
                ok=True,
                agent=_to_agent_item(agent),
                spec=spec_row.content,
                spec_version=spec_row.version,
            )

        # Otherwise: create a brand new agent + spec v1
        agent_id = _new_agent_id()
        agent = AgentModel(
            id=agent_id,
            user_id=current_user.id,
            name=name,
            slug=_slugify(body.slug if body.slug else name),
            description=body.description.strip() if body.description else None,
        )
        db.add(agent)
        db.commit()
        db.refresh(agent)

        spec_row = AgentSpecModel(
            id=_new_spec_id(),
            agent_id=agent.id,
            version=1,
            content=body.spec or {},
        )
        db.add(spec_row)
        db.commit()
        db.refresh(spec_row)

        return AgentDetailResponse(
            ok=True,
            agent=_to_agent_item(agent),
            spec=spec_row.content,
            spec_version=spec_row.version,
        )

    except IntegrityError:
        db.rollback()
        # If two requests race, unique(agent_id, version) can collide
        raise HTTPException(
            status_code=409,
            detail={
                "ok": False,
                "error": {
                    "code": "CONFLICT",
                    "message": "Spec version conflict, retry",
                },
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.get("/{agent_id}", response_model=AgentDetailResponse)
def get_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentDetailResponse:
    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    spec_row = (
        db.query(AgentSpecModel)
        .filter(
            AgentSpecModel.agent_id == agent.id,
        )
        .order_by(AgentSpecModel.version.desc())
        .first()
    )

    return AgentDetailResponse(
        ok=True,
        agent=_to_agent_item(agent),
        spec=spec_row.content if spec_row else None,
        spec_version=spec_row.version if spec_row else None,
    )


@router.patch("/{agent_id}", response_model=AgentDetailResponse)
def update_agent(
    agent_id: str,
    body: AgentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentDetailResponse:
    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(
                status_code=400,
                detail={
                    "ok": False,
                    "error": {"code": "INVALID", "message": "name cannot be empty"},
                },
            )
        agent.name = name
        agent.slug = _slugify(name)

    if body.description is not None:
        agent.description = body.description.strip() if body.description else None

    db.add(agent)
    db.commit()
    db.refresh(agent)

    spec_row = (
        db.query(AgentSpecModel)
        .filter(
            AgentSpecModel.agent_id == agent.id,
        )
        .order_by(AgentSpecModel.version.desc())
        .first()
    )

    return AgentDetailResponse(
        ok=True,
        agent=_to_agent_item(agent),
        spec=spec_row.content if spec_row else None,
        spec_version=spec_row.version if spec_row else None,
    )


@router.post("/{agent_id}/spec", response_model=AgentDetailResponse)
def create_agent_spec_version(
    agent_id: str,
    body: AgentSpecCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentDetailResponse:
    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=404,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    latest = (
        db.query(AgentSpecModel)
        .filter(
            AgentSpecModel.agent_id == agent.id,
        )
        .order_by(AgentSpecModel.version.desc())
        .first()
    )
    next_version = 1 if not latest else int(latest.version) + 1

    spec_row = AgentSpecModel(
        id=_new_spec_id(),
        agent_id=agent.id,
        version=next_version,
        content=body.spec or {},
    )
    db.add(spec_row)
    db.commit()
    db.refresh(spec_row)

    return AgentDetailResponse(
        ok=True,
        agent=_to_agent_item(agent),
        spec=spec_row.content if spec_row else None,
        spec_version=spec_row.version if spec_row else None,
    )


# ---------------------------
# POST /agents/{id}/run  (run pipeline entrypoint)
# ---------------------------


@router.post(
    "/{agent_id}/run",
    response_model=RunResponse,
    dependencies=[Depends(enforce_run_start_rate_limit)],
)
def start_agent_run(
    agent_id: str,
    body: RunRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunResponse:
    """
    run pipeline entrypoint.

    - Creates a run row (pending->running->success|error)
    - Creates initial run events
    - Kicks off background execution via the central router
    - Returns run_id and request_id for SSE subscription
    """
    agent: AgentModel | None = (
        db.query(AgentModel)
        .filter(
            AgentModel.id == agent_id,
            AgentModel.user_id == current_user.id,
        )
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    run_id = _new_run_id()
    request_id = str(uuid4())

    run = RunModel(
        id=run_id,
        agent_id=agent.id,
        user_id=current_user.id,
        request_id=request_id,
        status="pending",
        source=body.source,
        input=body.input,
        config=body.config,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    db.add(
        RunEventModel(
            run_id=run.id,
            type="system",
            payload={"event": "run_created", "request_id": request_id},
        )
    )
    db.commit()

    background_tasks.add_task(execute_run_via_router, run.id)

    return RunResponse(ok=True, run_id=run.id, request_id=request_id)


@router.delete("/{agent_id}")
def delete_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    agent = (
        db.query(AgentModel)
        .filter(AgentModel.id == agent_id, AgentModel.user_id == current_user.id)
        .first()
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Agent not found"},
            },
        )

    # delete run_events for runs of this agent
    run_ids = [
        r[0] for r in db.query(RunModel.id).filter(RunModel.agent_id == agent.id).all()
    ]
    if run_ids:
        db.query(RunEventModel).filter(RunEventModel.run_id.in_(run_ids)).delete(
            synchronize_session=False
        )

    # delete runs
    db.query(RunModel).filter(RunModel.agent_id == agent.id).delete(
        synchronize_session=False
    )

    # delete all agent specs (all versions)
    db.query(AgentSpecModel).filter(AgentSpecModel.agent_id == agent.id).delete(
        synchronize_session=False
    )

    # delete agent
    db.delete(agent)
    db.commit()

    return {"ok": True, "deleted": True}
