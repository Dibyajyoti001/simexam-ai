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
 * 2. Route: call routeIntent to pick the right handler & get ToolResult
 * 3. Compose: stream or send the response via streamCallback
 * 4. Persist: record agent_event with intent, source, latency
 * 5. Update CAG: if response came from LLM and intent is cacheable
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

    // ── 1.5. Semantic Cache Check ────────────────────────────────
    let result: ToolResult | null = null

    if (trigger.type !== "proactive" && trigger.message) {
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

    // ── 2. Route to the right handler ────────────────────────────
    if (!result) {
      try {
        result = await routeIntent(trigger, context)
      } catch (err: any) {
        console.error("[AgentLoop] routeIntent failed:", err?.message)
        result = await fallbackLLMResponse(trigger, context)
      }
    }

    // ── 3. Compose response via stream callback ──────────────────
    if (result.source === "llm" && result.content.length > 100) {
      // Simulate streaming for LLM responses by chunking the text
      const words = result.content.split(" ")
      let buffer = ""
      for (let i = 0; i < words.length; i++) {
        buffer += (i > 0 ? " " : "") + words[i]
        if (buffer.length > 30 || i === words.length - 1) {
          streamCallback(JSON.stringify({ text: buffer, source: result.source }))
          buffer = ""
        }
      }
    } else {
      // CAG / static / sandbox — send the whole thing at once
      streamCallback(JSON.stringify({ text: result.content, source: result.source }))
    }

    const latency = Date.now() - startTime

    // ── 4. Persist agent event ───────────────────────────────────
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

    // ── 5. Update CAG & Semantic Cache ───────────────────────────
    if (result!.source === "llm") {
      const intent = classifyIntent(trigger.message || "")
      if (CACHEABLE_INTENTS.has(intent)) {
        const cagKey = buildCAGKey(
          intent,
          trigger.examState.lastCodeState,
          trigger.examState.curveballSeen,
          trigger.orgSlug
        )
        // Fire-and-forget CAG store
        cagStore(cagKey, result!.content).catch((err) =>
          console.warn("[AgentLoop] CAG store failed:", err?.message)
        )
        
        // Fire-and-forget Semantic Cache store
        if (trigger.message) {
          const storeEmbedding = await computeEmbedding(trigger.message)
          SemanticCache.store(trigger.message, result!.content, tenantConfig.orgId, storeEmbedding).catch((err) =>
            console.warn("[AgentLoop] SemanticCache store failed:", err?.message)
          )
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
        text: "I ran into a technical issue. Could you try that again?",
        source: "llm",
      })
    )
  }
}

// ── Helpers ───────────────────────────────────────────────────────

async function buildMessagesFromTrigger(trigger: AgentTrigger): Promise<GeminiMessage[]> {
  // If the trigger contains a message, wrap it as a user message
  const messages: GeminiMessage[] = []

  // Try to load recent events from DB for context
  if (hasDatabase() && trigger.sessionId) {
    try {
      const events = await listSessionEvents(trigger.sessionId)
      const recentEvents = events.slice(-12) // Last 12 events
      for (const event of recentEvents) {
        if (!event.content) continue
        messages.push({
          role: event.actor === "student" ? "user" : "model",
          parts: [{ text: event.content }],
        })
      }
    } catch (err: any) {
      console.warn("[AgentLoop] Could not load session events:", err?.message)
    }
  }

  // Add the current message
  if (trigger.message) {
    messages.push({
      role: "user",
      parts: [{ text: trigger.message }],
    })
  }

  return messages
}

/**
 * Extract the student's name from the trigger.
 * Falls back to "Candidate" only if no name is available.
 */
function extractStudentName(trigger: AgentTrigger): string {
  // Prefer name passed directly on the trigger (set by chat route from request body)
  if (trigger.studentName) return trigger.studentName
  // Fall back to tenant-level default (useful for proactive triggers)
  return "Candidate"
}

async function fallbackLLMResponse(
  trigger: AgentTrigger,
  context: AgentLoopContext
): Promise<ToolResult> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured")

    const compressed = buildCompressedContext(
      enforceAlternatingRoles(context.messages),
      context.examState
    )

    const model = createSimulatorModel(apiKey, context.studentName, context.tenantConfig)
    const result = await withRetry(
      () => model.generateContent({ contents: compressed }),
      2,
      "AgentLoop fallback"
    )

    return {
      resolved: true,
      source: "llm",
      content: result.response.text(),
    }
  } catch (err: any) {
    console.error("[AgentLoop] Fallback LLM also failed:", err?.message)
    return {
      resolved: false,
      source: "llm",
      content: "I'm having some trouble right now. Let me know if you'd like to try again.",
    }
  }
}
