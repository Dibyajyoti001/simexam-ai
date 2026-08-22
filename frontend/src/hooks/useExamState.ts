import { useCallback, useEffect, useState } from "react"
import { SESSION_KEYS } from "../lib/constants"
import { deriveApproach, deriveCodeState } from "../lib/codeAnalysis"
import { CodeState, ExamState, IntentClass } from "../types/index"

const INITIAL_STATE: ExamState = {
  bugFixed: false,
  approach: "unknown",
  curveballSeen: false,
  curveballAddressed: false,
  hintsGiven: 0,
  turnsElapsed: 0,
  lastCodeState: "INITIAL",
  lastIntentClass: "NOVEL_INPUT",
}

function loadState(): ExamState {
  if (typeof window === "undefined") return INITIAL_STATE

  const raw = sessionStorage.getItem(SESSION_KEYS.EXAM_STATE)
  if (!raw) return INITIAL_STATE

  try {
    const parsed = JSON.parse(raw) as ExamState
    return {
      ...INITIAL_STATE,
      ...parsed,
    }
  } catch {
    return INITIAL_STATE
  }
}

export function useExamState() {
  const [examState, setExamState] = useState<ExamState>(loadState)

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.EXAM_STATE, JSON.stringify(examState))
  }, [examState])

  const updateFromCode = useCallback((code: string, curveballSeen: boolean) => {
    const codeState = deriveCodeState(code)
    const approach = deriveApproach(codeState)

    setExamState((prev) => {
      const seen = prev.curveballSeen || curveballSeen
      const isOptimized = codeState === "OPTIMIZED"

      return {
        ...prev,
        bugFixed: prev.bugFixed || isOptimized,
        approach,
        curveballSeen: seen,
        curveballAddressed: prev.curveballAddressed || (isOptimized && seen),
        lastCodeState: codeState,
      }
    })
  }, [])

  const registerInteraction = useCallback((intent: IntentClass) => {
    setExamState((prev) => ({
      ...prev,
      turnsElapsed: prev.turnsElapsed + 1,
      hintsGiven:
        prev.hintsGiven +
        (intent === "HINT_REQUEST" || intent === "CONCEPT_QUESTION" ? 1 : 0),
      lastIntentClass: intent,
    }))
  }, [])

  const markCurveballSeen = useCallback(() => {
    setExamState((prev) => ({
      ...prev,
      curveballSeen: true,
    }))
  }, [])

  const markCurveballAddressed = useCallback(() => {
    setExamState((prev) => ({
      ...prev,
      curveballAddressed: true,
    }))
  }, [])

  const setLastCodeState = useCallback((codeState: CodeState) => {
    setExamState((prev) => ({
      ...prev,
      lastCodeState: codeState,
    }))
  }, [])

  const setLastIntentClass = useCallback((intent: IntentClass) => {
    setExamState((prev) => ({
      ...prev,
      lastIntentClass: intent,
    }))
  }, [])

  return {
    examState,
    updateFromCode,
    registerInteraction,
    markCurveballSeen,
    markCurveballAddressed,
    setLastCodeState,
    setLastIntentClass,
  }
}