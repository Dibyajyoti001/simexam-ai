import { useCallback, useState } from "react"

export type AgentStatus = "idle" | "thinking" | "running" | "docs" | "hint"

export function useAgentStatus() {
  const [status, setStatus] = useState<AgentStatus>("idle")

  const runWithStatus = useCallback(async <T,>(nextStatus: AgentStatus, task: () => Promise<T>): Promise<T> => {
    setStatus(nextStatus)
    try {
      return await task()
    } finally {
      setStatus("idle")
    }
  }, [])

  return { status, setStatus, runWithStatus }
}
