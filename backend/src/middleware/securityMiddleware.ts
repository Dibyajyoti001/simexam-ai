import { Request, Response, NextFunction } from "express"
import { cacheGet, cacheSet } from "../lib/cache.js"
import { RateLimitConfig, JWTPayload } from "../types/index.js"
import { hasDatabase, dbQuery } from "../lib/db.js"

// ── Rate Limiter ──────────────────────────────────────────────────

/**
 * Rate limiter middleware backed by the dual-mode cache (Redis or in-memory).
 * Tracks request counts per IP within a sliding window.
 */
export function rateLimiter(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown"

    const windowSeconds = Math.ceil(config.windowMs / 1000)
    const key = `ratelimit:${ip}:${Math.floor(Date.now() / config.windowMs)}`

    try {
      const current = await cacheGet<number>(key)
      const count = (current ?? 0) + 1

      if (count > config.maxRequests) {
        console.warn(`[Security] Rate limit exceeded for IP ${ip}: ${count}/${config.maxRequests}`)
        res.status(429).json({ error: "Rate limit exceeded" })
        return
      }

      await cacheSet(key, count, windowSeconds)
    } catch (err: any) {
      // If cache fails, allow the request through (fail-open)
      console.warn("[Security] Rate limiter cache error:", err?.message)
    }

    next()
  }
}

// ── Security Headers ──────────────────────────────────────────────

/**
 * Sets defensive HTTP headers on every response.
 */
export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("X-XSS-Protection", "1; mode=block")
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
    res.setHeader("Content-Security-Policy", "default-src 'self'")
    res.setHeader("Strict-Transport-Security", "max-age=31536000")
    next()
  }
}

// ── Session Ownership ─────────────────────────────────────────────

/**
 * Verifies that the authenticated user/org owns the session referenced by
 * `req.params.sessionId` or `req.body.sessionId`. Returns 403 if not.
 * Skips check when auth is disabled or no database is configured.
 */
export function requireSessionOwner() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip in dev mode when explicitly disabled or when DB is unavailable
    if (process.env.ENABLE_AUTH === "false" || !hasDatabase()) {
      next()
      return
    }

    const user = (req as any).user as JWTPayload | undefined
    if (!user) {
      res.status(401).json({ error: "Authentication required" })
      return
    }

    const sessionId = req.params.sessionId || req.body?.sessionId
    if (!sessionId) {
      // No session to check
      next()
      return
    }

    try {
      const result = await dbQuery<{ org_id: string }>(
        "SELECT org_id FROM sessions WHERE id = $1 LIMIT 1",
        [sessionId]
      )

      if (!result.rows[0]) {
        res.status(404).json({ error: "Session not found" })
        return
      }

      if (result.rows[0].org_id !== user.orgId) {
        console.warn(
          `[Security] IDOR blocked — user org ${user.orgId} tried to access session ${sessionId} (org ${result.rows[0].org_id})`
        )
        res.status(403).json({ error: "Forbidden: session does not belong to your organization" })
        return
      }

      next()
    } catch (err: any) {
      console.error("[Security] Session ownership check failed:", err?.message)
      res.status(500).json({ error: "Internal server error" })
    }
  }
}
