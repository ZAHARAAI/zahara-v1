import os
import subprocess
from datetime import datetime
from fastapi import APIRouter

from ..config import settings

router = APIRouter(prefix="/version", tags=["version"])

def get_git_commit_hash():
    """Get the current git commit hash"""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(__file__)
        )
        if result.returncode == 0:
            return result.stdout.strip()[:8]  # Short hash
    except Exception:
        pass
    return "unknown"

def get_git_commit_timestamp():
    """Get the current git commit timestamp"""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%ct"],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(__file__)
        )
        if result.returncode == 0:
            timestamp = int(result.stdout.strip())
            return datetime.fromtimestamp(timestamp).isoformat()
    except Exception:
        pass
    return datetime.now().isoformat()

@router.get("/")
async def get_version():
    """Get application version information including git SHA and timestamp"""
    git_hash = get_git_commit_hash()
    git_timestamp = get_git_commit_timestamp()
    
    return {
        "app_name": settings.app_name,
        "version": settings.app_version,
        "company": settings.company_name,
        "git_hash": git_hash,
        "git_timestamp": git_timestamp,
        "build_timestamp": datetime.now().isoformat(),
        "environment": "development" if settings.debug else "production"
    }
