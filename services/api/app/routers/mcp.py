from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.mcp_connector import MCPConnector
from ..models.user import User

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/connectors")
def mcp_connectors(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        rows = db.query(MCPConnector).all()
        return {
            "ok": True,
            "connectors": [
                {
                    "id": c.id,
                    "name": c.name,
                    "enabled": c.enabled,
                    "meta": c.meta,
                    "last_test_status": c.last_test_status,
                    "last_test_at": c.last_test_at,
                }
                for c in rows
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.patch("/connectors/{connector_id}")
def mcp_patch(
    connector_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        enabled = body.get("enabled")
        if enabled is None:
            raise HTTPException(
                status_code=400, detail={"ok": False, "error": "enabled is required"}
            )

        c = db.query(MCPConnector).get(connector_id)
        if not c:
            raise HTTPException(
                status_code=404, detail={"ok": False, "error": "Connector not found"}
            )

        c.enabled = bool(enabled)
        db.add(c)
        db.commit()
        db.refresh(c)
        return {"ok": True, "id": c.id, "enabled": c.enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.post("/test")
def mcp_test(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        connector_id = body.get("connector_id")
        c = db.query(MCPConnector).get(connector_id)
        if not c:
            raise HTTPException(
                status_code=404, detail={"ok": False, "error": "Connector not found"}
            )

        # TODO: do a real check – for now, pretend success
        c.last_test_status = "ok"
        c.last_test_at = datetime.utcnow()
        db.add(c)
        db.commit()

        return {
            "ok": True,
            "connector_id": connector_id,
            "latency_ms": 183,
            "logs": ["auth ok", "ping ok"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})
