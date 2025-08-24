from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.user import User
from ..services.api_key_service import APIKeyService

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

# Request/Response models
class CreateAPIKeyRequest(BaseModel):
    name: str
    description: Optional[str] = None
    can_read: bool = True
    can_write: bool = False
    can_admin: bool = False

class APIKeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    description: Optional[str]
    is_active: bool
    can_read: bool
    can_write: bool
    can_admin: bool
    last_used_at: Optional[str]
    request_count: int
    created_at: str

    class Config:
        from_attributes = True

class CreateAPIKeyResponse(BaseModel):
    api_key_info: APIKeyResponse
    api_key: str  # The actual key (only shown once)
    warning: str = "Store this API key securely. It will not be shown again."


@router.post("/", response_model=CreateAPIKeyResponse)
async def create_api_key(
    request: CreateAPIKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new API key"""
    api_key_service = APIKeyService()

    try:
        api_key_record, plain_key = api_key_service.create_api_key(
            db=db,
            name=request.name,
            description=request.description,
            can_read=request.can_read,
            can_write=request.can_write,
            can_admin=request.can_admin
        )

        return CreateAPIKeyResponse(
            api_key_info=APIKeyResponse.from_orm(api_key_record),
            api_key=plain_key
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create API key: {str(e)}"
        )

@router.get("/", response_model=List[APIKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all API keys"""
    api_key_service = APIKeyService()
    api_keys = api_key_service.list_api_keys(db)

    return [APIKeyResponse.from_orm(key) for key in api_keys]

@router.get("/{key_id}", response_model=APIKeyResponse)
async def get_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific API key by ID"""
    api_key_service = APIKeyService()
    api_key = api_key_service.get_api_key_by_id(db, key_id)

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )

    return APIKeyResponse.from_orm(api_key)

@router.patch("/{key_id}/deactivate")
async def deactivate_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deactivate an API key"""
    api_key_service = APIKeyService()

    if api_key_service.deactivate_api_key(db, key_id):
        return {"message": "API key deactivated successfully"}
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )

@router.delete("/{key_id}")
async def delete_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an API key"""
    api_key_service = APIKeyService()

    if api_key_service.delete_api_key(db, key_id):
        return {"message": "API key deleted successfully"}
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
