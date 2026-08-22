import { Router, Request, Response } from "express"
import {
  createExamSession,
  getExamSession,
  hasDatabase,
  listSessionEvents,
  recordAgentEvent,
  recordCodeSnapshot,
  submitSession,
  dbQuery,
  getTenantConfigBySlug,
} from "../lib/db.js"
import { deriveCodeState } from "../lib/examStateManager.js"
import { authenticateJWT, requireStudentAccess } from "../middleware/authMiddleware.js"
import { generateExamConfig } from "../agents/examGenerator.js"
import { prefillSessionCache } from "../lib/speculativePrefill.js"

const router = Router()

/**
 * POST /api/session
 * Creates a new exam session and triggers speculative CAG prefill in background.
 */
router.post("/", async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  const { orgSlug, studentName, email, inviteToken } = req.body || {}
  if (!orgSlug || !studentName) {
    return res.status(400).json({ error: "orgSlug and studentName are required" })
  }

  try {
    const session = await createExamSession({ orgSlug, studentName, email, inviteToken })
    await recordAgentEvent({
      sessionId: session.id,
      eventType: "message",
      actor: "system",
      content: "Session started",
      metadata: { orgSlug, studentName },
    })

    // Speculative CAG prefill in background (primes zero-latency responses for first turn)
    getTenantConfigBySlug(orgSlug)
      .then((cfg) => {
        if (cfg) prefillSessionCache(session.id, cfg).catch(() => {})
      })
      .catch(() => {})

    return res.status(201).json(session)
  } catch (err: any) {
    console.error("[Session] Create failed:", err?.message)
    return res.status(500).json({ error: err?.message || "Failed to create session" })
  }
})

/**
 * POST /api/session/generate-learning
 * Generates an on-the-fly custom interactive module for self-learners based on topic and domain.
 */
router.post("/generate-learning", async (req: Request, res: Response) => {
  const { topic, domain, seniority, assessmentType } = req.body

  if (!topic) {
    return res.status(400).json({ error: "topic is required" })
  }

  try {
    const generated = await generateExamConfig({
      prompt: `Create a hands-on Socratic learning challenge and practical simulation for topic: "${topic}".`,
      domain: domain || "Software Engineering",
      seniority: seniority || "Mid-Level",
      assessmentType: assessmentType || "coding",
    })

    return res.json(generated)
  } catch (err: any) {
    console.error("[Session] Learning generation failed:", err?.message || err)
    return res.status(500).json({ error: "Failed to generate learning challenge" })
  }
})

/**
 * GET /api/session/my
 */
router.get("/my", authenticateJWT, async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  const userId = req.user?.userId
  if (!userId) return res.status(401).json({ error: "Authentication required" })

  try {
    const result = await dbQuery(
      `SELECT s.id, s.org_id, s.student_id, s.status, s.started_at, s.submitted_at,
              s.time_elapsed_seconds, s.passed, s.final_code
       FROM sessions s
       WHERE s.student_id = $1
       ORDER BY s.started_at DESC
       LIMIT 20`,
      [userId]
    )
    return res.json(result.rows)
  } catch (err: any) {
    console.error("[Session] My sessions failed:", err?.message)
    return res.status(500).json({ error: "Failed to load sessions" })
  }
})

/**
 * GET /api/session/:sessionId
 */
router.get("/:sessionId", authenticateJWT, requireStudentAccess, async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  try {
    const session = await getExamSession(req.params.sessionId)
    if (!session) return res.status(404).json({ error: "Session not found" })
    return res.json(session)
  } catch (err: any) {
    console.error("[Session] Fetch failed:", err?.message)
    return res.status(500).json({ error: "Failed to load session" })
  }
})

/**
 * GET /api/session/:sessionId/events
 */
router.get("/:sessionId/events", authenticateJWT, requireStudentAccess, async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  try {
    return res.json(await listSessionEvents(req.params.sessionId))
  } catch (err: any) {
    console.error("[Session] Events fetch failed:", err?.message)
    return res.status(500).json({ error: "Failed to load session events" })
  }
})

/**
 * POST /api/session/:sessionId/events
 */
router.post("/:sessionId/events", authenticateJWT, requireStudentAccess, async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  const { eventType, actor, content, metadata } = req.body || {}
  if (!eventType || !actor) {
    return res.status(400).json({ error: "eventType and actor are required" })
  }

  try {
    await recordAgentEvent({
      sessionId: req.params.sessionId,
      eventType,
      actor,
      content,
      metadata,
    })
    return res.status(201).json({ ok: true })
  } catch (err: any) {
    console.error("[Session] Event write failed:", err?.message)
    return res.status(500).json({ error: "Failed to record event" })
  }
})

/**
 * POST /api/session/:sessionId/snapshots
 */
router.post("/:sessionId/snapshots", authenticateJWT, requireStudentAccess, async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  const { code, stdout, stderr, exitCode, testResults } = req.body || {}
  if (!code) return res.status(400).json({ error: "code is required" })

  try {
    await recordCodeSnapshot({
      sessionId: req.params.sessionId,
      code,
      codeState: deriveCodeState(code),
      stdout,
      stderr,
      exitCode,
      testResults,
    })
    return res.status(201).json({ ok: true })
  } catch (err: any) {
    console.error("[Session] Snapshot write failed:", err?.message)
    return res.status(500).json({ error: "Failed to record code snapshot" })
  }
})

/**
 * POST /api/session/:sessionId/submit
 * Computes server-authoritative elapsed time against database started_at.
 */
router.post("/:sessionId/submit", authenticateJWT, requireStudentAccess, async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  const { finalCode, timeElapsedSeconds, curveballFired } = req.body || {}
  if (!finalCode) return res.status(400).json({ error: "finalCode is required" })

  try {
    // Determine server-authoritative elapsed time
    let authoritativeElapsed = timeElapsedSeconds || 0
    const existingSession = await getExamSession(req.params.sessionId)
    if (existingSession?.startedAt) {
      const serverSeconds = Math.max(1, Math.round((Date.now() - new Date(existingSession.startedAt).getTime()) / 1000))
      authoritativeElapsed = serverSeconds
    }

    const session = await submitSession({
      sessionId: req.params.sessionId,
      finalCode,
      timeElapsedSeconds: authoritativeElapsed,
      curveballFired,
    })
    await recordAgentEvent({
      sessionId: req.params.sessionId,
      eventType: "submission",
      actor: "student",
      content: "Assessment submitted",
      metadata: { timeElapsedSeconds: authoritativeElapsed, curveballFired },
    })
    return res.json(session)
  } catch (err: any) {
    console.error("[Session] Submit failed:", err?.message)
    return res.status(500).json({ error: "Failed to submit session" })
  }
})

export default router
