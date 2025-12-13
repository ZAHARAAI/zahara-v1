from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.provider_key import ProviderKey as ProviderKeyModel
from ..models.user import User

router = APIRouter(prefix="/provider-keys", tags=["provider-keys"])

ROUTER_BASE_URL = os.getenv("LLM_ROUTER_URL")


def _dt_to_iso_z(dt: Optional[datetime]) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# NOTE: In a real deployment you should use a proper KMS or encryption library.
# For now these are no-ops so we don't add new dependencies in this sprint.
def _encrypt_secret(raw: str) -> str:
    return raw


def _decrypt_secret(enc: str) -> str:
    return enc


class ProviderKeyCreate(BaseModel):
    provider: str = Field(..., description="Provider id, e.g. openai, anthropic")
    label: str = Field(..., description="Friendly name for this key")
    secret: str = Field(..., description="The provider API key")


class ProviderKeyItem(BaseModel):
    id: str
    provider: str
    label: str
    last_test_status: Optional[str] = None
    last_tested_at: Optional[str] = None
    created_at: str
    updated_at: str


class ProviderKeyListResponse(BaseModel):
    ok: bool = True
    items: List[ProviderKeyItem]


class ProviderKeyTestResponse(BaseModel):
    ok: bool = True
    id: str
    status: str
    message: Optional[str] = None
    last_tested_at: Optional[str] = None


def _to_item(model: ProviderKeyModel) -> ProviderKeyItem:
    return ProviderKeyItem(
        id=model.id,
        provider=model.provider,
        label=model.label,
        last_test_status=model.last_test_status,
        last_tested_at=_dt_to_iso_z(model.last_tested_at)
        if model.last_tested_at
        else None,
        created_at=_dt_to_iso_z(model.created_at),
        updated_at=_dt_to_iso_z(model.last_tested_at),
    )


@router.get("/", response_model=ProviderKeyListResponse)
def list_provider_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProviderKeyListResponse:
    rows = (
        db.query(ProviderKeyModel)
        .filter(ProviderKeyModel.user_id == current_user.id)
        .order_by(ProviderKeyModel.created_at.asc())
        .all()
    )
    items = [_to_item(r) for r in rows]
    return ProviderKeyListResponse(ok=True, items=items)


@router.post("/", response_model=ProviderKeyItem, status_code=status.HTTP_201_CREATED)
def create_provider_key(
    payload: ProviderKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProviderKeyItem:
    try:
        enc = _encrypt_secret(payload.secret)

        pk = ProviderKeyModel(
            user_id=current_user.id,
            provider=payload.provider,
            label=payload.label,
            encrypted_key=enc,
        )
        db.add(pk)
        db.commit()
        db.refresh(pk)
        return _to_item(pk)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail={"ok": False, "error": f"Failed to create provider key: {e}"},
        )


@router.delete("/{key_id}", response_model=dict)
def delete_provider_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    pk = (
        db.query(ProviderKeyModel)
        .filter(
            ProviderKeyModel.id == key_id,
            ProviderKeyModel.user_id == current_user.id,
        )
        .first()
    )
    if not pk:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Provider key not found"},
            },
        )

    db.delete(pk)
    db.commit()
    return {"ok": True, "deleted": True}


@router.post("/{key_id}/test", response_model=ProviderKeyTestResponse)
def test_provider_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProviderKeyTestResponse:
    pk = (
        db.query(ProviderKeyModel)
        .filter(
            ProviderKeyModel.id == key_id,
            ProviderKeyModel.user_id == current_user.id,
        )
        .first()
    )
    if not pk:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "ok": False,
                "error": {"code": "NOT_FOUND", "message": "Provider key not found"},
            },
        )

    secret = _decrypt_secret(pk.encrypted_key)
    status_value = "error"
    message: Optional[str] = None

    url = ROUTER_BASE_URL.rstrip("/") + "/v1/chat/completions"
    payload = {
        "model": "gpt-4.1-mini",
        "messages": [{"role": "user", "content": "ping"}],
        "temperature": 0.0,
        "provider": pk.provider,
    }

    try:
        resp = httpx.post(
            url,
            json=payload,
            headers={"X-Provider-Api-Key": secret},
            timeout=15.0,
        )
        if resp.status_code == 200:
            status_value = "ok"
            message = "Provider key test succeeded"
        else:
            status_value = "error"
            message = f"Router HTTP {resp.status_code}"
    except Exception as e:
        status_value = "error"
        message = f"Router error: {e}"

    pk.last_test_status = status_value
    pk.last_tested_at = datetime.now(timezone.utc)
    db.add(pk)
    db.commit()
    db.refresh(pk)

    return ProviderKeyTestResponse(
        ok=(status_value == "ok"),
        id=pk.id,
        status=status_value,
        message=message,
        last_tested_at=_dt_to_iso_z(pk.last_tested_at),
    )
