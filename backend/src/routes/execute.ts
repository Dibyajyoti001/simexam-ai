import { Router, Request, Response } from "express"
import { hasDatabase, recordAgentEvent, recordCodeSnapshot } from "../lib/db.js"
import { deriveCodeState } from "../lib/examStateManager.js"
import { validate, ExecuteRequestSchema } from "../middleware/validation.js"
import { executeSandbox } from "../tools/sandboxTool.js"
import { authenticateJWT } from "../middleware/authMiddleware.js"

const router = Router()

router.post("/", authenticateJWT, validate(ExecuteRequestSchema), async (req: Request, res: Response) => {
  const { code, language, sessionId } = req.body

  try {
    const result = await executeSandbox(code, language || "javascript")
    const codeState = deriveCodeState(code)

    if (sessionId && hasDatabase()) {
      await recordCodeSnapshot({
        sessionId,
        code,
        codeState,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        testResults: {
          testsPassed: result.testsPassed,
          testsTotal: result.testsTotal,
        },
      })
      
      const status = result.exitCode === 0 ? "success" : "error"
      await recordAgentEvent({
        sessionId,
        eventType: "code_run",
        actor: "student",
        content: "Code executed",
        metadata: { codeState, status, testsPassed: result.testsPassed, testsTotal: result.testsTotal },
      })
    }

    const status = result.exitCode === 0 ? "success" : "error"
    return res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      status,
      lines: [
        result.exitCode === 0 ? "Accepted" : "Execution failed",
        ...result.stdout.trim().split("\n").filter(Boolean),
        ...result.stderr.trim().split("\n").filter(Boolean),
      ],
      testsPassed: result.testsPassed,
      testsTotal: result.testsTotal,
    })
  } catch (err: any) {
    console.error("[Execute] Failed:", err?.message)
    return res.status(500).json({ error: "Execution failed" })
  }
})

export default router
