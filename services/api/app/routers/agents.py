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
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.agent import Agent as AgentModel
from ..models.agent_spec import AgentSpec as AgentSpecModel
from ..models.run import Run as RunModel
from ..models.run_event import RunEvent as RunEventModel
from ..models.user import User
from ..services.run_executor import execute_run_via_router

router = APIRouter(prefix="/agents", tags=["agents"])


# ---------------------------
# Helpers
# ---------------------------


def _dt_to_iso_z(dt: Optional[datetime]) -> str:
    """
    Convert a datetime to an ISO 8601 string with Z suffix.
    Mirrors the helper used in flows.py.
    """
    if dt is None:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


_slug_re = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    slug = _slug_re.sub("-", name.lower()).strip("-")
    return slug or "agent"


def _generate_unique_slug(db: Session, user_id: int, name: str) -> str:
    base = _slugify(name)
    slug = base
    i = 2
    while (
        db.query(AgentModel)
        .filter(AgentModel.user_id == user_id, AgentModel.slug == slug)
        .first()
        is not None
    ):
        slug = f"{base}-{i}"
        i += 1
    return slug


def _new_agent_id() -> str:
    """Generate a stable external agent id (similar to flows)."""
    # Example style: ag_01HZX8W7J2
    return "ag_" + uuid4().hex[:10].upper()


def _new_run_id() -> str:
    """Generate a stable external run id."""
    return "run_" + uuid4().hex[:16]


# ---------------------------
# Pydantic models (agents)
# ---------------------------


class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    # Initial spec content (Vibe/Pro/Flow unified spec)
    spec: Dict[str, Any] = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class AgentSpecCreate(BaseModel):
    # New spec content; version is auto-incremented on the backend
    content: Dict[str, Any] = Field(default_factory=dict)


class Agent(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    createdAt: str
    updatedAt: str
    # Latest spec metadata
    version: Optional[int] = None
    spec: Optional[Dict[str, Any]] = None


class AgentListItem(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    updatedAt: str
    version: Optional[int] = None


class AgentListResponse(BaseModel):
    ok: bool = True
    items: List[AgentListItem]
    page: int
    pageSize: int
    total: int


class AgentEnvelope(BaseModel):
    ok: bool = True
    agent: Agent


class AgentSpecEnvelope(BaseModel):
    ok: bool = True
    agentId: str
    version: int


# ---------------------------
# Pydantic models (runs – Job 6)
# ---------------------------


class RunRequest(BaseModel):
    """
    Run start payload.

    For Job 6 we care about:
    - input: user message or payload
    - source: where the run was triggered from (vibe | pro | flow | agui | api | clinic)
    - config: optional execution config (stored on the run row)
    """

    input: str = Field(..., description="User input or message for the agent.")
    source: str = Field(
        "vibe",
        description="Run source: vibe | pro | flow | agui | api | clinic",
    )
    config: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional execution config to persist on the run."
    )


class RunResponse(BaseModel):
    ok: bool = True
    run_id: str
    request_id: str


# ---------------------------
# Internal mapping helpers
# ---------------------------


def _agent_with_latest_spec(db: Session, agent: AgentModel) -> Agent:
    """
    Load the latest spec for a single agent and map to API model.
    """
    latest_spec: Optional[AgentSpecModel] = (
        db.query(AgentSpecModel)
        .filter(AgentSpecModel.agent_id == agent.id)
        .order_by(AgentSpecModel.version.desc())
        .first()
    )

    created_at = agent.created_at
    updated_at = agent.updated_at or agent.created_at

    return Agent(
        id=agent.id,
        name=agent.name,
        slug=agent.slug,
        description=agent.description,
        createdAt=_dt_to_iso_z(created_at),
        updatedAt=_dt_to_iso_z(updated_at),
        version=latest_spec.version if latest_spec else None,
        spec=latest_spec.content if latest_spec else None,
    )


def _agent_to_list_item(
    agent: AgentModel,
    latest_versions_by_id: Dict[str, int],
) -> AgentListItem:
    updated_at = agent.updated_at or agent.created_at
    return AgentListItem(
        id=agent.id,
        name=agent.name,
        slug=agent.slug,
        description=agent.description,
        updatedAt=_dt_to_iso_z(updated_at),
        version=latest_versions_by_id.get(agent.id),
    )


def _create_initial_run_event(db: Session, run: RunModel, body: RunRequest) -> None:
    """
    Create initial run_events row when a run starts.
    This will be augmented by the router (token events, tool calls, etc.).
    """
    evt = RunEventModel(
        run_id=run.id,
        type="log",
        payload={
            "message": "Run started",
            "input": body.input,
            "source": body.source,
        },
    )
    db.add(evt)
    db.commit()


def _start_run_record(
    db: Session,
    *,
    current_user: User,
    agent: AgentModel,
    body: RunRequest,
    request_id: Optional[str] = None,
) -> RunModel:
    """
    Create the Run row and initial events.

    Actual LLM execution will be handled by the centralized router (Job 6 Step 4).
    """
    run_id = _new_run_id()
    if not request_id:
        request_id = str(uuid4())

    # These will later be populated from the router / agent spec
    model = None
    provider = None

    run = RunModel(
        id=run_id,
        agent_id=agent.id,
        user_id=current_user.id,
        request_id=request_id,
        status="running",
        model=model,
        provider=provider,
        source=body.source,
        latency_ms=None,
        tokens_in=None,
        tokens_out=None,
        tokens_total=None,
        cost_estimate_usd=None,
        error_message=None,
        # Persist input + any extra config so the executor can reconstruct the call
        config={
            "input": body.input,
            "source": body.source,
            "config": body.config or {},
        },
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    _create_initial_run_event(db, run, body)
    return run


# ---------------------------
# Routes – Agents CRUD + Specs
# ---------------------------


@router.get("/", response_model=AgentListResponse)
def list_agents(
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List agents for the current user with pagination.
    """
    try:
        q = db.query(AgentModel).filter(AgentModel.user_id == current_user.id)

        total = q.count()
        agents = (
            q.order_by(AgentModel.updated_at.desc())
            .offset((page - 1) * pageSize)
            .limit(pageSize)
            .all()
        )

        if not agents:
            return AgentListResponse(
                ok=True, items=[], page=page, pageSize=pageSize, total=total
            )

        # Fetch latest version per agent for the list view
        agent_ids = [a.id for a in agents]
        specs_rows = (
            db.query(AgentSpecModel.agent_id, AgentSpecModel.version)
            .filter(AgentSpecModel.agent_id.in_(agent_ids))
            .all()
        )
        latest_versions: Dict[str, int] = {}
        for agent_id, version in specs_rows:
            if agent_id not in latest_versions or version > latest_versions[agent_id]:
                latest_versions[agent_id] = version

        items = [
            _agent_to_list_item(a, latest_versions_by_id=latest_versions)
            for a in agents
        ]

        return AgentListResponse(
            ok=True, items=items, page=page, pageSize=pageSize, total=total
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.post("/", response_model=AgentEnvelope, status_code=status.HTTP_201_CREATED)
def create_agent(
    payload: AgentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new agent for the current user, along with its initial spec.
    """
    try:
        agent_id = _new_agent_id()
        slug = _generate_unique_slug(db, user_id=current_user.id, name=payload.name)

        db_agent = AgentModel(
            id=agent_id,
            user_id=current_user.id,
            name=payload.name,
            slug=slug,
            description=payload.description,
        )
        db.add(db_agent)
        db.flush()  # ensure agent row exists before we create spec

        # Initial spec version (if provided, otherwise empty dict)
        initial_content: Dict[str, Any] = payload.spec or {}
        db_spec = AgentSpecModel(
            id=str(uuid4()),
            agent_id=agent_id,
            version=1,
            content=initial_content,
        )
        db.add(db_spec)

        db.commit()
        db.refresh(db_agent)

        agent_api = _agent_with_latest_spec(db, db_agent)
        return AgentEnvelope(ok=True, agent=agent_api)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.get("/{agent_id}", response_model=AgentEnvelope)
def get_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Load a single agent (metadata + latest spec) for the current user.
    """
    try:
        db_agent = (
            db.query(AgentModel)
            .filter(
                AgentModel.id == agent_id,
                AgentModel.user_id == current_user.id,
            )
            .first()
        )
        if not db_agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "Agent not found"},
                },
            )

        agent_api = _agent_with_latest_spec(db, db_agent)
        return AgentEnvelope(ok=True, agent=agent_api)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.put("/{agent_id}", response_model=dict)
def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update agent metadata (name, description) for the current user.
    """
    try:
        db_agent = (
            db.query(AgentModel)
            .filter(
                AgentModel.id == agent_id,
                AgentModel.user_id == current_user.id,
            )
            .first()
        )
        if not db_agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "Agent not found"},
                },
            )

        if payload.name is not None and payload.name.strip():
            db_agent.name = payload.name
            # Optionally keep slug stable; if you want slug to follow name:
            # db_agent.slug = _generate_unique_slug(db, current_user.id, payload.name)
        if payload.description is not None:
            db_agent.description = payload.description

        db.add(db_agent)
        db.commit()
        db.refresh(db_agent)

        return {"ok": True, "updated": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.post("/{agent_id}/spec", response_model=AgentSpecEnvelope)
def create_agent_spec(
    agent_id: str,
    payload: AgentSpecCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new spec version for an existing agent.

    - Ensures the agent belongs to the current user
    - Auto-increments version number
    """
    try:
        db_agent = (
            db.query(AgentModel)
            .filter(
                AgentModel.id == agent_id,
                AgentModel.user_id == current_user.id,
            )
            .first()
        )
        if not db_agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "ok": False,
                    "error": {"code": "NOT_FOUND", "message": "Agent not found"},
                },
            )

        # Determine next version
        last_spec: Optional[AgentSpecModel] = (
            db.query(AgentSpecModel)
            .filter(AgentSpecModel.agent_id == agent_id)
            .order_by(AgentSpecModel.version.desc())
            .first()
        )
        next_version = 1 if last_spec is None else last_spec.version + 1

        db_spec = AgentSpecModel(
            id=str(uuid4()),
            agent_id=agent_id,
            version=next_version,
            content=payload.content or {},
        )
        db.add(db_spec)
        db.commit()

        return AgentSpecEnvelope(
            ok=True,
            agentId=agent_id,
            version=next_version,
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


# ---------------------------
# Job 6: POST /agents/{id}/run  (run pipeline entrypoint)
# ---------------------------


@router.post("/{agent_id}/run", response_model=RunResponse)
def start_agent_run(
    agent_id: str,
    body: RunRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RunResponse:
    """
    Job 6 run pipeline entrypoint.

    - Validates the agent belongs to the current user
    - Creates a runs row with status=running
    - Emits initial run_events (log)
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

    run = _start_run_record(db, current_user=current_user, agent=agent, body=body)

    # Background execution via the central router executor
    background_tasks.add_task(execute_run_via_router, run.id)

    return RunResponse(ok=True, run_id=run.id, request_id=run.request_id)
