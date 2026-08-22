import { useEffect, useRef, useState } from "react"
import { CURVEBALL_TRIGGER_SECONDS, EXAM_DURATION_SECONDS } from "../lib/constants"
import { formatTime } from "../lib/utils"

interface UseExamTimerOptions {
  onCurveball: () => void
  onExpire: () => void
  autoStart?: boolean
  durationSeconds?: number
  curveballAtSeconds?: number
}

export function useExamTimer({
  onCurveball,
  onExpire,
  autoStart = true,
  durationSeconds = EXAM_DURATION_SECONDS,
  curveballAtSeconds = CURVEBALL_TRIGGER_SECONDS,
}: UseExamTimerOptions) {
  // Track the duration we were initialised with so we can reset if a real config loads
  const initialisedWithRef = useRef<number | null>(null)

  const [secondsLeft, setSecondsLeft] = useState(durationSeconds)
  const [running, setRunning] = useState(autoStart)
  const [curveballFired, setCurveballFired] = useState(false)

  const curveballRef = useRef(false)
  const onCurveballRef = useRef(onCurveball)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onCurveballRef.current = onCurveball
  }, [onCurveball])

  useEffect(() => {
    onExpireRef.current = onExpire
  }, [onExpire])

  /**
   * Fix: if the timer was started with the fallback duration (3600) and a real
   * durationSeconds from tenant config arrives that is meaningfully different,
   * reset the timer to the real value. This handles the async tenant config load race.
   */
  useEffect(() => {
    if (initialisedWithRef.current === null) {
      // First mount — record what we started with
      initialisedWithRef.current = durationSeconds
      setSecondsLeft(durationSeconds)
    } else if (
      initialisedWithRef.current !== durationSeconds &&
      initialisedWithRef.current === EXAM_DURATION_SECONDS
    ) {
      // We started with the fallback, but a real duration is now available
      initialisedWithRef.current = durationSeconds
      setSecondsLeft(durationSeconds)
      curveballRef.current = false
      setCurveballFired(false)
    }
  }, [durationSeconds])

  useEffect(() => {
    if (!running) return

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1
        const elapsed = durationSeconds - next

        if (elapsed === curveballAtSeconds && !curveballRef.current) {
          curveballRef.current = true
          setCurveballFired(true)
          window.setTimeout(() => onCurveballRef.current(), 0)
        }

        if (next <= 0) {
          window.clearInterval(interval)
          setRunning(false)
          window.setTimeout(() => onExpireRef.current(), 0)
          return 0
        }

        return next
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [curveballAtSeconds, durationSeconds, running])

  // Note: Shift+D debug shortcut is strictly guarded for DEV mode
  useEffect(() => {
    if (!import.meta.env.DEV) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.shiftKey && event.key.toLowerCase() === "d" && !curveballRef.current) {
        curveballRef.current = true
        setCurveballFired(true)
        onCurveballRef.current()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return {
    secondsLeft,
    running,
    curveballFired,
    formattedTime: formatTime(secondsLeft),
  }
}
