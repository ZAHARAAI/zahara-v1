from fastapi import APIRouter, Depends

from ..auth import check_auth

router = APIRouter(prefix="/mcp")


@router.get("/connectors")
def mcp_connectors(token: str = Depends(check_auth)):
    return {
        "ok": True,
        "connectors": [
            {
                "id": "mcp_openai",
                "name": "OpenAI MCP",
                "enabled": True,
                "status": "ready",
            },
            {
                "id": "mcp_github",
                "name": "GitHub MCP",
                "enabled": False,
                "status": "disabled",
            },
        ],
    }


@router.post("/test")
def mcp_test(body: dict, token: str = Depends(check_auth)):
    return {
        "ok": True,
        "connectorId": body.get("connectorId", "unknown"),
        "latencyMs": 183,
        "logs": ["auth ok", "ping ok"],
    }
