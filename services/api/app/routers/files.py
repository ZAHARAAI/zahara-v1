from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from ..auth import check_auth

router = APIRouter(prefix="/files")
FILES: Dict[str, Dict[str, Any]] = {
    "agents/hello.ts": {
        "content": "export default async function(){ return 'hi' }",
        "sha": "e3b0c442...",
    }
}


@router.get("")
def list_files(token: str = Depends(check_auth)):
    files = [
        {"path": p, "type": "file", "size": len(v.get("content", ""))}
        for p, v in FILES.items()
    ]
    files.append({"path": "agents", "type": "dir"})
    return {"ok": True, "files": files}


@router.get("/{path:path}")
def get_file(path: str, token: str = Depends(check_auth)):
    if path not in FILES:
        raise HTTPException(404, "file not found")
    v = FILES[path]
    return {"ok": True, "path": path, "content": v["content"], "sha": v["sha"]}


@router.put("/{path:path}")
def save_file(path: str, body: Dict[str, Any], token: str = Depends(check_auth)):
    content = body.get("content", "")
    sha = body.get("sha", "unknown")
    FILES[path] = {"content": content, "sha": sha}
    return {"ok": True, "saved": True, "sha": sha}
