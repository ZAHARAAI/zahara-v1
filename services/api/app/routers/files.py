from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..models.user import User

router = APIRouter(prefix="/files", tags=["filesystem"])

# Root directory for the Pro IDE / agents.
FS_ROOT = Path(os.getenv("ZAHARA_FS_ROOT", "./data/agents")).resolve()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ensure_root_exists() -> None:
    """
    Make sure FS_ROOT exists and is a directory.

    This is called before any filesystem operation so that:
    - The directory is created on first use.
    - We fail with a clear 500 error if something is badly misconfigured
      (e.g. FS_ROOT points to a regular file instead of a directory).
    """
    if FS_ROOT.exists() and not FS_ROOT.is_dir():
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": f"FS_ROOT is not a directory: {FS_ROOT}",
            },
        )
    FS_ROOT.mkdir(parents=True, exist_ok=True)


def _safe_path(rel_path: str) -> Path:
    """
    Resolve a user-supplied relative path safely under FS_ROOT.

    - Always joins with FS_ROOT.
    - Resolves ".." etc.
    - Rejects paths that would escape FS_ROOT (directory traversal).

    This is critical so users cannot request something like:
      ../../../etc/passwd
    """
    if rel_path.startswith("/"):
        # Normalise: we always work with paths relative to FS_ROOT
        rel_path = rel_path.lstrip("/")

    full = (FS_ROOT / rel_path).resolve()

    try:
        full.relative_to(FS_ROOT)
    except ValueError:
        # Path is outside FS_ROOT → reject
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "error": "Invalid path (must be within workspace root)",
            },
        )

    return full


def _sha256(data: str) -> str:
    """
    Compute a SHA-256 hex digest of the given text content.

    Used by the Pro IDE to track file versions (sha field).
    """
    h = hashlib.sha256()
    h.update(data.encode("utf-8"))
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Pro IDE - File List (GET /files)
# ---------------------------------------------------------------------------


@router.get("", summary="List files in the Pro IDE workspace")
def list_files(
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    List all files and directories under FS_ROOT.
    """
    try:
        _ensure_root_exists()

        files: List[Dict[str, Any]] = []

        # Walk recursively from FS_ROOT
        for p in FS_ROOT.rglob("*"):
            rel_path = p.relative_to(FS_ROOT).as_posix()
            if rel_path == "":
                continue  # skip root itself

            if p.is_dir():
                # Directory: only path + type (to match the spec shape)
                files.append(
                    {
                        "path": rel_path,
                        "type": "dir",
                    }
                )
            elif p.is_file():
                stat = p.stat()
                files.append(
                    {
                        "path": rel_path,
                        "type": "file",
                        "size": stat.st_size,
                    }
                )

        # Sort by path for stable output
        files.sort(key=lambda x: x["path"])

        return {"ok": True, "files": files}
    except HTTPException:
        # pass through explicit errors
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


# ---------------------------------------------------------------------------
# Pro IDE - Get File (GET /files/:path)
# ---------------------------------------------------------------------------


@router.get(
    "/{path:path}",
    summary="Get a single file from the Pro IDE workspace",
)
def read_file(
    path: str,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Read a single file under FS_ROOT.
    """
    try:
        _ensure_root_exists()
        file_path = _safe_path(path)

        if not file_path.is_file():
            raise HTTPException(
                status_code=404,
                detail={"ok": False, "error": "File not found"},
            )

        content = file_path.read_text(encoding="utf-8")
        sha = _sha256(content)

        # Normalised path (relative to FS_ROOT)
        rel_path = file_path.relative_to(FS_ROOT).as_posix()

        return {
            "ok": True,
            "path": rel_path,
            "content": content,
            "sha": sha,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})


# ---------------------------------------------------------------------------
# Pro IDE - Save File (PUT /files/:path)
# ---------------------------------------------------------------------------


class FileSaveRequest(BaseModel):
    content: str
    sha: Optional[str] = None  # previous sha (for future conflict detection, optional)


@router.put(
    "/{path:path}",
    summary="Save a file into the Pro IDE workspace",
)
def save_file(
    path: str,
    body: FileSaveRequest,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Save a file under FS_ROOT.
    """
    try:
        _ensure_root_exists()

        if not path:
            raise HTTPException(
                status_code=400,
                detail={"ok": False, "error": "path is required"},
            )

        # Normalised and safe path
        file_path = _safe_path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # Write file content
        file_path.write_text(body.content, encoding="utf-8")

        new_sha = _sha256(body.content)

        # NOTE: We ignore body.sha for now (no conflict detection),
        # but you could compare it to the current sha if you want
        # optimistic concurrency.

        return {
            "ok": True,
            "saved": True,
            "sha": new_sha,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={"ok": False, "error": str(e)})
