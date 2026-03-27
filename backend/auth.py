from __future__ import annotations

import os
from jose import jwt, JWTError
from fastapi import Header, HTTPException, status

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")


def require_auth(authorization: str = Header(default=None)) -> dict:
    """FastAPI dependency — validates Supabase JWT on every protected request."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = authorization[len("Bearer "):]
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as e:
        print(f"[auth] JWT validation failed: {e} | secret_len={len(SUPABASE_JWT_SECRET)}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
