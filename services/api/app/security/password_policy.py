from __future__ import annotations


class PasswordPolicyError(ValueError):
    pass


def validate_password_policy(password: str) -> None:
    """
    Production-safe password policy checks.

    Notes:
    - bcrypt truncates at 72 bytes and passlib may raise errors for longer inputs.
    - Use bytes length (UTF-8) not char length.
    """
    if password is None:
        raise PasswordPolicyError("Password is required.")

    pw = password.strip()
    if len(pw) < 8:
        raise PasswordPolicyError("Password must be at least 8 characters.")

    # bcrypt limit: 72 BYTES (not chars)
    if len(pw.encode("utf-8")) > 72:
        raise PasswordPolicyError("Password is too long (max 72 bytes).")
