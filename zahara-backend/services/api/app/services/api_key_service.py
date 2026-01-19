import hashlib
import secrets
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models.api_key import APIKey


class APIKeyService:
    """Service for managing API keys"""

    @staticmethod
    def generate_api_key() -> str:
        """Generate a new API key"""
        return f"zhr_{''.join(secrets.choice('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') for _ in range(48))}"

    @staticmethod
    def hash_api_key(api_key: str) -> str:
        """Hash an API key for storage"""
        return hashlib.sha256(api_key.encode()).hexdigest()

    @staticmethod
    def get_key_prefix(api_key: str) -> str:
        """Get the first 8 characters of the API key for identification"""
        return api_key[:12] if api_key.startswith("zhr_") else api_key[:8]

    def create_api_key(
        self,
        db: Session,
        name: str,
        description: str = None,
        can_read: bool = True,
        can_write: bool = False,
        can_admin: bool = False
    ) -> tuple[APIKey, str]:
        """Create a new API key and return both the model and the plain key"""

        # Generate new API key
        plain_key = self.generate_api_key()
        key_hash = self.hash_api_key(plain_key)
        key_prefix = self.get_key_prefix(plain_key)

        # Create API key record
        api_key = APIKey(
            name=name,
            key_hash=key_hash,
            key_prefix=key_prefix,
            description=description,
            can_read=can_read,
            can_write=can_write,
            can_admin=can_admin
        )

        db.add(api_key)
        db.commit()
        db.refresh(api_key)

        return api_key, plain_key

    def verify_api_key(self, db: Session, api_key: str) -> Optional[APIKey]:
        """Verify an API key and return the associated record if valid"""
        if not api_key or len(api_key) < 10:
            return None

        try:
            key_hash = self.hash_api_key(api_key)

            api_key_record = db.query(APIKey).filter(
                APIKey.key_hash == key_hash,
                APIKey.is_active
            ).first()

            if api_key_record:
                # Update usage statistics in a separate transaction to avoid locks
                try:
                    api_key_record.last_used_at = datetime.now()
                    api_key_record.request_count += 1
                    db.commit()
                except Exception as e:
                    # Log error but don't fail authentication
                    print(f"Error updating API key usage: {e}")
                    db.rollback()

            return api_key_record
        except Exception as e:
            print(f"Error verifying API key: {e}")
            return None

    def list_api_keys(self, db: Session) -> List[APIKey]:
        """List all API keys (without revealing the actual keys)"""
        return db.query(APIKey).all()

    def get_api_key_by_id(self, db: Session, key_id: int) -> Optional[APIKey]:
        """Get an API key by ID"""
        return db.query(APIKey).filter(APIKey.id == key_id).first()

    def deactivate_api_key(self, db: Session, key_id: int) -> bool:
        """Deactivate an API key"""
        api_key = self.get_api_key_by_id(db, key_id)
        if api_key:
            api_key.is_active = False
            db.commit()
            return True
        return False

    def delete_api_key(self, db: Session, key_id: int) -> bool:
        """Delete an API key"""
        api_key = self.get_api_key_by_id(db, key_id)
        if api_key:
            db.delete(api_key)
            db.commit()
            return True
        return False


# Dependency function for API key authentication
def verify_api_key_dependency(api_key: str, db: Session) -> APIKey:
    """Dependency function to verify API key from request headers"""
    api_key_service = APIKeyService()
    api_key_record = api_key_service.verify_api_key(db, api_key)

    if not api_key_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key"
        )

    return api_key_record
