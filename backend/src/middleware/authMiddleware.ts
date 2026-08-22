import { Request, Response, NextFunction } from "express"
import { JWTPayload } from "../types/index.js"
import { hasDatabase, dbQuery } from "../lib/db.js"

// Extend Express Request to carry user payload
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "simexam-dev-secret-change-me"

if (JWT_SECRET === "simexam-dev-secret-change-me") {
  console.warn("[Auth] \u26a0\ufe0f  Using default JWT_SECRET \u2014 set JWT_SECRET env var in production")
}

// ── Dynamic imports (these packages may not be installed yet) ─────

async function getJwt() {
  try {
    const jwt = await import("jsonwebtoken")
    return jwt.default || jwt
  } catch {
    console.warn("[Auth] jsonwebtoken not installed — auth features disabled")
    return null
  }
}

async function getBcrypt() {
  try {
    const bcrypt = await import("bcrypt")
    return bcrypt.default || bcrypt
  } catch {
    console.warn("[Auth] bcrypt not installed — password hashing disabled")
    return null
  }
}

// ── Token helpers ─────────────────────────────────────────────────

/**
 * Signs a JWT with 24-hour expiry.
 */
export async function generateToken(
  payload: Omit<JWTPayload, "iat" | "exp">
): Promise<string> {
  const jwt = await getJwt()
  if (!jwt) throw new Error("jsonwebtoken is not available")
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" })
}

/**
 * Verifies and decodes a JWT. Throws on invalid/expired tokens.
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  const jwt = await getJwt()
  if (!jwt) throw new Error("jsonwebtoken is not available")
  return jwt.verify(token, JWT_SECRET) as JWTPayload
}

// ── Express middleware ────────────────────────────────────────────

/**
 * Authenticates requests via Bearer token in the Authorization header.
 * In dev mode (ENABLE_AUTH not set), all requests pass through.
 */
export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  if (process.env.ENABLE_AUTH === "false") {
    // Explicitly disabled for dev/test
    next()
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" })
    return
  }

  const token = authHeader.slice(7)

  verifyToken(token)
    .then((payload) => {
      req.user = payload
      next()
    })
    .catch((err: any) => {
      console.warn("[Auth] JWT verification failed:", err?.message)
      res.status(401).json({ error: "Invalid or expired token" })
    })
}

/**
 * Requires the authenticated user to have the 'admin' role.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (process.env.ENABLE_AUTH === "false") {
    next()
    return
  }

  if (!req.user) {
    res.status(401).json({ error: "Authentication required" })
    return
  }

  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" })
    return
  }

  next()
}

/**
 * Verifies the authenticated admin's orgId matches the :orgSlug in the URL.
 * Prevents cross-tenant access (IDOR). Must be used after authenticateJWT + requireAdmin.
 */
export function requireOrgOwnership(req: Request, res: Response, next: NextFunction): void {
  if (process.env.ENABLE_AUTH === "false") {
    next()
    return
  }

  if (!req.user) {
    res.status(401).json({ error: "Authentication required" })
    return
  }

  const orgSlug = req.params.orgSlug
  if (!orgSlug) {
    next()
    return
  }

  if (!hasDatabase()) {
    next()
    return
  }

  ;(async () => {
    try {
      const result = await dbQuery<{ id: string }>("SELECT id FROM orgs WHERE slug = $1", [orgSlug])
      if (result.rows.length === 0) {
        res.status(404).json({ error: "Organization not found" })
        return
      }
      if (result.rows[0].id !== req.user!.orgId) {
        res.status(403).json({ error: "You do not have access to this organization" })
        return
      }
      next()
    } catch (err) {
      next(err)
    }
  })()
}

/**
 * Allows students to access only their own session, or admins to access any
 * session within their org.
 */
export function requireStudentAccess(req: Request, res: Response, next: NextFunction): void {
  if (process.env.ENABLE_AUTH === "false") {
    next()
    return
  }

  if (!req.user) {
    res.status(401).json({ error: "Authentication required" })
    return
  }

  if (req.user.role === "admin") {
    next()
    return
  }

  if (req.user.role === "student") {
    const sessionId = req.params.sessionId || req.body?.sessionId
    if (!sessionId) {
      next()
      return
    }

    if (!hasDatabase()) {
      next()
      return
    }

    // DB-backed ownership check instead of relying on JWT sessionId (which was never set)
    ;(async () => {
      try {
        const result = await dbQuery<{ student_id: string | null; org_id: string }>(
          "SELECT student_id, org_id FROM sessions WHERE id = $1",
          [sessionId]
        )
        if (result.rows.length === 0) {
          res.status(404).json({ error: "Session not found" })
          return
        }
        const session = result.rows[0]
        // If session has a linked student, it must match the authenticated user
        if (session.student_id && session.student_id !== req.user!.userId) {
          res.status(403).json({ error: "You can only access your own session" })
          return
        }
        // Org-level check: student must belong to the session's org
        if (session.org_id !== req.user!.orgId) {
          res.status(403).json({ error: "You can only access sessions in your organization" })
          return
        }
        next()
      } catch (err) {
        next(err)
      }
    })()
    return
  }

  res.status(403).json({ error: "Insufficient permissions" })
}

// ── Password helpers ──────────────────────────────────────────────

const SALT_ROUNDS = 12

/**
 * Hashes a password with bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await getBcrypt()
  if (!bcrypt) throw new Error("bcrypt is not available")
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Compares a plaintext password against a bcrypt hash.
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  const bcrypt = await getBcrypt()
  if (!bcrypt) throw new Error("bcrypt is not available")
  return bcrypt.compare(password, hash)
}
