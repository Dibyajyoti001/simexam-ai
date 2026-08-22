import { Router, Request, Response } from "express"
import { runAgentLoop } from "../agents/agentLoop.js"
import { getTenantConfigBySlug, hasDatabase } from "../lib/db.js"
import { AgentTrigger } from "../types/index.js"
import { createInitialExamState } from "../lib/examStateManager.js"
import { authenticateJWT } from "../middleware/authMiddleware.js"

const router = Router()

/**
 * POST /api/agent
 * Accepts a proactive agent trigger and returns the collected response as JSON.
 */
router.post("/", authenticateJWT, async (req: Request, res: Response) => {
  const { type, action, sessionId, orgSlug, examState } = req.body

  if (!action || !sessionId) {
    return res.status(400).json({ error: "action and sessionId are required" })
  }

  try {
    // Load tenant config from DB if available
    let tenantConfig = null
    if (orgSlug && hasDatabase()) {
      try {
        tenantConfig = await getTenantConfigBySlug(orgSlug)
      } catch (e) {
        console.warn("[Agent] Could not load tenant config, using defaults")
      }
    }

    // Provide a default fallback if no DB or no tenant found
    if (!tenantConfig) {
      tenantConfig = {
        orgId: "default-org",
        orgSlug: orgSlug || "default",
        branding: { name: "SimExam", primaryColor: "indigo-500" },
        exam: {
          title: "Demo Exam",
          problemStatement: "Solve the problem.",
          starterCode: "",
          allowedLanguages: ["javascript"],
          timeLimitSeconds: 3600,
          curveballAtSeconds: 1800,
          testCases: [],
          knowledgeBaseUrls: [],
        },
        agent: {
          personaName: "Alex",
          personaRole: "Interviewer",
        },
        rubric: {
          dimensions: [],
          passingScore: 5,
        },
      } as any
    }

    const trigger: AgentTrigger = {
      type: "proactive",
      proactiveAction: action,
      sessionId: sessionId || "anon",
      orgSlug: orgSlug || "default",
      examState: examState || createInitialExamState(),
      tenantConfig,
    }

    // Collect chunks from the stream callback
    const chunks: string[] = []
    const callback = (chunk: string) => {
      chunks.push(chunk)
    }

    await runAgentLoop(trigger, callback)

    return res.json({ ok: true, chunks })
  } catch (err: any) {
    console.error("[Agent] Route error:", err?.message)
    return res.status(500).json({ error: "Agent loop failed" })
  }
})

export default router
