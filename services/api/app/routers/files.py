from __future__ import annotations

import hashlib
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import check_auth

router = APIRouter(prefix="/files", tags=["filesystem"])

# Root directory for the Pro IDE / agents.
# You can override this with an env var, for example:
#   AGENTS_ROOT=/workspace/agents
FS_ROOT = Path(os.getenv("AGENTS_ROOT", "agents")).resolve()


def _ensure_root_exists() -> None:
    """Make sure the root directory exists."""
    FS_ROOT.mkdir(parents=True, exist_ok=True)


def _safe_path(rel_path: str) -> Path:
    """
    Resolve a user-supplied relative path safely under FS_ROOT.
    Prevents directory traversal (../../../etc/passwd).
    """
    if rel_path.startswith("/"):
        rel_path = rel_path.lstrip("/")

    target = (FS_ROOT / rel_path).resolve()
    if not str(target).startswith(str(FS_ROOT)):
        raise HTTPException(
            status_code=400, detail={"ok": False, "error": "invalid path"}
        )
    return target


def _sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


@router.get("/list")
def list_files(token: str = Depends(check_auth)) -> Dict[str, Any]:
    try:
        """
        List files and directories under FS_ROOT.

        Frontend expects items like:
        { path: "agents/hello.ts", type: "file" | "dir", size?, modified? }
        """
        _ensure_root_exists()

        items: List[Dict[str, Any]] = []

        # Walk the tree. For simplicity, we return a flat list (no nested children).
        for p in FS_ROOT.rglob("*"):
            rel_path = p.relative_to(FS_ROOT).as_posix()

            if rel_path == "":
                continue  # skip root

            try:
                stat = p.stat()
                modified = datetime.fromtimestamp(stat.st_mtime).isoformat()
            except OSError:
                modified = None

            if p.is_dir():
                items.append(
                    {
                        "path": rel_path,
                        "type": "dir",
                        "size": None,
                        "modified": modified,
                    }
                )
            elif p.is_file():
                items.append(
                    {
                        "path": rel_path,
                        "type": "file",
                        "size": stat.st_size,
                        "modified": modified,
                    }
                )

        return {"ok": True, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.get("/read")
def read_file(
    path: str = Query(..., description="Relative path under FS_ROOT"),
    token: str = Depends(check_auth),
) -> Dict[str, Any]:
    try:
        """
        Read a single file under FS_ROOT.

        Returns:
        { ok, path, content, sha }
        """
        _ensure_root_exists()
        file_path = _safe_path(path)

        if not file_path.is_file():
            raise HTTPException(
                status_code=404, detail={"ok": False, "error": "file not found"}
            )

        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=400, detail={"ok": False, "error": "file is not UTF-8 text"}
            )

        sha = _sha256(content)
        return {"ok": True, "path": path, "content": content, "sha": sha}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


@router.post("/write")
def write_file(
    body: Dict[str, Any],
    token: str = Depends(check_auth),
) -> Dict[str, Any]:
    try:
        """
        Write a file to FS_ROOT.

        Body:
        {
            "path": "agents/hello.ts",
            "content": "export default ...",
            "sha": "optional previous sha"
        }

        Returns:
        { ok, saved: true, path, sha }
        """
        _ensure_root_exists()

        path = body.get("path")
        content: Optional[str] = body.get("content")
        _ = body.get(
            "sha"
        )  # previous sha (optional; can be used for conflict detection)

        if not path:
            raise HTTPException(
                status_code=400, detail={"ok": False, "error": "path is required"}
            )
        if content is None:
            raise HTTPException(
                status_code=400, detail={"ok": False, "error": "content is required"}
            )

        file_path = _safe_path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

        sha = _sha256(content)
        return {"ok": True, "saved": True, "path": path, "sha": sha}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})
