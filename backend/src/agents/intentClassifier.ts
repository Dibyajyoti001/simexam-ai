import { IntentClass } from "../types/index.js"

/**
 * intentClassifier — lightweight regex-based message router
 *
 * DEMO mode: This runs on every student message and determines routing.
 * In DEMO, ALL classes route to the live Gemini Simulator.
 *
 * PRODUCTION design: This is the core of the CAG architecture.
 * HINT_REQUEST, CONCEPT_QUESTION, CODE_PASTE → served from KV CAG bank
 * CURVEBALL_ACK, OFF_TOPIC → served from static string constants
 * NOVEL_INPUT → only this fires a live Gemini call (~15% of all turns)
 *
 * Cost projection: At 1 lakh students × 8 turns avg × 15% LLM rate
 * = ~120,000 Gemini calls for an entire exam window (vs 800,000 without CAG).
 * Savings: ~85%. Free tier limit can be protected with batching + queueing.
 */
export function classifyIntent(message: string): IntentClass {
  const lower = message.toLowerCase().trim()

  if (
    lower.includes("function ") ||
    lower.includes("const ") ||
    lower.includes("for (") ||
    lower.includes("```")
  ) {
    return "CODE_PASTE"
  }

  if (
    lower.includes("alex") ||
    lower.includes("pm") ||
    lower.includes("memory") ||
    lower.includes("performance") ||
    lower.includes("optimize") ||
    lower.includes("constraint")
  ) {
    return "CURVEBALL_ACK"
  }

  if (
    lower.includes("done") ||
    lower.includes("finished") ||
    lower.includes("submit") ||
    lower.includes("ready") ||
    lower.includes("complete")
  ) {
    return "DONE_SIGNAL"
  }

  if (
    lower.includes("hint") ||
    lower.includes("help") ||
    lower.includes("how do i") ||
    lower.includes("what should") ||
    lower.includes("where") ||
    lower.includes("why is") ||
    lower.includes("don't understand") ||
    lower.includes("confused")
  ) {
    return "HINT_REQUEST"
  }

  if (
    lower.includes("docs") ||
    lower.includes("documentation") ||
    lower.includes("api reference") ||
    lower.includes("framework") ||
    lower.includes("library") ||
    lower.includes("domain")
  ) {
    return "DOUBT_DEEP"
  }

  if (
    lower.includes("what is") ||
    lower.includes("what does") ||
    lower.includes("explain") ||
    lower.includes("difference between") ||
    lower.includes("complexity") ||
    lower.includes("big o") ||
    lower.includes("time complexity")
  ) {
    return "CONCEPT_QUESTION"
  }

  if (
    lower.includes("weather") ||
    lower.includes("joke") ||
    lower.includes("lunch") ||
    lower.includes("break") ||
    lower.length < 4
  ) {
    return "OFF_TOPIC"
  }

  return "NOVEL_INPUT"
}

/**
 * PRODUCTION: CAG static reply map.
 * In production, these would be 200+ pre-generated responses per class,
 * pulled from Cloudflare KV with a random selection per key.
 */
export const CAG_STATIC_REPLIES: Record<string, string[]> = {
  OFF_TOPIC: [
    "Ha — let's stay focused on the assessment. What's giving you trouble?",
    "Good question for after the session. Right now, walk me through what you're seeing in the code.",
  ],
  DONE_SIGNAL: [
    "Good. Before you submit — have you run it on the test cases? What did the terminal show?",
    "Okay. Walk me through the change you made. What was the root cause of the original bug?",
  ],
}
