import { Request, Response, NextFunction } from "express"
import { JWTPayload } from "../types/index.js"

// Extend Express Request to carry user payload
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "simexam-dev-secret-change-me"

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
    // Admins can access anything (IDOR check is done by requireSessionOwner)
    next()
    return
  }

  if (req.user.role === "student") {
    const sessionId = req.params.sessionId || req.body?.sessionId
    if (sessionId && req.user.sessionId !== sessionId) {
      res.status(403).json({ error: "You can only access your own session" })
      return
    }
    next()
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
