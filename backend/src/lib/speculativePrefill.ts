import { buildCAGKey, cagLookup, cagStore } from "../tools/cagTool.js"
import { createSimulatorModel } from "../agents/simulator.js"
import { buildCompressedContext, enforceAlternatingRoles } from "./contextBuilder.js"
import { createInitialExamState } from "./examStateManager.js"
import { withRetry } from "./retryWrapper.js"
import { TenantConfig, GeminiMessage, ExamState, IntentClass } from "../types/index.js"

// ── Predicted first-turn intents ──────────────────────────────────

const PREFILL_INTENTS: Array<{ intent: IntentClass; codeState: string }> = [
  { intent: "HINT_REQUEST", codeState: "INITIAL" },
  { intent: "CONCEPT_QUESTION", codeState: "INITIAL" },
  { intent: "DONE_SIGNAL", codeState: "INITIAL" },
]

/**
 * Speculatively pre-generates and caches responses for the most likely
 * first-turn intents. This runs async and non-blocking so it never delays
 * the session start.
 *
 * Call this after session creation.
 */
export async function prefillSessionCache(
  sessionId: string,
  tenantConfig: TenantConfig
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.log("[SpecPrefill] Skipping — no GEMINI_API_KEY")
    return
  }

  console.log(`[SpecPrefill] Starting prefill for session ${sessionId}`)

  const initialState = createInitialExamState()
  const studentName = "Candidate" // Generic for prefill

  for (const { intent, codeState } of PREFILL_INTENTS) {
    const key = buildCAGKey(intent, codeState, false, tenantConfig.orgSlug)

    try {
      // Check if already cached
      const existing = await cagLookup(key)
      if (existing) {
        console.log(`[SpecPrefill] Key already cached: ${key}`)
        continue
      }

      // Build a synthetic context for this predicted turn
      const syntheticMessages: GeminiMessage[] = [
        {
          role: "user",
          parts: [
            {
              text: getSyntheticMessage(intent, tenantConfig),
            },
          ],
        },
      ]

      const examState: ExamState = {
        ...initialState,
        lastCodeState: codeState as ExamState["lastCodeState"],
        lastIntentClass: intent,
      }

      const compressed = buildCompressedContext(
        enforceAlternatingRoles(syntheticMessages),
        examState
      )

      const model = createSimulatorModel(apiKey, studentName, tenantConfig)
      const result = await withRetry(
        () => model.generateContent({ contents: compressed }),
        2,
        `SpecPrefill:${intent}`
      )

      const text = result.response.text()
      if (text) {
        await cagStore(key, text, 86400)
        console.log(`[SpecPrefill] Cached: ${key} (${text.length} chars)`)
      }
    } catch (err: any) {
      // Non-fatal: prefill is best-effort
      console.warn(`[SpecPrefill] Failed for ${key}:`, err?.message)
    }
  }

  console.log(`[SpecPrefill] Prefill complete for session ${sessionId}`)
}

// ── Synthetic messages for predicted turns ────────────────────────

function getSyntheticMessage(intent: IntentClass, config: TenantConfig): string {
  switch (intent) {
    case "HINT_REQUEST":
      return "I'm not sure where to start. Can you give me a hint about what's wrong with this code?"
    case "CONCEPT_QUESTION":
      return "What is the time complexity of bubble sort and why is it slow for large inputs?"
    case "DONE_SIGNAL":
      return "I think I'm done. The code looks correct to me now."
    default:
      return "Hello, I'm looking at the code now."
  }
}
