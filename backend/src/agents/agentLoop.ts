import { routeIntent } from "./intentRouter.js"
import { classifyIntent } from "./intentClassifier.js"
import { buildCompressedContext, enforceAlternatingRoles } from "../lib/contextBuilder.js"
import { createSimulatorModel } from "./simulator.js"
import { withRetry } from "../lib/retryWrapper.js"
import { buildCAGKey, cagStore } from "../tools/cagTool.js"
import { SemanticCache } from "../lib/semanticCache.js"
import { computeEmbedding } from "../lib/embeddings.js"
import {
  getTenantConfigBySlug,
  hasDatabase,
  recordAgentEvent,
  listSessionEvents,
} from "../lib/db.js"
import {
  AgentTrigger,
  AgentLoopContext,
  GeminiMessage,
  ToolResult,
  IntentClass,
} from "../types/index.js"

// Intents that are worth caching after an LLM call
const CACHEABLE_INTENTS: Set<IntentClass> = new Set([
  "HINT_REQUEST",
  "CONCEPT_QUESTION",
  "DOUBT_DEEP",
])

/**
 * Core orchestrator for every agent turn.
 *
 * 1. Build context: load tenant config, compress message history
 * 2. Intent routing & CAG check (instant 0ms for static/prefilled/sandbox turns)
 * 3. Semantic Cache Check (only on non-static turns if needed)
 * 4. LLM Generation (streamed directly to client)
 * 5. Persist agent event with real latency metrics
 */
export async function runAgentLoop(
  trigger: AgentTrigger,
  streamCallback: (chunk: string) => void
): Promise<void> {
  const startTime = Date.now()

  try {
    // ── 1. Build context ─────────────────────────────────────────
    const tenantConfig = trigger.tenantConfig
    const messages = await buildMessagesFromTrigger(trigger)

    const context: AgentLoopContext = {
      sessionId: trigger.sessionId,
      orgSlug: trigger.orgSlug,
      tenantConfig,
      examState: trigger.examState,
      messages,
      studentName: extractStudentName(trigger),
    }

    let result: ToolResult | null = null

    // ── 2. First Route via Instant CAG & Intent Classifiers ───────
    try {
      result = await routeIntent(trigger, context)
    } catch (err: any) {
      console.warn("[AgentLoop] routeIntent threw, falling back to cache/LLM:", err?.message)
    }

    // ── 3. Check Semantic Cache if turn was not resolved by CAG ──
    if ((!result || !result.resolved) && trigger.type !== "proactive" && trigger.message) {
      try {
        const queryEmbedding = await computeEmbedding(trigger.message)
        const cached = await SemanticCache.search(trigger.message, tenantConfig.orgId, queryEmbedding)
        if (cached) {
          result = {
            resolved: true,
            source: "cache",
            content: cached.response,
          }
        }
      } catch (err: any) {
        console.warn("[AgentLoop] SemanticCache search error:", err?.message)
      }
    }

    // ── 4. Fallback to LLM if still unresolved ───────────────────
    if (!result || !result.resolved) {
      result = await fallbackLLMResponse(trigger, context)
    }

    // ── 5. Stream or Deliver Response ────────────────────────────
    if (result.source === "llm" && result.content.length > 50) {
      // Chunk tokens smoothly to client SSE stream
      const words = result.content.split(" ")
      let buffer = ""
      for (let i = 0; i < words.length; i++) {
        buffer += (i > 0 ? " " : "") + words[i]
        if (buffer.length > 25 || i === words.length - 1) {
          streamCallback(JSON.stringify({ text: buffer, source: result.source }))
          buffer = ""
        }
      }
    } else {
      // CAG / static / sandbox — deliver instantaneously
      streamCallback(JSON.stringify({ text: result.content, source: result.source }))
    }

    const latency = Date.now() - startTime

    // ── 6. Persist agent event ───────────────────────────────────
    if (hasDatabase() && trigger.sessionId) {
      const intent = trigger.type === "proactive"
        ? (trigger.proactiveAction || "SILENCE_TIMEOUT")
        : classifyIntent(trigger.message || "")

      try {
        await recordAgentEvent({
          sessionId: trigger.sessionId,
          eventType: trigger.type === "proactive" ? "proactive" : "message",
          actor: "agent",
          content: result.content,
          metadata: {
            intent,
            source: result.source,
            latencyMs: latency,
            codeState: trigger.examState.lastCodeState,
            ...(result.metadata || {}),
          },
        })
      } catch (err: any) {
        console.warn("[AgentLoop] Event persistence skipped:", err?.message)
      }
    }

    // ── 7. Update CAG & Semantic Cache for future instant turns ──
    if (result.source === "llm") {
      const intent = classifyIntent(trigger.message || "")
      if (CACHEABLE_INTENTS.has(intent)) {
        const cagKey = buildCAGKey(
          intent,
          trigger.examState.lastCodeState,
          trigger.examState.curveballSeen,
          trigger.orgSlug
        )
        // Fire-and-forget CAG store
        cagStore(cagKey, result.content).catch((err) =>
          console.warn("[AgentLoop] CAG store failed:", err?.message)
        )
        
        // Fire-and-forget Semantic Cache store
        if (trigger.message) {
          computeEmbedding(trigger.message)
            .then((emb) => SemanticCache.store(trigger.message!, result!.content, tenantConfig.orgId, emb))
            .catch(() => {})
        }
      }
    }

    console.log(
      `[AgentLoop] Done — source: ${result.source} | latency: ${latency}ms | session: ${trigger.sessionId}`
    )
  } catch (err: any) {
    console.error("[AgentLoop] Fatal error:", err?.message)
    streamCallback(
      JSON.stringify({
        text: "I ran into a brief hiccup. Could you restate or continue with your code?",
        source: "llm",
      })
    )
  }
}

// ── Helpers ───────────────────────────────────────────────────────

async function buildMessagesFromTrigger(trigger: AgentTrigger): Promise<GeminiMessage[]> {
  const messages: GeminiMessage[] = []

  if (hasDatabase() && trigger.sessionId) {
    try {
      const events = await listSessionEvents(trigger.sessionId)
      for (const ev of events) {
        if (ev.eventType === "message") {
          messages.push({
            role: ev.actor === "student" ? "user" : "model",
            parts: [{ text: ev.content || "" }],
          })
        }
      }
    } catch {
      // Fallback
    }
  }

  if (trigger.message) {
    messages.push({
      role: "user",
      parts: [{ text: trigger.message }],
    })
  }

  return messages
}

function extractStudentName(trigger: AgentTrigger): string {
  return trigger.studentName || "Candidate"
}

async function fallbackLLMResponse(
  trigger: AgentTrigger,
  context: AgentLoopContext
): Promise<ToolResult> {
  const apiKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || "dummy"
  const model = createSimulatorModel(apiKey, context.studentName, context.tenantConfig)

  const compressed = buildCompressedContext(
    enforceAlternatingRoles(context.messages),
    context.examState
  )

  const resp = await withRetry(
    () => model.generateContent({ contents: compressed }),
    2,
    "AgentLoopFallbackLLM"
  )

  return {
    resolved: true,
    source: "llm",
    content: resp.response.text(),
  }
}
