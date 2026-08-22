import { ExamState, CodeState } from "../types/index.js"
import { cacheGet, cacheSet } from "./cache.js"

export function deriveCodeState(code: string): CodeState {
  if (!code || code.trim().length < 15) return "INITIAL"
  const trimmed = code.trim()

  // Syntax balance checks
  let openBraces = 0
  let openParens = 0
  let openBrackets = 0
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '{') openBraces++
    else if (ch === '}') openBraces--
    else if (ch === '(') openParens++
    else if (ch === ')') openParens--
    else if (ch === '[') openBrackets++
    else if (ch === ']') openBrackets--
  }
  if (openBraces !== 0 || openParens !== 0 || openBrackets !== 0) {
    return "SYNTAX_ERROR"
  }

  // Check for dangling keywords at end of code
  if (/\b(function|const|let|var|if|for|while|class)\s*$/.test(trimmed)) {
    return "SYNTAX_ERROR"
  }

  // Check for optimized algorithmic structures
  if (
    trimmed.includes("return") &&
    (trimmed.includes("Map") ||
      trimmed.includes("Set") ||
      trimmed.includes("memo") ||
      trimmed.includes("dp") ||
      trimmed.includes("binarySearch") ||
      trimmed.includes("cache")) &&
    trimmed.length > 200
  ) {
    return "OPTIMIZED"
  }

  return "COMPILING"
}

export function updateExamState(
  current: ExamState,
  newCodeState: CodeState,
  curveballSeen: boolean,
  messageCount: number
): ExamState {
  const isOptimized = newCodeState === "OPTIMIZED"
  
  return {
    ...current,
    bugFixed: current.bugFixed || isOptimized, // Just a generic fallback
    approach: current.approach === "unknown" ? "in-progress" : current.approach,
    curveballSeen: current.curveballSeen || curveballSeen,
    curveballAddressed: current.curveballAddressed || (isOptimized && (current.curveballSeen || curveballSeen)),
    turnsElapsed: messageCount,
    lastCodeState: newCodeState,
  }
}

export function createInitialExamState(): ExamState {
  return {
    bugFixed: false,
    approach: "unknown",
    curveballSeen: false,
    curveballAddressed: false,
    hintsGiven: 0,
    turnsElapsed: 0,
    lastCodeState: "INITIAL",
    lastIntentClass: "NOVEL_INPUT",
  }
}

// ── Redis State Persistence ───────────────────────────────────────

export async function getExamState(sessionId: string): Promise<ExamState | null> {
  return cacheGet<ExamState>(`exam_state:${sessionId}`)
}

export async function saveExamState(sessionId: string, state: ExamState): Promise<void> {
  // Store for 24 hours
  await cacheSet(`exam_state:${sessionId}`, state, 86400)
}
