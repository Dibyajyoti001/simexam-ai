import { useCallback, useState } from "react"
import { executeCodeSnapshot } from "../lib/api"
import { TerminalOutput } from "../types/index"

export function useTerminal() {
  const [outputs, setOutputs] = useState<TerminalOutput[]>([
    {
      lines: ["SimExam terminal ready.", "Run the code to see the immediate result."],
      status: "idle",
      timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
    },
  ])

  const executeCode = useCallback(async (code: string, sessionId?: string) => {
    try {
      const output = await executeCodeSnapshot(code, "javascript", sessionId)
      setOutputs((prev) => [...prev, output])
      return output
    } catch {
      const output: TerminalOutput = {
        lines: ["Cannot reach /api/execute. Make sure the backend is running."],
        status: "error",
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
      }
      setOutputs((prev) => [...prev, output])
      return output
    }
  }, [])

  const clearTerminal = useCallback(() => {
    setOutputs([
      {
        lines: ["Terminal cleared."],
        status: "idle",
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
      },
    ])
  }, [])

  return {
    outputs,
    executeCode,
    clearTerminal,
  }
}
