import { CodeState, IntentClass } from "../types/index"

function compact(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Classifies the intent of a user message with higher precision to prevent
 * accidental misclassification of normal conversation as code paste.
 */
export function classifyIntent(message: string): IntentClass {
  const text = compact(message)

  // Explicit code block
  if (message.includes("```")) {
    return "CODE_PASTE"
  }

  // Multi-line code block or function declaration with syntax
  if (
    /(?:function\s+\w+\s*\(|class\s+\w+\s*\{|const\s+\w+\s*=\s*\(|=>\s*\{|import\s+.*\s+from)/i.test(message) ||
    (message.includes(";") && (message.includes("{") || message.includes("}")) && message.split("\n").length >= 2)
  ) {
    return "CODE_PASTE"
  }

  if (
    text.includes("done") ||
    text.includes("finished") ||
    text.includes("submit") ||
    text.includes("ready to submit") ||
    text.includes("completed")
  ) {
    return "DONE_SIGNAL"
  }

  if (
    text.includes("hint") ||
    text.includes("help me") ||
    text.includes("explain") ||
    text.includes("why is this") ||
    text.includes("how does") ||
    text.includes("what is") ||
    text.includes("what does") ||
    text.includes("walk me through") ||
    text.includes("i'm stuck") ||
    text.includes("im stuck") ||
    text.includes("confused")
  ) {
    return "HINT_REQUEST"
  }

  if (
    text.includes("complexity") ||
    text.includes("big o") ||
    text.includes("time complexity") ||
    text.includes("space complexity") ||
    text.includes("merge sort") ||
    text.includes("quick sort") ||
    text.includes("quicksort") ||
    text.includes("binary search") ||
    text.includes("recursion")
  ) {
    return "CONCEPT_QUESTION"
  }

  if (
    text.includes("memory limit") ||
    text.includes("constraint") ||
    text.includes("pm requirement") ||
    text.includes("alex requirement") ||
    text.includes("o(n log n)") ||
    text.includes("onlogn")
  ) {
    return "CURVEBALL_ACK"
  }

  if (
    text.includes("joke") ||
    text.includes("weather") ||
    text.includes("lunch") ||
    text.includes("break") ||
    text.length < 3
  ) {
    return "OFF_TOPIC"
  }

  return "NOVEL_INPUT"
}

export function deriveCodeState(code: string): CodeState {
  const text = compact(code)

  if (!text || text.length < 10) {
    return "INITIAL"
  }

  // Check for common syntax error patterns
  const openBraces = (code.match(/\{/g) || []).length
  const closeBraces = (code.match(/\}/g) || []).length
  const openParens = (code.match(/\(/g) || []).length
  const closeParens = (code.match(/\)/g) || []).length

  if (openBraces !== closeBraces || openParens !== closeParens) {
    return "SYNTAX_ERROR"
  }

  // Check if student implemented O(n log n) sorting
  if (
    code.includes("merge") ||
    code.includes("quick") ||
    code.includes("partition") ||
    code.includes("pivot") ||
    code.includes("Math.floor")
  ) {
    return "OPTIMIZED"
  }

  return "COMPILING"
}

export function deriveApproach(codeState: CodeState): string {
  if (codeState === "INITIAL") return "initial-stub"
  if (codeState === "SYNTAX_ERROR") return "syntax-repair"
  if (codeState === "OPTIMIZED") return "custom-nlogn"
  return "in-progress"
}