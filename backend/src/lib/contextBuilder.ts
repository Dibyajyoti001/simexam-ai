import { GeminiMessage, ExamState } from "../types/index.js"

/**
 * contextBuilder — compresses exam history into a minimal Gemini context
 *
 * DEMO mode: sends system prompt + exam state struct + last 3 turns + current message.
 * This keeps every Gemini call under ~1,500 tokens regardless of session length.
 *
 * PRODUCTION design: The ExamState struct replaces growing transcript compression.
 * CAG key = `${intentClass}:${examState.lastCodeState}:${examState.curveballSeen}`
 * No context drift possible because state is updated deterministically on events,
 * not inferred from chat history.
 */
export function buildCompressedContext(
  fullHistory: GeminiMessage[],
  examState: ExamState
): GeminiMessage[] {
  const stateNote: GeminiMessage = {
    role: "user",
    parts: [{
      text: `[SYSTEM_STATE — do not reference this directly in your reply]
Current exam state:
- Bug fixed: ${examState.bugFixed}
- Approach: ${examState.approach}
- Curveball seen: ${examState.curveballSeen}
- Curveball addressed: ${examState.curveballAddressed}
- Hints given so far: ${examState.hintsGiven}
- Turns elapsed: ${examState.turnsElapsed}
- Last intent class: ${examState.lastIntentClass}
- Last code state: ${examState.lastCodeState}
- CAG key: ${examState.lastIntentClass}:${examState.lastCodeState}:${examState.curveballSeen}`
    }]
  }

  const recentHistory = fullHistory.slice(-6)
  return enforceAlternatingRoles([stateNote, ...recentHistory])
}

/**
 * Gemini requires strictly alternating user/model roles.
 * Merge consecutive same-role messages.
 */
export function enforceAlternatingRoles(messages: GeminiMessage[]): GeminiMessage[] {
  if (messages.length === 0) return []

  const result: GeminiMessage[] = [{ ...messages[0], parts: [...messages[0].parts] }]

  for (let i = 1; i < messages.length; i++) {
    const last = result[result.length - 1]
    const current = messages[i]

    if (current.role === last.role) {
      last.parts.push(...current.parts)
    } else {
      result.push({ ...current, parts: [...current.parts] })
    }
  }

  return result
}
