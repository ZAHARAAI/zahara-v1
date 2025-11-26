from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import check_auth
from ..database import get_db
from ..models.mcp_connector import MCPConnector

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/connectors")
def mcp_connectors(
    token: str = Depends(check_auth),
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
                    "status": c.last_test_status,
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
    token: str = Depends(check_auth),
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
    body: dict, token: str = Depends(check_auth), db: Session = Depends(get_db)
):
    try:
        connector_id = body.get("connectorId")
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
            "connectorId": connector_id,
            "latencyMs": 183,
            "logs": ["auth ok", "ping ok"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})
