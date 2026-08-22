import { classifyIntent, CAG_STATIC_REPLIES } from "./intentClassifier.js"
import { createSimulatorModel, buildSimulatorSystemPrompt } from "./simulator.js"
import { buildCompressedContext, enforceAlternatingRoles } from "../lib/contextBuilder.js"
import { withRetry } from "../lib/retryWrapper.js"
import { buildCAGKey, cagLookup, cagStore, getStaticReply } from "../tools/cagTool.js"
import { executeSandbox } from "../tools/sandboxTool.js"
import { pythonRetrieve, isPythonAvailable } from "../tools/pythonBridge.js"
import { searchWeb } from "../tools/webSearchTool.js"
import { fetchDocs } from "../tools/docFetcherTool.js"
import {
  IntentClass,
  AgentTrigger,
  AgentLoopContext,
  ToolResult,
  IntentHandler,
} from "../types/index.js"

// ── Handler functions ─────────────────────────────────────────────

/**
 * HINT_REQUEST: Socratic hints — check CAG first, then LLM with compressed context.
 */
const hintHandler: IntentHandler = async (trigger, context) => {
  const cagKey = buildCAGKey(
    "HINT_REQUEST",
    trigger.examState.lastCodeState,
    trigger.examState.curveballSeen,
    trigger.orgSlug
  )

  const cached = await cagLookup(cagKey)
  if (cached) {
    return { resolved: true, source: "cag", content: cached }
  }

  const response = await callSimulatorLLM(trigger, context)
  // Cache for next time
  await cagStore(cagKey, response)
  return { resolved: true, source: "llm", content: response }
}

/**
 * CODE_PASTE: Run code in sandbox, then build a response about results.
 */
const codePasteHandler: IntentHandler = async (trigger, context) => {
  const assessmentType = context.tenantConfig?.exam?.type || "coding"
  
  if (assessmentType === "system_design") {
    // Placeholder for Vision Analysis Tool
    return {
      resolved: true,
      source: "llm", // In real system: 'vision_analysis'
      content: "I've reviewed your system design canvas. What are the scaling bottlenecks here?",
      metadata: { assessmentType: "system_design" }
    }
  }

  if (assessmentType === "conceptual") {
    // Treat as an essay submission review
    return {
      resolved: true,
      source: "llm",
      content: "Got it. I'm reviewing your written response now. Can you clarify the second point?",
      metadata: { assessmentType: "conceptual" }
    }
  }

  const code = trigger.code || trigger.message || ""
  const language = context.tenantConfig?.exam?.allowedLanguages?.[0] || "javascript"
  const testCases = context.tenantConfig?.exam?.testCases

  const sandboxResult = await executeSandbox(code, language, testCases)

  const resultSummary = [
    sandboxResult.exitCode === 0 ? "Code executed successfully." : "Code had errors.",
    sandboxResult.stdout ? `stdout: ${sandboxResult.stdout.slice(0, 500)}` : "",
    sandboxResult.stderr ? `stderr: ${sandboxResult.stderr.slice(0, 500)}` : "",
    sandboxResult.testsPassed !== undefined
      ? `Tests: ${sandboxResult.testsPassed}/${sandboxResult.testsTotal} passed`
      : "",
  ]
    .filter(Boolean)
    .join("\n")

  return {
    resolved: true,
    source: "sandbox",
    content: resultSummary,
    metadata: {
      exitCode: sandboxResult.exitCode,
      testsPassed: sandboxResult.testsPassed,
      testsTotal: sandboxResult.testsTotal,
      executionTime: sandboxResult.executionTime,
    },
  }
}

/**
 * CONCEPT_QUESTION: CAG → web search → doc fetch → LLM.
 */
const conceptHandler: IntentHandler = async (trigger, context) => {
  const cagKey = buildCAGKey(
    "CONCEPT_QUESTION",
    trigger.examState.lastCodeState,
    trigger.examState.curveballSeen,
    trigger.orgSlug
  )

  const cached = await cagLookup(cagKey)
  if (cached) {
    return { resolved: true, source: "cag", content: cached }
  }

  // Try RAG retrieval first
  let toolContext = ""
  if (trigger.message && (await isPythonAvailable())) {
    try {
      const ragResult = await pythonRetrieve(trigger.message, context.tenantConfig?.orgId || '', context.sessionId)
      if (ragResult.success && ragResult.data?.length) {
        toolContext += `Relevant knowledge base:\n${ragResult.data.map((chunk: any, i: number) => `[${i + 1}] ${chunk.content}`).join('\n\n')}\n\n`
      }
    } catch (err: any) {
      console.warn('[IntentRouter] RAG retrieval skipped:', err?.message)
    }
  }

  // Try web search
  if (process.env.TAVILY_API_KEY && trigger.message) {
    try {
      const results = await searchWeb(trigger.message)
      if (results.length) {
        toolContext += `Web search excerpts:\n${results
          .map((r) => `Source: ${r.title} (${r.url})\n${r.content}`)
          .join("\n\n")}\n\n`
      }
    } catch (err: any) {
      console.warn("[IntentRouter] Web search skipped:", err?.message)
    }
  }

  // Try doc fetch
  const kbUrls = context.tenantConfig?.exam?.knowledgeBaseUrls
  if (kbUrls && kbUrls.length > 0) {
    try {
      const docs = await fetchDocs(kbUrls)
      if (docs.length) {
        toolContext += `Documentation excerpts:\n${docs
          .map((d) => `Source: ${d.title} (${d.url})\n${d.text}`)
          .join("\n\n")}\n\n`
      }
    } catch (err: any) {
      console.warn("[IntentRouter] Doc fetch skipped:", err?.message)
    }
  }

  // Build LLM response with tool context
  const response = await callSimulatorLLM(trigger, context, toolContext)
  await cagStore(cagKey, response)

  const source = toolContext.includes("Web search") ? "web_search" : toolContext ? "doc_fetch" : "llm"
  return { resolved: true, source, content: response }
}

/**
 * DOUBT_DEEP: CAG → RAG (Python) → LLM with retrieved chunks.
 */
const doubtHandler: IntentHandler = async (trigger, context) => {
  const cagKey = buildCAGKey(
    "DOUBT_DEEP",
    trigger.examState.lastCodeState,
    trigger.examState.curveballSeen,
    trigger.orgSlug
  )

  const cached = await cagLookup(cagKey)
  if (cached) {
    return { resolved: true, source: "cag", content: cached }
  }

  // Try RAG via Python service
  let ragContext = ""
  if (trigger.message && (await isPythonAvailable())) {
    const ragResult = await pythonRetrieve(
      trigger.message,
      context.tenantConfig?.orgId || "",
      context.sessionId
    )
    if (ragResult.success && ragResult.data?.length) {
      ragContext = `Relevant documentation:\n${ragResult.data
        .map((chunk, i) => `[${i + 1}] ${chunk.content}`)
        .join("\n\n")}\n\n`
    }
  }

  // Fallback to doc fetcher if RAG unavailable
  if (!ragContext) {
    const kbUrls = context.tenantConfig?.exam?.knowledgeBaseUrls
    if (kbUrls && kbUrls.length > 0) {
      try {
        const docs = await fetchDocs(kbUrls)
        if (docs.length) {
          ragContext = `Documentation excerpts:\n${docs
            .map((d) => `Source: ${d.title} (${d.url})\n${d.text}`)
            .join("\n\n")}\n\n`
        }
      } catch (err: any) {
        console.warn("[IntentRouter] Doc fetch fallback skipped:", err?.message)
      }
    }
  }

  const response = await callSimulatorLLM(trigger, context, ragContext)
  await cagStore(cagKey, response)

  return { resolved: true, source: ragContext ? "rag" : "llm", content: response }
}

/**
 * CURVEBALL_ACK: Static acknowledgement response.
 */
const curveballHandler: IntentHandler = async (_trigger, _context) => {
  const reply =
    getStaticReply("CURVEBALL_ACK") ||
    "Got it — you've acknowledged the constraint change. Let's see how you adapt your approach."
  return { resolved: true, source: "cag_static", content: reply }
}

/**
 * DONE_SIGNAL: Static reply telling them to run code first.
 */
const doneHandler: IntentHandler = async (_trigger, _context) => {
  const reply =
    getStaticReply("DONE_SIGNAL") ||
    "Good. Before you submit — have you run it on the test cases? What did the terminal show?"
  return { resolved: true, source: "cag_static", content: reply }
}

/**
 * OFF_TOPIC: Static reply redirecting back to the exam.
 */
const offTopicHandler: IntentHandler = async (_trigger, _context) => {
  const reply =
    getStaticReply("OFF_TOPIC") ||
    "Let's stay focused on the task at hand. What's giving you trouble with the code?"
  return { resolved: true, source: "cag_static", content: reply }
}

/**
 * NOVEL_INPUT: Full LLM call with all available context — no caching.
 */
const novelHandler: IntentHandler = async (trigger, context) => {
  const response = await callSimulatorLLM(trigger, context)
  return { resolved: true, source: "llm", content: response }
}

/**
 * Proactive handler: generates contextual nudge based on action type.
 */
const proactiveHandler: IntentHandler = async (trigger, context) => {
  const actionPrompts: Record<string, string> = {
    CODE_STALE:
      "The student hasn't changed their code in a while. Send a gentle, specific nudge about what they might try next based on their current code state.",
    SILENCE_TIMEOUT:
      "The student has been silent for a while. Check in with them — ask a specific question about where they're stuck.",
    CURVEBALL:
      "The PM has just dropped a curveball requirement change. Relay it naturally and ask them how they plan to adapt.",
  }

  const actionType = trigger.proactiveAction || "CODE_STALE"
  const promptOverride = actionPrompts[actionType] || actionPrompts.CODE_STALE

  const response = await callSimulatorLLM(trigger, context, `[SYSTEM_INSTRUCTION] ${promptOverride}`)
  return { resolved: true, source: "llm", content: response }
}

// ── Handler Map ───────────────────────────────────────────────────

export const HANDLER_MAP: Record<IntentClass, IntentHandler> = {
  HINT_REQUEST: hintHandler,
  CODE_PASTE: codePasteHandler,
  CONCEPT_QUESTION: conceptHandler,
  DOUBT_DEEP: doubtHandler,
  CURVEBALL_ACK: curveballHandler,
  DONE_SIGNAL: doneHandler,
  OFF_TOPIC: offTopicHandler,
  NOVEL_INPUT: novelHandler,
  SILENCE_TIMEOUT: proactiveHandler,
  CODE_STALE: proactiveHandler,
}

// ── Router ────────────────────────────────────────────────────────

/**
 * Routes an agent trigger to the appropriate handler based on intent classification.
 * For proactive triggers, the intent is taken directly from the trigger type.
 */
export async function routeIntent(
  trigger: AgentTrigger,
  context: AgentLoopContext
): Promise<ToolResult> {
  let intent: IntentClass

  if (trigger.type === "proactive" || trigger.type === "curveball") {
    intent = (trigger.proactiveAction as IntentClass) || "SILENCE_TIMEOUT"
  } else {
    intent = classifyIntent(trigger.message || "")
  }

  const assessmentType = trigger.assessmentType || context.tenantConfig?.exam?.type || "coding"
  console.log(`[IntentRouter] Intent: ${intent} | Domain: ${assessmentType} | Session: ${trigger.sessionId}`)



  const handler = HANDLER_MAP[intent]
  if (!handler) {
    console.warn(`[IntentRouter] No handler for intent: ${intent}, falling back to novelHandler`)
    return novelHandler(trigger, context)
  }

  try {
    return await handler(trigger, context)
  } catch (err: any) {
    console.error("[IntentRouter] Handler %s failed: %s", intent, err?.message)
    // Fall back to generic LLM
    try {
      const fallback = await callSimulatorLLM(trigger, context)
      return { resolved: true, source: "llm", content: fallback }
    } catch (llmErr: any) {
      return {
        resolved: false,
        source: "llm",
        content: "I'm having a bit of trouble right now. Can you try that again in a moment?",
      }
    }
  }
}

// ── LLM call helper ──────────────────────────────────────────────

async function callSimulatorLLM(
  trigger: AgentTrigger,
  context: AgentLoopContext,
  extraContext?: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured")

  // Build messages with optional extra context
  let messages = [...context.messages]
  
  // Inject domain context globally so all handlers (RAG, Web Search) maintain persona
  const assessmentType = trigger.assessmentType || context.tenantConfig?.exam?.type || "coding"
  if (assessmentType !== "coding") {
    const domainContext = `[ASSESSMENT_TYPE] This is a ${assessmentType} assessment. Adjust your persona to focus on ${
      assessmentType === "system_design" ? "architecture, scalability, and design patterns" : "theoretical concepts and written explanations"
    } rather than code syntax.`
    messages.push({
      role: "user",
      parts: [{ text: `[SYSTEM_STATE]\n${domainContext}` }],
    })
  }

  if (extraContext) {
    messages.push({
      role: "user",
      parts: [{ text: `[SYSTEM_STATE]\n${extraContext}` }],
    })
  }

  const compressed = buildCompressedContext(
    enforceAlternatingRoles(messages),
    context.examState
  )

  const model = createSimulatorModel(apiKey, context.studentName, context.tenantConfig)
  const result = await withRetry(
    () => model.generateContent({ contents: compressed }),
    3,
    "IntentRouter LLM"
  )

  return result.response.text()
}
