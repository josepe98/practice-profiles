from __future__ import annotations

import os
import time
from typing import Dict, Any

import requests
from jose import jwt, JWTError
from fastapi import Header, HTTPException, status

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")

# Simple in-memory JWKS cache (keyed by kid, expires after 1 hour)
_jwks_cache: Dict[str, Any] = {}
_jwks_fetched_at: float = 0.0
_JWKS_TTL = 3600  # seconds


def _get_jwks() -> list:
    global _jwks_fetched_at
    now = time.time()
    if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_TTL:
        return list(_jwks_cache.values())
    if not SUPABASE_URL:
        return []
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            timeout=10,
        )
        resp.raise_for_status()
        keys = resp.json().get("keys", [])
        _jwks_cache.clear()
        for k in keys:
            _jwks_cache[k.get("kid", "default")] = k
        _jwks_fetched_at = now
        return keys
    except Exception as e:
        print(f"[auth] Failed to fetch JWKS: {e}")
        return []


def require_auth(authorization: str = Header(default=None)) -> dict:
    """FastAPI dependency — validates Supabase JWT on every protected request."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = authorization[len("Bearer "):]
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        elif alg == "RS256":
            kid = header.get("kid")
            keys = _get_jwks()
            key = next((k for k in keys if k.get("kid") == kid), keys[0] if keys else None)
            if not key:
                raise JWTError("No matching public key found")
            payload = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                options={"verify_aud": False},
            )
        else:
            raise JWTError(f"Unsupported algorithm: {alg}")

        return payload
    except JWTError as e:
        print(f"[auth] JWT validation failed: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
