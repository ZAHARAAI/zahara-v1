from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..services.api_key_service import APIKeyService
from ..models.api_key import APIKey

security = HTTPBearer(auto_error=False)

class APIKeyAuth:
    """API Key authentication middleware"""
    
    def __init__(self):
        self.api_key_service = APIKeyService()
    
    async def __call__(
        self,
        request: Request,
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
        db: Session = Depends(get_db)
    ) -> Optional[APIKey]:
        """Authenticate request using API key from Authorization header"""
        
        # Skip API key auth for certain endpoints
        if self.should_skip_auth(request.url.path):
            return None
            
        # Check for API key in Authorization header
        api_key = None
        if credentials and credentials.scheme.lower() == "bearer":
            api_key = credentials.credentials
        
        # Also check X-API-Key header
        if not api_key:
            api_key = request.headers.get("X-API-Key")
        
        if not api_key:
            # For endpoints that require API key, raise 401
            if self.requires_api_key(request.url.path):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="API key required"
                )
            return None
        
        # Verify API key
        api_key_record = self.api_key_service.verify_api_key(db, api_key)
        if not api_key_record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or inactive API key"
            )
        
        # Check permissions based on request method and path
        if not self.check_permissions(request, api_key_record):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this operation"
            )
        
        return api_key_record
    
    def should_skip_auth(self, path: str) -> bool:
        """Check if authentication should be skipped for this path"""
        skip_paths = [
            "/",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/health",
            "/version",
            "/auth/login",
            "/auth/register",
            "/static",
        ]
        
        for skip_path in skip_paths:
            if path.startswith(skip_path):
                return True
        return False
    
    def requires_api_key(self, path: str) -> bool:
        """Check if this path requires an API key"""
        # Paths that absolutely require API key
        api_key_required_paths = [
            "/llm",
            "/vector",
            "/agents",
            "/v1/chat/completions",
        ]
        
        for required_path in api_key_required_paths:
            if path.startswith(required_path):
                return True
        return False
    
    def check_permissions(self, request: Request, api_key_record: APIKey) -> bool:
        """Check if the API key has permission for this operation"""
        method = request.method.upper()
        path = request.url.path
        
        # Admin operations require admin permission
        if "/api-keys" in path or "/admin" in path:
            return api_key_record.can_admin
        
        # Write operations require write permission
        if method in ["POST", "PUT", "PATCH", "DELETE"]:
            return api_key_record.can_write or api_key_record.can_admin
        
        # Read operations require read permission
        if method in ["GET", "HEAD", "OPTIONS"]:
            return api_key_record.can_read or api_key_record.can_write or api_key_record.can_admin
        
        return False

# Global instance
api_key_auth = APIKeyAuth()

# Dependency for endpoints that require API key authentication
def require_api_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> APIKey:
    """Dependency that requires a valid API key"""
    api_key_service = APIKeyService()
    
    # Check for API key in Authorization header
    api_key = None
    if credentials and credentials.scheme.lower() == "bearer":
        api_key = credentials.credentials
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required"
        )
    
    # Verify API key
    api_key_record = api_key_service.verify_api_key(db, api_key)
    if not api_key_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key"
        )
    
    return api_key_record
