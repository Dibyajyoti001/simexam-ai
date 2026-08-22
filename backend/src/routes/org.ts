import { Router, Request, Response } from "express"
import {
  getTenantConfigBySlug,
  hasDatabase,
  listOrgSessions,
  NEON_SCHEMA_SQL,
  upsertTenantConfig,
  dbQuery,
} from "../lib/db.js"
import { cacheDel, cacheGet, cacheSet } from "../lib/cache.js"
import { authenticateJWT, requireAdmin } from "../middleware/authMiddleware.js"
import { generateExamConfig } from "../agents/examGenerator.js"
import { TenantConfig } from "../types/index.js"

const router = Router()

/**
 * GET /api/org/schema.sql
 */
router.get("/schema.sql", (_req: Request, res: Response) => {
  res.type("text/plain").send(NEON_SCHEMA_SQL.trim())
})

/**
 * GET /api/org/:orgSlug/config
 */
router.get("/:orgSlug/config", async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  try {
    const cacheKey = `org:${req.params.orgSlug}:config`
    const cached = await cacheGet<TenantConfig>(cacheKey)
    if (cached) return res.json(cached)

    const config = await getTenantConfigBySlug(req.params.orgSlug)
    if (!config) return res.status(404).json({ error: "Org config not found" })
    await cacheSet(cacheKey, config, 3600)
    return res.json(config)
  } catch (err: any) {
    console.error("[Org] Config fetch failed:", err?.message)
    return res.status(500).json({ error: "Failed to load org config" })
  }
})

/**
 * PUT /api/org/:orgSlug/config
 */
router.put("/:orgSlug/config", authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  const config = req.body as TenantConfig
  if (!config?.branding?.name || !config?.exam?.title || !config?.exam?.starterCode) {
    return res.status(400).json({ error: "branding.name, exam.title, and exam.starterCode are required" })
  }

  try {
    const saved = await upsertTenantConfig({ ...config, orgSlug: req.params.orgSlug })
    await cacheDel(`org:${req.params.orgSlug}:config`)
    return res.json(saved)
  } catch (err: any) {
    console.error("[Org] Config upsert failed:", err?.message)
    return res.status(500).json({ error: "Failed to save org config" })
  }
})

/**
 * POST /api/org/:orgSlug/generate-exam
 * Admin or Creator generates a complete domain-agnostic exam using AI from a prompt,
 * question criteria, or uploaded doc snippet.
 */
router.post("/:orgSlug/generate-exam", authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  const { prompt, domain, seniority, assessmentType, allowedLanguages, docText } = req.body

  if (!prompt && !docText) {
    return res.status(400).json({ error: "prompt or docText is required" })
  }

  try {
    const generated = await generateExamConfig({
      prompt: prompt || "Generate a comprehensive practical assessment based on the provided document.",
      domain,
      seniority,
      assessmentType,
      allowedLanguages,
      docText,
      orgSlug: req.params.orgSlug,
    })

    return res.json(generated)
  } catch (err: any) {
    console.error("[Org] AI Exam generation failed:", err?.message || err)
    return res.status(500).json({ error: err?.message || "Failed to generate exam with AI" })
  }
})

/**
 * GET /api/org/:orgSlug/sessions
 */
router.get("/:orgSlug/sessions", authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  try {
    return res.json(await listOrgSessions(req.params.orgSlug))
  } catch (err: any) {
    console.error("[Org] Sessions fetch failed:", err?.message)
    return res.status(500).json({ error: "Failed to load sessions" })
  }
})

/**
 * GET /api/org/:orgSlug/students
 */
router.get("/:orgSlug/students", authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  try {
    const orgResult = await dbQuery<{ id: string }>("SELECT id FROM orgs WHERE slug = $1", [req.params.orgSlug])
    if (orgResult.rows.length === 0) return res.status(404).json({ error: "Org not found" })

    const orgId = orgResult.rows[0].id
    const students = await dbQuery(
      "SELECT id, name, email, invite_token, created_at FROM students WHERE org_id = $1 ORDER BY created_at DESC",
      [orgId]
    )
    return res.json(students.rows)
  } catch (err: any) {
    console.error("[Org] Students fetch failed:", err?.message)
    return res.status(500).json({ error: "Failed to load students" })
  }
})

export default router
