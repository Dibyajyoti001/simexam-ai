"""
Authentication dependency for the SimExam AI Python service.

All routes should depend on ``get_service_key`` to enforce
service-to-service authentication via the ``X-Service-Key`` header.
"""

from __future__ import annotations

import hmac
import logging
import os
from fastapi import HTTPException, Request

logger = logging.getLogger("simexam-python.auth")


async def get_service_key(request: Request) -> str:
    """FastAPI *Depends* callable that extracts and validates X-Service-Key.

    Returns the validated key string so downstream handlers can use it
    if needed (e.g. for audit logging).

    Raises:
        HTTPException: 401 if the header is missing, empty, or does not
            match the ``SERVICE_SECRET`` environment variable.
    """
    expected = os.environ.get("SERVICE_SECRET", "")
    if not expected:
        logger.warning("SERVICE_SECRET env var is not set – rejecting request")
        raise HTTPException(
            status_code=401,
            detail="Service authentication not configured",
        )

    provided = request.headers.get("X-Service-Key", "")
    if not provided:
        raise HTTPException(
            status_code=401,
            detail="Missing X-Service-Key header",
        )

    if not hmac.compare_digest(provided.encode(), expected.encode()):
        logger.warning(
            "Invalid service key from %s",
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(status_code=401, detail="Invalid service key")

    return provided
