import { BACKEND_URL } from "./constants"
import {
  AgentEvent,
  EvaluationResult,
  ExamState,
  GeminiMessage,
  SessionSummary,
  TenantConfig,
  TerminalOutput,
} from "../types/index"

export async function streamChat(
  messages: GeminiMessage[],
  studentName: string,
  examState: ExamState,
  options: { sessionId?: string; orgSlug?: string; assessmentType?: string },
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (message: string) => void
) {
  let response: Response

  try {
    response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        studentName,
        examState,
        sessionId: options.sessionId,
        orgSlug: options.orgSlug,
        assessmentType: options.assessmentType,
      }),
    })
  } catch {
    onError("Cannot reach the backend. Make sure it is running on port 3001.")
    return
  }

  if (!response.ok) {
    onError(`Chat request failed with status ${response.status}`)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    onError("No response stream received.")
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""

    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith("data: ")) continue

      const payload = line.slice(6).trim()
      if (payload === "[DONE]") {
        onDone()
        return
      }

      try {
        const parsed = JSON.parse(payload)
        if (parsed.text) onChunk(parsed.text)
        if (parsed.error) {
          onError(parsed.error)
          return
        }
      } catch {
        // Ignore partial or malformed chunks.
      }
    }
  }

  onDone()
}

export async function evaluateSession(payload: {
  conversationHistory: string
  codeSnapshots: string[]
  timeElapsedSeconds: number
  curveballFired: boolean
  curveballAddressed: boolean
  studentName: string
  sessionId?: string
  orgSlug?: string
}): Promise<EvaluationResult> {
  const response = await fetch(`${BACKEND_URL}/api/evaluate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Evaluation failed with status ${response.status}`)
  }

  return response.json()
}

export async function executeCodeSnapshot(code: string, language = "javascript", sessionId?: string): Promise<TerminalOutput> {
  const response = await fetch(`${BACKEND_URL}/api/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, language, sessionId }),
  })

  if (!response.ok) {
    throw new Error(`Execution failed with status ${response.status}`)
  }

  const result = await response.json() as { lines?: string[]; status?: TerminalOutput["status"] }
  return {
    lines: result.lines?.length ? result.lines : ["No output."],
    status: result.status || "idle",
    timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
  }
}

export async function fetchTenantConfig(orgSlug: string): Promise<TenantConfig> {
  const response = await fetch(`${BACKEND_URL}/api/org/${orgSlug}/config`)
  if (!response.ok) throw new Error(`Tenant config failed with status ${response.status}`)
  return response.json()
}

export async function saveTenantConfig(orgSlug: string, config: TenantConfig): Promise<TenantConfig> {
  const response = await fetch(`${BACKEND_URL}/api/org/${orgSlug}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  })
  if (!response.ok) throw new Error(`Tenant config save failed with status ${response.status}`)
  return response.json()
}

export async function createSession(payload: {
  orgSlug: string
  studentName: string
  email?: string
  inviteToken?: string
}): Promise<SessionSummary> {
  const response = await fetch(`${BACKEND_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`Session create failed with status ${response.status}`)
  return response.json()
}

export async function submitSession(payload: {
  sessionId: string
  finalCode: string
  timeElapsedSeconds: number
  curveballFired: boolean
}): Promise<SessionSummary> {
  const response = await fetch(`${BACKEND_URL}/api/session/${payload.sessionId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`Session submit failed with status ${response.status}`)
  return response.json()
}

export async function listOrgSessions(orgSlug: string): Promise<SessionSummary[]> {
  const response = await fetch(`${BACKEND_URL}/api/org/${orgSlug}/sessions`)
  if (!response.ok) throw new Error(`Sessions failed with status ${response.status}`)
  return response.json()
}

export async function fetchSessionEvents(sessionId: string): Promise<AgentEvent[]> {
  const response = await fetch(`${BACKEND_URL}/api/session/${sessionId}/events`)
  if (!response.ok) throw new Error(`Events failed with status ${response.status}`)
  return response.json()
}

export async function uploadKnowledgeBaseFile(orgSlug: string, file: File, sessionId?: string): Promise<any> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("orgSlug", orgSlug)
  if (sessionId) {
    formData.append("sessionId", sessionId)
  }
  
  const response = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: formData,
  })
  
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}`)
  return response.json()
}

export async function uploadFile(file: File, orgId: string, sessionId?: string): Promise<{ docId: string }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('orgId', orgId)
  if (sessionId) formData.append('sessionId', sessionId)
  const response = await fetch(`${BACKEND_URL}/api/upload`, { method: 'POST', body: formData })
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}`)
  return response.json()
}

export async function getUploadStatus(docId: string): Promise<{ status: string; chunkCount: number }> {
  const response = await fetch(`${BACKEND_URL}/api/upload/${docId}/status`)
  if (!response.ok) throw new Error(`Status check failed with status ${response.status}`)
  return response.json()
}
