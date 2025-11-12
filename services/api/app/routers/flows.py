from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from ..auth import check_auth

router = APIRouter(prefix="/flows")
FLOWS: Dict[str, Dict[str, Any]] = {}


def now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


@router.post("")
def create_flow(body: Dict[str, Any], token: str = Depends(check_auth)):
    fid = "flow_" + now_iso().replace(":", "").replace("-", "").replace("Z", "")[-10:]
    flow = {
        "id": fid,
        "name": body.get("name", "Untitled"),
        "graph": body.get("graph", {"nodes": [], "edges": []}),
        "updatedAt": now_iso(),
    }
    FLOWS[fid] = flow
    return {"ok": True, "flow": flow}


@router.get("/{fid}")
def get_flow(fid: str, token: str = Depends(check_auth)):
    if fid not in FLOWS:
        raise HTTPException(404, "flow not found")
    return {"ok": True, "flow": FLOWS[fid]}


@router.put("/{fid}")
def update_flow(fid: str, body: Dict[str, Any], token: str = Depends(check_auth)):
    if fid not in FLOWS:
        raise HTTPException(404, "flow not found")
    FLOWS[fid]["name"] = body.get("name", FLOWS[fid]["name"])
    FLOWS[fid]["graph"] = body.get("graph", FLOWS[fid]["graph"])
    FLOWS[fid]["updatedAt"] = now_iso()
    return {"ok": True, "updated": True}


@router.get("")
def list_flows(
    owner: str = "me",
    page: int = 1,
    pageSize: int = 20,
    token: str = Depends(check_auth),
):
    items = [
        {"id": f["id"], "name": f["name"], "updatedAt": f["updatedAt"]}
        for f in FLOWS.values()
    ]
    return {
        "ok": True,
        "items": items,
        "page": page,
        "pageSize": pageSize,
        "total": len(items),
    }
