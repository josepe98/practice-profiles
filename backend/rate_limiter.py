"""IP-keyed rate limiter for FastAPI endpoints.

Thin wrapper around the `limits` library — replaces slowapi (unmaintained
since Feb 2024) with code we own. Same decorator interface as slowapi
so endpoint code is unchanged.

Usage:
    limiter = Limiter()

    @app.post("/foo")
    @limiter.limit("10/minute")
    def handler(request: Request, ...): ...

The endpoint must accept `request: Request` as a parameter so the
decorator can read the client IP.
"""
from __future__ import annotations

import asyncio
from functools import wraps
from typing import Callable

from fastapi import HTTPException, Request, status
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import FixedWindowRateLimiter


class RateLimitExceeded(HTTPException):
    def __init__(self, retry_after: int):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )


class Limiter:
    def __init__(self):
        self._strategy = FixedWindowRateLimiter(MemoryStorage())

    def limit(self, rate: str) -> Callable:
        rate_item = parse(rate)
        retry_after = rate_item.get_expiry()

        def decorator(func: Callable) -> Callable:
            is_async = asyncio.iscoroutinefunction(func)

            def check(request: Request) -> None:
                client_ip = request.client.host if request.client else "unknown"
                if not self._strategy.hit(rate_item, client_ip):
                    raise RateLimitExceeded(retry_after=retry_after)

            if is_async:
                @wraps(func)
                async def wrapper(*args, **kwargs):
                    check(_get_request(args, kwargs))
                    return await func(*args, **kwargs)
            else:
                @wraps(func)
                def wrapper(*args, **kwargs):
                    check(_get_request(args, kwargs))
                    return func(*args, **kwargs)

            return wrapper

        return decorator


def _get_request(args, kwargs) -> Request:
    if "request" in kwargs:
        return kwargs["request"]
    for arg in args:
        if isinstance(arg, Request):
            return arg
    raise RuntimeError("Rate-limited endpoint must accept `request: Request`")
