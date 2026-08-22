import { Router, Request, Response } from "express"
import { validate, ChatRequestSchema } from "../middleware/validation.js"
import { runAgentLoop } from "../agents/agentLoop.js"
import { AgentTrigger } from "../types/index.js"
import { getTenantConfigBySlug, hasDatabase } from "../lib/db.js"
import { createInitialExamState } from "../lib/examStateManager.js"

const router = Router()

/**
 * POST /api/chat
 * Streams AI agent responses back via SSE.
 */
router.post("/", validate(ChatRequestSchema), async (req: Request, res: Response) => {
  const { messages, studentName, examState, sessionId, orgSlug, assessmentType } = req.body

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
