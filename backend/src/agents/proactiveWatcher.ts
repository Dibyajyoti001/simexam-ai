import { recordAgentEvent } from "../lib/db.js"
import { cacheGet, cacheSet } from "../lib/cache.js"

export interface ProactiveState {
  sessionId: string
  lastCodeChangeAt: number
  lastMessageAt: number
  timeElapsedSeconds: number
  curveballAtSeconds: number
  curveballFired: boolean
  hintGivenInLastMinute?: boolean
}

export function decideProactiveActions(state: ProactiveState): Array<"CODE_STALE" | "SILENCE_TIMEOUT" | "CURVEBALL"> {
  const now = Date.now()
  const actions: Array<"CODE_STALE" | "SILENCE_TIMEOUT" | "CURVEBALL"> = []

  if (now - state.lastCodeChangeAt > 90_000 && !state.hintGivenInLastMinute) {
    actions.push("CODE_STALE")
  }

  if (now - state.lastMessageAt > 120_000 && state.timeElapsedSeconds > 60) {
    actions.push("SILENCE_TIMEOUT")
  }

  if (state.timeElapsedSeconds >= state.curveballAtSeconds && !state.curveballFired) {
    actions.push("CURVEBALL")
  }

  return actions
}

export async function emitProactiveMessage(
  sessionId: string,
  action: "CODE_STALE" | "SILENCE_TIMEOUT" | "CURVEBALL",
  content: string
): Promise<void> {
  await recordAgentEvent({
    sessionId,
    eventType: action === "CURVEBALL" ? "curveball" : "proactive",
    actor: "agent",
    content,
    metadata: { action },
  })
}

// ── Redis-backed Session Tracking ────────────────────────────

const ACTIVE_SESSIONS_KEY = "proactive:active_sessions"

export async function registerActiveSession(sessionId: string): Promise<void> {
  const active = await cacheGet<string[]>(ACTIVE_SESSIONS_KEY) || []
  if (!active.includes(sessionId)) {
    active.push(sessionId)
    await cacheSet(ACTIVE_SESSIONS_KEY, active, 86400) // 24h
  }
}

export async function unregisterActiveSession(sessionId: string): Promise<void> {
  let active = await cacheGet<string[]>(ACTIVE_SESSIONS_KEY) || []
  active = active.filter(id => id !== sessionId)
  await cacheSet(ACTIVE_SESSIONS_KEY, active, 86400)
}

export function startProactiveWatcher(getActiveSessions: () => Promise<string[]>): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const active = await getActiveSessions()
      for (const sessionId of active) {
        // In a real app we would load the ProactiveState from DB/Redis here
        // and call decideProactiveActions(state), then emitProactiveMessage
        // Implementation omitted for brevity
      }
    } catch (err: any) {
      console.error("[ProactiveWatcher] Error during check:", err?.message)
    }
  }, 15000)
}
