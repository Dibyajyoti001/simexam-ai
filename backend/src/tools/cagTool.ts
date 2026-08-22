import { cacheGet, cacheSet } from "../lib/cache.js"
import { IntentClass } from "../types/index.js"
import { CAG_STATIC_REPLIES } from "../agents/intentClassifier.js"

// ── CAG Key Builder ───────────────────────────────────────────────

/**
 * Builds a deterministic cache key from the exam state dimensions.
 * Format: `cag:${intent}:${codeState}:${curveballSeen}:${orgSlug}:${language}`
 */
export function buildCAGKey(
  intent: string,
  codeState: string,
  curveballSeen: boolean,
  orgSlug?: string,
  language?: string
): string {
  return `cag:${intent}:${codeState}:${curveballSeen}:${orgSlug || "default"}:${language || "javascript"}`
}

// ── CAG Lookup ────────────────────────────────────────────────────

/**
 * Reads a pre-generated response from the CAG cache.
 * Returns null on miss.
 */
export async function cagLookup(key: string): Promise<string | null> {
  try {
    return await cacheGet<string>(key)
  } catch (err: any) {
    console.warn("[CAG] Lookup error:", err?.message)
    return null
  }
}

// ── CAG Store ─────────────────────────────────────────────────────

/**
 * Writes a generated response into the CAG cache with the given TTL (default 24h).
 */
export async function cagStore(
  key: string,
  response: string,
  ttl = 86400
): Promise<void> {
  try {
    await cacheSet(key, response, ttl)
    console.log(`[CAG] Stored key: ${key} (TTL ${ttl}s)`)
  } catch (err: any) {
    console.warn("[CAG] Store error:", err?.message)
  }
}

// ── Static Reply Lookup ───────────────────────────────────────────

/**
 * Returns a pre-generated static reply for intents that never need an LLM call.
 * Returns null if the intent is not in the static reply map.
 */
export function getStaticReply(intent: IntentClass): string | null {
  const replies = CAG_STATIC_REPLIES[intent]
  if (!replies || replies.length === 0) return null
  // Randomly pick from available static replies
  return replies[Math.floor(Math.random() * replies.length)]
}
