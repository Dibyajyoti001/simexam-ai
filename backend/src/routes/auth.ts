import { Router, Request, Response } from "express"
import crypto from "crypto"
import { validate, LoginSchema, RegisterSchema, InviteTokenSchema } from "../middleware/validation.js"
import { hashPassword, comparePassword, generateToken, authenticateJWT, requireAdmin } from "../middleware/authMiddleware.js"
import { hasDatabase, dbQuery } from "../lib/db.js"

const router = Router()

/**
 * POST /api/auth/register
 * Creates an org + admin user. Returns full user payload.
 */
router.post("/register", validate(RegisterSchema), async (req: Request, res: Response) => {
  const { email, password, orgSlug, orgName } = req.body

  if (!hasDatabase()) {
    return res.status(501).json({ error: "Database not configured" })
  }

  try {
    // Check if org exists, else create
    let orgResult = await dbQuery<{ id: string }>("SELECT id FROM orgs WHERE slug = $1", [orgSlug])
    let orgId: string

    if (orgResult.rows.length === 0) {
      const insertOrg = await dbQuery<{ id: string }>(
        "INSERT INTO orgs (slug, name) VALUES ($1, $2) RETURNING id",
        [orgSlug, orgName]
      )
      orgId = insertOrg.rows[0].id
    } else {
      orgId = orgResult.rows[0].id
    }

    // Check if user exists
    const userResult = await dbQuery("SELECT id FROM org_users WHERE auth_user_id = $1", [email])
    if (userResult.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" })
    }

    const hashed = await hashPassword(password)
    const insertUser = await dbQuery<{ id: string }>(
      "INSERT INTO org_users (org_id, auth_user_id, password_hash, email, role) VALUES ($1, $2, $3, $4, 'admin') RETURNING id",
      [orgId, email, hashed, email]
    )

    const userId = insertUser.rows[0].id
    const token = await generateToken({
      userId,
      orgId,
      role: "admin",
    })

    // Return complete user data so the frontend AuthUser is fully populated
    res.json({ token, userId, orgId, orgSlug, role: "admin" })
  } catch (err: any) {
    console.error("[Auth] Registration failed:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

/**
 * POST /api/auth/login
 * Returns full user payload including userId, orgId, role, orgSlug.
 */
router.post("/login", validate(LoginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!hasDatabase()) {
    return res.status(501).json({ error: "Database not configured" })
  }

  try {
    const userResult = await dbQuery<{ id: string; org_id: string; password_hash: string; role: string; slug: string }>(
      `SELECT u.id, u.org_id, u.password_hash, u.role, o.slug 
       FROM org_users u 
       JOIN orgs o ON u.org_id = o.id 
       WHERE u.email = $1`,
      [email]
    )

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const user = userResult.rows[0]
    const match = await comparePassword(password, user.password_hash)

    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const token = await generateToken({
      userId: user.id,
      orgId: user.org_id,
      role: user.role as any,
    })

    // Return complete user data so the frontend AuthUser is fully populated
    res.json({
      token,
      userId: user.id,
      orgId: user.org_id,
      orgSlug: user.slug,
      role: user.role,
    })
  } catch (err: any) {
    console.error("[Auth] Login failed:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

/**
 * POST /api/auth/student/verify
 * Verifies an invite token and returns a JWT + full student info.
 * Bug fix: now returns actual org slug instead of UUID.
 */
router.post("/student/verify", validate(InviteTokenSchema), async (req: Request, res: Response) => {
  const { token } = req.body

  // Dev bypass: local demo works unless production auth was explicitly enabled.
  if (process.env.ENABLE_AUTH !== "true") {
    const jwtToken = await generateToken({
      userId: "demo-student-id",
      orgId: "demo-org-id",
      role: "student",
    })
    return res.json({
      token: jwtToken,
      userId: "demo-student-id",
      orgId: "demo-org-id",
      orgSlug: "demo",
      name: "Demo Student",
      role: "student",
    })
  }

  if (!hasDatabase()) {
    return res.status(501).json({ error: "Database not configured" })
  }

  try {
    // Join students with orgs to get the actual slug (not UUID)
    const studentResult = await dbQuery<{ id: string; org_id: string; name: string; org_slug: string }>(
      `SELECT s.id, s.org_id, s.name, o.slug AS org_slug
       FROM students s
       JOIN orgs o ON s.org_id = o.id
       WHERE s.invite_token = $1`,
      [token]
    )

    if (studentResult.rows.length === 0) {
      return res.status(401).json({ error: "Invalid invite token" })
    }

    const student = studentResult.rows[0]
    const jwtToken = await generateToken({
      userId: student.id,
      orgId: student.org_id,
      role: "student",
    })

    res.json({
      token: jwtToken,
      userId: student.id,
      orgId: student.org_id,
      orgSlug: student.org_slug, // ← fixed: actual slug not UUID
      name: student.name,
      role: "student",
    })
  } catch (err: any) {
    console.error("[Auth] Student verification failed:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

/**
 * POST /api/auth/student/create
 * Admin-only: creates a student invite record and returns the token.
 */
router.post("/student/create", authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  if (!hasDatabase()) {
    return res.status(501).json({ error: "Database not configured" })
  }

  const { name, email, orgId } = req.body
  if (!name || !orgId) {
    return res.status(400).json({ error: "name and orgId are required" })
  }

  try {
    // Resolve orgId if slug was provided
    let resolvedOrgId = orgId
    const orgCheck = await dbQuery<{ id: string }>(
      "SELECT id FROM orgs WHERE id::text = $1 OR slug = $1",
      [orgId]
    )
    if (orgCheck.rows.length > 0) {
      resolvedOrgId = orgCheck.rows[0].id
    }

    // Generate a secure CSPRNG invite token (e.g., A1B2-C3D4)
    const raw = crypto.randomBytes(4).toString("hex").toUpperCase()
    const inviteToken = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`

    const result = await dbQuery<{ id: string }>(
      "INSERT INTO students (org_id, name, email, invite_token) VALUES ($1, $2, $3, $4) RETURNING id",
      [resolvedOrgId, name, email || null, inviteToken]
    )

    res.status(201).json({ id: result.rows[0].id, name, inviteToken })
  } catch (err: any) {
    console.error("[Auth] Student create failed:", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
