from __future__ import annotations

import base64
import hashlib
import os
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings


def _normalize_fernet_key(raw: str) -> bytes:
    """
    Accepts a Fernet key from env as:
      - a standard Fernet key (urlsafe base64, 44 chars)
      - any other string, which we will hash+encode into a valid Fernet key

    Fernet requires 32-byte key, urlsafe-base64 encoded -> 44 chars.
    """
    raw = raw.strip()
    try:
        # If it's already a valid key, this will succeed.
        Fernet(raw.encode("utf-8"))
        return raw.encode("utf-8")
    except Exception:
        # Derive a valid Fernet key deterministically.
        digest = hashlib.sha256(raw.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)


@lru_cache(maxsize=1)
def get_fernet() -> Fernet:
    """
    Source of truth for encryption-at-rest for provider keys.

    Priority:
      1) PROVIDER_KEYS_FERNET_KEY env var (recommended in production)
      2) derive from settings.secret_key (better than plaintext, but rotate carefully)

    Rotation note:
      - If you change the Fernet key, previously stored keys become undecryptable
        unless you implement multi-key rotation.
    """
    env_key = os.getenv("PROVIDER_KEYS_FERNET_KEY")
    if env_key:
        key = _normalize_fernet_key(env_key)
        return Fernet(key)

    # Fallback: derive from API secret key (still stable, but explicitly set env is better)
    sk = settings.secret_key.get_secret_value()
    key = _normalize_fernet_key(sk)
    return Fernet(key)


def encrypt_secret(raw: str) -> str:
    if raw is None:
        raise ValueError("Secret must not be None")
    raw = raw.strip()
    if not raw:
        raise ValueError("Secret must not be empty")
    token = get_fernet().encrypt(raw.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_secret(enc: str) -> str:
    if enc is None:
        raise ValueError("Encrypted secret must not be None")
    enc = enc.strip()
    if not enc:
        raise ValueError("Encrypted secret must not be empty")

    try:
        raw = get_fernet().decrypt(enc.encode("utf-8"))
        return raw.decode("utf-8")
    except InvalidToken as e:
        # This usually means wrong Fernet key or corrupted data.
        raise ValueError("Unable to decrypt secret (invalid token).") from e


def mask_secret(raw: str, show_last: int = 4) -> str:
    raw = raw or ""
    raw = raw.strip()
    if not raw:
        return "****"
    if len(raw) <= show_last:
        return "****"
    return "****" + raw[-show_last:]


def safe_mask_encrypted(enc: Optional[str]) -> str:
    """
    Mask encrypted secret without decrypting it (best effort).
    Prefer masking the decrypted raw secret when you already have it.
    """
    if not enc:
        return "****"
    # Not decrypting here intentionally. Return short stable mask.
    return "enc:" + enc[:6] + "…" + enc[-4:]
