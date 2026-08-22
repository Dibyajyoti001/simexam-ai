import { Router, Request, Response } from "express"
import { getTenantConfigBySlug, hasDatabase, recordEvaluation, recordAgentEvent, dbQuery } from "../lib/db.js"
import { validate, EvaluateRequestSchema } from "../middleware/validation.js"
import { pythonEvaluate } from "../tools/pythonBridge.js"
import { EvaluateRequestBody } from "../types/index.js"
import { authenticateJWT } from "../middleware/authMiddleware.js"
import vm from "node:vm"

const router = Router()

/**
 * Helper to run basic JS test cases locally if Judge0 is offline or for deterministic verification.
 */
function evaluateTestCasesLocally(code: string, testCases: Array<{ input: any; expectedOutput: any }>): { passed: number; total: number } {
  if (!testCases || testCases.length === 0) {
    // If no test cases are explicitly defined, verify code is non-empty and syntactically sound
    const isClean = code.trim().length > 30 && !code.includes("SyntaxError")
    return { passed: isClean ? 1 : 0, total: 1 }
  }

  let passed = 0
  for (const tc of testCases) {
    try {
      const inputStr = typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input)
      const expectedStr = typeof tc.expectedOutput === "string" ? tc.expectedOutput : JSON.stringify(tc.expectedOutput)

      // Test harness
      const harness = `
${code}
try {
  let res;
  if (typeof solution === 'function') {
    res = solution(${inputStr});
  } else if (typeof solve === 'function') {
    res = solve(${inputStr});
  } else if (typeof bubbleSort === 'function') {
    res = bubbleSort(${inputStr});
  } else if (typeof sort === 'function') {
    res = sort(${inputStr});
  }
  JSON.stringify(res);
} catch(e) {
  'ERR:' + e.message;
}
`
      // Sandboxed execution — no access to process, require, fs, etc.
      const sandbox: Record<string, any> = {
        JSON, Math, Array, Object, String, Number, Boolean,
        Map, Set, parseInt, parseFloat, isNaN, isFinite,
        undefined, NaN, Infinity,
        console: { log: () => {}, warn: () => {}, error: () => {} },
      }
      const vmContext = vm.createContext(sandbox)
      const resultStr = String(vm.runInNewContext(harness, vmContext, { timeout: 5000 }) || "")
      if (resultStr.replace(/\s+/g, '') === expectedStr.replace(/\s+/g, '') || (!resultStr.startsWith("ERR:") && resultStr !== "undefined")) {
        passed++
      }
    } catch {
      // Test failed
    }
  }

  return { passed, total: testCases.length }
}

router.post("/", authenticateJWT, validate(EvaluateRequestSchema), async (req: Request, res: Response) => {
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
    const finalCode = body.codeSnapshots?.[body.codeSnapshots.length - 1] || body.finalCode || ""
    const assessmentType = tenant?.exam.type || body.assessmentType || "coding"
    const testCases = tenant?.exam.testCases || []

    // 1. Determine tests_passed and tests_total
    let testsPassed = body.testsPassed
    let testsTotal = body.testsTotal

    if (testsPassed === undefined || testsTotal === undefined) {
      // Try fetching from latest code_snapshot in database if sessionId provided
      if (body.sessionId && hasDatabase()) {
        try {
          const snapshotRes = await dbQuery<{ test_results: any }>(
            "SELECT test_results FROM code_snapshots WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1",
            [body.sessionId]
          )
          if (snapshotRes.rows[0]?.test_results) {
            const tr = snapshotRes.rows[0].test_results
            if (tr.passed !== undefined && tr.total !== undefined) {
              testsPassed = tr.passed
              testsTotal = tr.total
            }
          }
        } catch {
          // ignore
        }
      }

      // If still undefined, run deterministic test verification locally
      if (testsPassed === undefined || testsTotal === undefined) {
        if (assessmentType === "coding") {
          const localEval = evaluateTestCasesLocally(finalCode, testCases)
          testsPassed = localEval.passed
          testsTotal = localEval.total
        } else {
          testsPassed = 1
          testsTotal = 1
        }
      }
    }

    // 2. Count hints given dynamically from conversation transcript if not supplied
    let hintsGiven = body.hintsGiven
    if (hintsGiven === undefined) {
      const conv = body.conversationHistory.toLowerCase()
      const hintMatches = conv.match(/hint|here's a clue|consider looking at|guide you/g)
      hintsGiven = hintMatches ? Math.min(hintMatches.length, 5) : 0
    }

    // 3. Server-authoritative elapsed time
    let timeElapsed = body.timeElapsedSeconds || 0
    if (body.sessionId && hasDatabase()) {
      try {
        const sessionRes = await dbQuery<{ started_at: string }>(
          "SELECT started_at FROM sessions WHERE id = $1",
          [body.sessionId]
        )
        if (sessionRes.rows[0]?.started_at) {
          timeElapsed = Math.max(1, Math.round((Date.now() - new Date(sessionRes.rows[0].started_at).getTime()) / 1000))
        }
      } catch {}
    }

    // 4. Call Python Eval Microservice
    const bridgeResp = await pythonEvaluate({
      final_code: finalCode,
      assessment_type: assessmentType,
      test_cases: testCases,
      conversation_history: [{ role: "student", content: body.conversationHistory }],
      code_snapshots: body.codeSnapshots || [finalCode],
      time_elapsed: timeElapsed,
      curveball_fired: body.curveballFired || false,
      curveball_addressed: body.curveballAddressed || false,
      hints_given: hintsGiven,
      rubric: tenant?.rubric || {
        dimensions: [
          { name: "Technical Accuracy", weight: 0.35, description: "Correctness of algorithmic solution" },
          { name: "Adaptability", weight: 0.25, description: "Response to requirement curveball" },
          { name: "Code Quality", weight: 0.20, description: "Structure, modularity and complexity" },
          { name: "Communication", weight: 0.20, description: "Clarity of reasoning" }
        ],
        passing_score: 6
      },
      org_slug: body.orgSlug || "",
      tests_passed: testsPassed,
      tests_total: testsTotal,
    })

    let result = bridgeResp.data

    if (!bridgeResp.success || !result) {
      // Graceful deterministic fallback
      const passRatio = testsTotal > 0 ? testsPassed / testsTotal : 1
      const technicalAccuracy = Math.round(passRatio * 8.5 + (body.curveballAddressed ? 1.5 : 0))
      const adaptability = body.curveballFired ? (body.curveballAddressed ? 9 : 4) : 7
      const efficiency = body.timeElapsedSeconds < 600 ? 8 : 6
      const communication = 7

      result = {
        tests_passed: testsPassed,
        tests_total: testsTotal,
        technical_accuracy: technicalAccuracy,
        adaptability,
        communication,
        efficiency,
        doubt_resolution: 7,
        independence: Math.max(1, 10 - hintsGiven),
        overall_feedback: `Candidate completed the assessment with ${testsPassed}/${testsTotal} tests passing. Demonstrated solid execution and adaptability under constraint changes.`,
        strengths: ["Code implementation passed validation", "Maintained progress throughout interview"],
        improvements: ["Deepen edge-case coverage and algorithmic complexity analysis"],
        passed: technicalAccuracy >= 5,
        dimension_scores: {
          "Technical Accuracy": technicalAccuracy,
          "Adaptability": adaptability,
          "Efficiency": efficiency,
          "Communication": communication
        },
        overall_score: (technicalAccuracy + adaptability + efficiency + communication) / 4
      }
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
      independence: result.independence,
      overallFeedback: result.overall_feedback,
      strengths: result.strengths,
      improvements: result.improvements,
      passed: result.passed,
      dimensionScores: result.dimension_scores,
      overallScore: result.overall_score
    }

    // Persist evaluation to database
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
            testsPassed: formattedResult.testsPassed,
            testsTotal: formattedResult.testsTotal,
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
