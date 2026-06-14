import { Router, Request, Response } from "express"
import { getTenantConfigBySlug, hasDatabase, recordEvaluation, recordAgentEvent } from "../lib/db.js"
import { validate, EvaluateRequestSchema } from "../middleware/validation.js"
import { pythonEvaluate } from "../tools/pythonBridge.js"
import { EvaluateRequestBody, TenantConfig } from "../types/index.js"

const router = Router()

router.post("/", validate(EvaluateRequestSchema), async (req: Request, res: Response) => {
  const body = req.body as EvaluateRequestBody

  if (!body.conversationHistory || !body.studentName) {
    return res.status(400).json({ error: "conversationHistory and studentName are required" })
  }

  console.log(`[Evaluate] Starting evaluation for: ${body.studentName}`)

  let tenant = null
  if (body.orgSlug && hasDatabase()) {
    try {
      tenant = await getTenantConfigBySlug(body.orgSlug)
    } catch (e) {
      // Ignore
    }
  }

  try {
    const finalCode = body.codeSnapshots[body.codeSnapshots.length - 1] || body.finalCode || ""
    
    // Call Python Eval Service
    const bridgeResp = await pythonEvaluate({
      final_code: finalCode,
      assessment_type: tenant?.exam.type || body.assessmentType || "coding",
      test_cases: tenant?.exam.testCases || [],
      conversation_history: [{ "role": "student", "content": body.conversationHistory }], // simplified
      code_snapshots: body.codeSnapshots,
      time_elapsed: body.timeElapsedSeconds,
      curveball_fired: body.curveballFired,
      curveball_addressed: body.curveballAddressed,
      hints_given: 0,
      rubric: tenant?.rubric || { dimensions: [], passing_score: 5 },
      org_slug: body.orgSlug || ""
    })

    let result = bridgeResp.data

    if (!bridgeResp.success || !result) {
      throw new Error(bridgeResp.error || "Empty evaluation result")
    }

    // Convert snake_case to camelCase
    const formattedResult = {
      testsPassed: result.tests_passed,
      testsTotal: result.tests_total,
      technicalAccuracy: result.technical_accuracy,
      adaptability: result.adaptability,
      communication: result.communication,
      efficiency: result.efficiency,
      doubtResolution: result.doubt_resolution,
      overallFeedback: result.overall_feedback,
      strengths: result.strengths,
      improvements: result.improvements,
      passed: result.passed,
      dimensionScores: result.dimension_scores,
      overallScore: result.overall_score
    }

    if (body.sessionId && hasDatabase()) {
      try {
        await recordEvaluation({ sessionId: body.sessionId, result: formattedResult as any })
        await recordAgentEvent({
          sessionId: body.sessionId,
          eventType: "evaluation",
          actor: "system",
          content: "Session evaluated",
          metadata: {
            passed: formattedResult.passed,
            technicalAccuracy: formattedResult.technicalAccuracy,
            adaptability: formattedResult.adaptability,
            communication: formattedResult.communication,
            efficiency: formattedResult.efficiency,
          },
        })
      } catch (err: any) {
        console.warn("[Evaluate] Persistence skipped:", err?.message)
      }
    }

    return res.json(formattedResult)
  } catch (err: any) {
    console.error("[Evaluate] Failed:", err?.message)
    return res.status(500).json({ error: "Evaluation failed" })
  }
})

export default router
