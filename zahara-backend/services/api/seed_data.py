#!/usr/bin/env python3
"""
Database seeding script for Zahara.ai API
Creates initial user and API key for testing
"""

import asyncio
import os
import sys
from datetime import datetime

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import hashlib

from app.database import get_db
from app.models.user import User
from app.services.api_key_service import APIKeyService


async def seed_database():
    """Seed the database with initial data"""
    print("🌱 Starting database seeding...")

    # Create a database session
    db = next(get_db())

    try:
        # Check if we already have users
        existing_user = db.query(User).first()
        if existing_user:
            print("✅ Database already seeded. Skipping...")
            return

        # Create a default admin user
        admin_user = User(
            username="admin",
            email="admin@zahara.ai",
            hashed_password=hashlib.sha256("admin123".encode()).hexdigest(),  # Simple hash for demo
            is_active=True
        )

        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

        print(f"✅ Created admin user: {admin_user.email}")

        # Generate a plaintext API key
        api_key_service = APIKeyService()
        api_key_record, plaintext_key = api_key_service.create_api_key(
            db=db,
            name="Default API Key",
            description="Initial API key for testing and development",
            can_read=True,
            can_write=True
        )

        print("🔑 API Key Generated Successfully!")
        print("=" * 60)
        print("🚨 IMPORTANT: Save this API key - it will only be shown once!")
        print(f"API Key: {plaintext_key}")
        print("=" * 60)
        print(f"Key Name: {api_key_record.name}")
        print(f"Key ID: {api_key_record.id}")
        print(f"Owner: {admin_user.email}")
        print(f"Permissions: Read={api_key_record.can_read}, Write={api_key_record.can_write}")
        print("=" * 60)
        print("💡 Use this key in the Authorization header: Authorization: Bearer <key>")
        print("💡 Or use the X-API-Key header: X-API-Key: <key>")
        print("=" * 60)

        # Also save to a file for convenience (but warn about security)
        with open("api_key.txt", "w") as f:
            f.write(f"API_KEY={plaintext_key}\n")
            f.write(f"# Generated on {datetime.utcnow().isoformat()}\n")
            f.write(f"# Owner: {admin_user.email}\n")
            f.write(f"# Key ID: {api_key_record.id}\n")

        print("📁 API key also saved to 'api_key.txt' (delete after use for security)")

        print("✅ Database seeding completed successfully!")

    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def main():
    """Main function to run the seeding"""
    asyncio.run(seed_database())

if __name__ == "__main__":
    main()
