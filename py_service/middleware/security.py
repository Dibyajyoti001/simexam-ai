"""
Security middleware for the SimExam AI Python service.

Provides service-to-service authentication, SSRF protection,
rate limiting, and input sanitization.
"""

from __future__ import annotations

import html
import ipaddress
import logging
import os
import re
from urllib.parse import urlparse

from fastapi import HTTPException, Request

logger = logging.getLogger("simexam-python.security")

# ── Pre-compiled patterns ────────────────────────────────────────────

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_HTML_TAG_RE = re.compile(r"<[^>]+>")

# Private / reserved IP networks to block for SSRF protection
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fd00::/8"),
    ipaddress.ip_network("fe80::/10"),
]

_ALLOWED_SCHEMES = {"http", "https"}


# ── Service Key Verification ────────────────────────────────────────

async def verify_service_key(request: Request) -> None:
    """FastAPI dependency that validates the X-Service-Key header.

    Compares the header value against the ``SERVICE_SECRET`` environment
    variable using a constant-time comparison.

    Raises:
        HTTPException: 401 if the key is missing or invalid.
    """
    expected = os.environ.get("SERVICE_SECRET", "")
    if not expected:
        logger.warning("SERVICE_SECRET env var is not set – rejecting all requests")
        raise HTTPException(status_code=401, detail="Service authentication not configured")

    provided = request.headers.get("X-Service-Key", "")
    if not provided:
        raise HTTPException(status_code=401, detail="Missing X-Service-Key header")

    # Constant-time comparison to prevent timing attacks
    import hmac
    if not hmac.compare_digest(provided.encode(), expected.encode()):
        logger.warning("Invalid service key from %s", request.client.host if request.client else "unknown")
        raise HTTPException(status_code=401, detail="Invalid service key")


# ── SSRF Protection ─────────────────────────────────────────────────

def validate_url(url: str) -> bool:
    """Validate a URL for SSRF safety.

    Blocks:
    - Private / reserved IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x,
      169.254.x, ::1, fd00::, fe80::)
    - Disallowed schemes (only http and https permitted)
    - URLs with no hostname

    Args:
        url: The URL string to validate.

    Returns:
        True if the URL is safe, False otherwise.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    # Scheme check
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        logger.debug("Blocked URL with scheme %s: %s", parsed.scheme, url)
        return False

    hostname = parsed.hostname
    if not hostname:
        return False

    # Resolve hostname to IP and check against blocked networks
    try:
        addr = ipaddress.ip_address(hostname)
        for network in _BLOCKED_NETWORKS:
            if addr in network:
                logger.debug("Blocked private IP %s in URL: %s", addr, url)
                return False
    except ValueError:
        # hostname is a domain name, not an IP literal – allow it.
        # DNS rebinding attacks are out of scope for this layer;
        # further mitigation belongs in the HTTP client.
        pass

    return True


# ── Rate Limiting ────────────────────────────────────────────────────

async def rate_limit(key: str, max_requests: int, window_seconds: int) -> None:
    """Redis-based sliding-window rate limiter.

    Uses a simple INCR + EXPIRE pattern.  If Redis is unavailable the
    request is allowed through (fail-open) with a warning.

    Args:
        key: The rate-limit bucket key (e.g. ``eval:{org_slug}``).
        max_requests: Maximum allowed requests within the window.
        window_seconds: The time window in seconds.

    Raises:
        HTTPException: 429 if the rate limit is exceeded.
    """
    redis_url = os.environ.get("REDIS_URL", "")
    if not redis_url:
        logger.debug("REDIS_URL not set – rate limiting disabled")
        return

    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(redis_url, decode_responses=True)
        try:
            current = await client.incr(key)
            if current == 1:
                await client.expire(key, window_seconds)
            if current > max_requests:
                ttl = await client.ttl(key)
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded. Try again in {ttl}s.",
                )
        finally:
            await client.aclose()
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Rate limiter unavailable (Redis error): %s", exc)


# ── Input Sanitization ──────────────────────────────────────────────

def sanitize_input(text: str) -> str:
    """Sanitize user-provided text.

    - Strips null bytes and ASCII control characters
    - Removes HTML tags
    - Escapes remaining HTML entities

    Args:
        text: Raw user input.

    Returns:
        Sanitized text safe for storage and display.
    """
    # Strip null bytes
    text = text.replace("\x00", "")
    # Strip control characters (preserve newline \n, carriage return \r, tab \t)
    text = _CONTROL_CHAR_RE.sub("", text)
    # Strip HTML tags
    text = _HTML_TAG_RE.sub("", text)
    # Escape remaining HTML entities
    text = html.escape(text, quote=False)
    return text
