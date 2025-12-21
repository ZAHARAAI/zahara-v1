from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.provider_key import ProviderKey as ProviderKeyModel
from ..models.user import User
from ..security.provider_keys_crypto import decrypt_secret, encrypt_secret

router = APIRouter(prefix="/provider_keys", tags=["provider_keys"])


def _new_key_id() -> str:
    return "pk_" + uuid4().hex[:16]


def _dt_to_iso_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _mask(raw: str) -> str:
    # Do not show secrets. Show only last 4.
    raw = (raw or "").strip()
    if not raw:
        return "****"
    if len(raw) <= 4:
        return "****"
    return "****" + raw[-4:]


class ProviderKeyItem(BaseModel):
    id: str
    provider: str
    label: str
    last_test_status: Optional[str] = None
    last_tested_at: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


class ProviderKeyListResponse(BaseModel):
    ok: bool = True
    items: List[ProviderKeyItem]


class ProviderKeyCreate(BaseModel):
    provider: str = Field(..., description="Provider id, e.g. openai, anthropic")
    label: str = Field(..., description="Friendly label for the key")
    key: str = Field(..., description="Raw API key to store encrypted-at-rest")


class ProviderKeyCreateResponse(BaseModel):
    ok: bool = True
    id: str
    provider: str
    label: str
    last_test_status: Optional[str] = None
    last_tested_at: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    masked_key: str


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
        updated_at=_dt_to_iso_z(model.last_tested_at) if model.last_tested_at else None,
    )


@router.get("", response_model=ProviderKeyListResponse)
def list_provider_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProviderKeyListResponse:
    rows = (
        db.query(ProviderKeyModel)
        .filter(ProviderKeyModel.user_id == current_user.id)
        .order_by(ProviderKeyModel.created_at.desc())
        .all()
    )
    return ProviderKeyListResponse(ok=True, items=[_to_item(r) for r in rows])


@router.post("", response_model=ProviderKeyCreateResponse)
def create_provider_key(
    body: ProviderKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProviderKeyCreateResponse:
    provider = body.provider.strip().lower()
    label = body.label.strip()

    if not provider:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "error": {"code": "INVALID", "message": "provider is required"},
            },
        )
    if not label:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "error": {"code": "INVALID", "message": "label is required"},
            },
        )

    raw_key = body.key.strip()
    if not raw_key:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "error": {"code": "INVALID", "message": "key is required"},
            },
        )

    enc = encrypt_secret(raw_key)

    pk = ProviderKeyModel(
        id=_new_key_id(),
        user_id=current_user.id,
        provider=provider,
        label=label,
        encrypted_key=enc,
        last_test_status="never",
        last_tested_at=None,
    )

    db.add(pk)
    db.commit()
    db.refresh(pk)

    return ProviderKeyCreateResponse(
        ok=True,
        provider_key=_to_item(pk),
        masked_key=_mask(raw_key),
    )


class ProviderKeyRawTestRequest(BaseModel):
    provider: str = Field(..., description="Provider id, e.g. openai, anthropic")
    key: str = Field(..., description="Raw API key to test (not stored)")


@router.post("/test")
def test_raw_provider_key(
    body: ProviderKeyRawTestRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Spec-compatible: POST /keys/test
    Tests a raw key WITHOUT storing it.
    """
    provider = (body.provider or "").strip().lower()
    raw_key = (body.key or "").strip()
    if not provider or not raw_key:
        raise HTTPException(
            status_code=400,
            detail={
                "ok": False,
                "error": {
                    "code": "INVALID",
                    "message": "provider and key are required",
                },
            },
        )

    try:
        timeout = httpx.Timeout(10.0, connect=5.0)
        client = httpx.Client(timeout=timeout)
        if provider == "openai":
            r = client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {raw_key}"},
            )
            ok = r.status_code == 200
            msg = (
                "OpenAI key is valid."
                if ok
                else f"OpenAI returned {r.status_code}: {r.text[:200]}"
            )
            return {
                "ok": ok,
                "provider": provider,
                "status": "ok" if ok else "error",
                "message": msg,
            }

        return {
            "ok": False,
            "provider": provider,
            "status": "error",
            "message": f"Provider '{provider}' test not implemented yet.",
        }
    except Exception as e:
        return {
            "ok": False,
            "provider": provider,
            "status": "error",
            "message": f"Test call failed: {e}",
        }
    finally:
        try:
            client.close()
        except Exception:
            pass


@router.delete("/{key_id}")
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

    # Decrypt safely
    try:
        raw_key = decrypt_secret(pk.encrypted_key)
    except ValueError as e:
        pk.last_test_status = "error"
        pk.last_tested_at = datetime.now(timezone.utc)
        db.add(pk)
        db.commit()
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": {"code": "DECRYPT_FAILED", "message": str(e)},
            },
        )

    provider = (pk.provider or "").lower()
    status_value = "error"
    message = None

    try:
        # Minimal cheap test calls (no spending / minimal)
        timeout = httpx.Timeout(10.0, connect=5.0)
        async_client = httpx.Client(timeout=timeout)

        if provider == "openai":
            r = async_client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {raw_key}"},
            )
            if r.status_code == 200:
                status_value = "ok"
                message = "OpenAI key is valid."
            else:
                message = f"OpenAI returned {r.status_code}: {r.text[:200]}"

        else:
            message = f"Provider '{provider}' test not implemented yet."
            status_value = "error"

        async_client.close()

    except Exception as e:
        status_value = "error"
        message = f"Test call failed: {e}"

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
