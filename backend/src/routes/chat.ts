import { Router, Request, Response } from "express"
import { validate, ChatRequestSchema } from "../middleware/validation.js"
import { runAgentLoop } from "../agents/agentLoop.js"
import { AgentTrigger, TenantConfig } from "../types/index.js"
import { getTenantConfigBySlug, hasDatabase } from "../lib/db.js"
import { createInitialExamState } from "../lib/examStateManager.js"
import { authenticateJWT } from "../middleware/authMiddleware.js"

const router = Router()

/**
 * POST /api/chat
 * Streams AI agent responses back via SSE.
 */
router.post("/", authenticateJWT, validate(ChatRequestSchema), async (req: Request, res: Response) => {
  const { messages, studentName, examState, sessionId, orgSlug, assessmentType, runtimeConfig } = req.body

  if (!messages || !studentName) {
    return res.status(400).json({ error: "messages and studentName are required" })
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")

  try {
    // Load tenant config from DB if available
    let tenantConfig = null
    if (orgSlug && hasDatabase()) {
      try {
        tenantConfig = await getTenantConfigBySlug(orgSlug)
      } catch (e) {
        console.warn("[Chat] Could not load tenant config, using defaults")
      }
    }
    
    // Runtime configs are only accepted for local demo/learner sessions. Real tenant
    // config remains server-owned in Neon.
    if (!tenantConfig && runtimeConfig && (orgSlug === "demo" || !hasDatabase())) {
      tenantConfig = normalizeRuntimeConfig(runtimeConfig, orgSlug)
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
          knowledgeBaseUrls: []
        },
        agent: {
          personaName: "Alex",
          personaRole: "Interviewer"
        },
        rubric: {
          dimensions: [],
          passingScore: 5
        }
      } as any
    }

    const lastMessage = messages[messages.length - 1]?.parts?.[0]?.text || ""
    const codeMatch = lastMessage.match(/```[\s\S]*?```/)?.[0]

    const trigger: AgentTrigger = {
      type: "student_message",
      sessionId: sessionId || "anon",
      orgSlug: orgSlug || "default",
      message: lastMessage,
      code: codeMatch,
      examState: examState || createInitialExamState(),
      tenantConfig,
      assessmentType,
      studentName: studentName || "Candidate", // ← forward student name to agent
    }

    // agentLoop already stringifies chunks as JSON — just wrap in SSE format
    const streamCallback = (chunk: string) => {
      res.write(`data: ${chunk}\n\n`)
    }

    await runAgentLoop(trigger, streamCallback)

    res.write("data: [DONE]\n\n")
    res.end()
  } catch (err: any) {
    console.error("[Chat] Agent loop error:", err)
    res.write(`data: ${JSON.stringify({ error: "Internal server error" })}\n\n`)
    res.write("data: [DONE]\n\n")
    res.end()
  }
})

export default router

function normalizeRuntimeConfig(input: unknown, orgSlug?: string): TenantConfig | null {
  if (!input || typeof input !== "object") return null
  const value = input as Partial<TenantConfig>
  if (!value.exam || !value.agent || !value.branding || !value.rubric) return null
  if (typeof value.exam.title !== "string" || typeof value.exam.problemStatement !== "string") return null

  return {
    orgId: typeof value.orgId === "string" ? value.orgId.slice(0, 100) : "demo-runtime",
    orgSlug: orgSlug || "demo",
    branding: {
      name: typeof value.branding.name === "string" ? value.branding.name.slice(0, 200) : "SimExam Demo",
      primaryColor: typeof value.branding.primaryColor === "string" ? value.branding.primaryColor.slice(0, 30) : "#6366f1",
      logoUrl: typeof value.branding.logoUrl === "string" ? value.branding.logoUrl.slice(0, 2048) : undefined,
      accentColor: typeof value.branding.accentColor === "string" ? value.branding.accentColor.slice(0, 30) : undefined,
    },
    exam: {
      title: value.exam.title.slice(0, 200),
      description: typeof value.exam.description === "string" ? value.exam.description.slice(0, 2000) : undefined,
      type: value.exam.type || "coding",
      problemStatement: value.exam.problemStatement.slice(0, 10_000),
      starterCode: typeof value.exam.starterCode === "string" ? value.exam.starterCode.slice(0, 50_000) : "",
      allowedLanguages: Array.isArray(value.exam.allowedLanguages) ? value.exam.allowedLanguages.slice(0, 8) : ["javascript"],
      timeLimitSeconds: Number.isFinite(value.exam.timeLimitSeconds) ? Math.max(30, Math.min(value.exam.timeLimitSeconds, 7200)) : 1800,
      curveballAtSeconds: Number.isFinite(value.exam.curveballAtSeconds) ? Math.max(10, Math.min(value.exam.curveballAtSeconds, 7200)) : 600,
      curveballMessage: typeof value.exam.curveballMessage === "string" ? value.exam.curveballMessage.slice(0, 2000) : undefined,
      testCases: Array.isArray(value.exam.testCases) ? value.exam.testCases.slice(0, 50) : [],
      knowledgeBaseUrls: Array.isArray(value.exam.knowledgeBaseUrls) ? value.exam.knowledgeBaseUrls.slice(0, 20) : [],
    },
    agent: {
      personaName: typeof value.agent.personaName === "string" ? value.agent.personaName.slice(0, 100) : "Alex Chen",
      personaRole: typeof value.agent.personaRole === "string" ? value.agent.personaRole.slice(0, 200) : "Technical interviewer",
      systemPromptAdditions: typeof value.agent.systemPromptAdditions === "string" ? value.agent.systemPromptAdditions.slice(0, 5000) : undefined,
    },
    rubric: {
      dimensions: Array.isArray(value.rubric.dimensions) ? value.rubric.dimensions.slice(0, 12) : [],
      passingScore: Number.isFinite(value.rubric.passingScore) ? Math.max(0, Math.min(value.rubric.passingScore, 10)) : 6,
    },
  }
}
