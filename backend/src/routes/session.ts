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
} from "../lib/db.js"
import { deriveCodeState } from "../lib/examStateManager.js"
import { authenticateJWT, requireStudentAccess } from "../middleware/authMiddleware.js"
import { generateExamConfig } from "../agents/examGenerator.js"

const router = Router()

/**
 * POST /api/session
 * Creates a new exam session.
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
      `SELECT es.id, es.org_id, es.student_id, es.status, es.started_at, es.submitted_at,
              es.time_elapsed_seconds, es.passed, es.final_code
       FROM exam_sessions es
       WHERE es.student_id = $1
       ORDER BY es.started_at DESC
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
router.post("/:sessionId/events", async (req: Request, res: Response) => {
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
router.post("/:sessionId/snapshots", async (req: Request, res: Response) => {
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
 */
router.post("/:sessionId/submit", async (req: Request, res: Response) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  const { finalCode, timeElapsedSeconds, curveballFired } = req.body || {}
  if (!finalCode) return res.status(400).json({ error: "finalCode is required" })

  try {
    const session = await submitSession({
      sessionId: req.params.sessionId,
      finalCode,
      timeElapsedSeconds,
      curveballFired,
    })
    await recordAgentEvent({
      sessionId: req.params.sessionId,
      eventType: "submission",
      actor: "student",
      content: "Assessment submitted",
      metadata: { timeElapsedSeconds, curveballFired },
    })
    return res.json(session)
  } catch (err: any) {
    console.error("[Session] Submit failed:", err?.message)
    return res.status(500).json({ error: "Failed to submit session" })
  }
})

export default router
