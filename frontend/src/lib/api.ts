import { BACKEND_URL } from "./constants"
import { getToken } from "./auth"
import {
  AgentEvent,
  Commitment,
  EvaluationResult,
  ExamState,
  GeminiMessage,
  SessionSummary,
  TenantConfig,
  TerminalOutput,
} from "../types/index"

/**
 * Returns auth headers if a token is present. Falls back to empty object.
 */
function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

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
        ...authHeaders(),
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
  finalCode?: string
  assessmentType?: string
  testsPassed?: number
  testsTotal?: number
  hintsGiven?: number
}): Promise<EvaluationResult> {
  const response = await fetch(`${BACKEND_URL}/api/evaluate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
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
      ...authHeaders(),
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
  const response = await fetch(`${BACKEND_URL}/api/org/${orgSlug}/config`, {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(`Tenant config failed with status ${response.status}`)
  return response.json()
}

export async function saveTenantConfig(orgSlug: string, config: TenantConfig): Promise<TenantConfig> {
  const response = await fetch(`${BACKEND_URL}/api/org/${orgSlug}/config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
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
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
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
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`Session submit failed with status ${response.status}`)
  return response.json()
}

export async function listOrgSessions(orgSlug: string): Promise<SessionSummary[]> {
  const response = await fetch(`${BACKEND_URL}/api/org/${orgSlug}/sessions`, {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(`Sessions failed with status ${response.status}`)
  return response.json()
}

export async function fetchMySessionHistory(): Promise<SessionSummary[]> {
  const response = await fetch(`${BACKEND_URL}/api/session/my`, {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(`My sessions failed with status ${response.status}`)
  return response.json()
}

export async function fetchSessionEvents(sessionId: string): Promise<AgentEvent[]> {
  const response = await fetch(`${BACKEND_URL}/api/session/${sessionId}/events`, {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(`Events failed with status ${response.status}`)
  return response.json()
}

export async function saveSessionCommitments(sessionId: string, commitments: Commitment[]): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/session/${sessionId}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      eventType: "commitment_update",
      actor: "student",
      content: `${commitments.filter((commitment) => commitment.status === "open").length} open commitments`,
      metadata: { commitments },
    }),
  })
  if (!response.ok) throw new Error(`Commitments save failed with status ${response.status}`)
}

/**
 * Uploads a file to the knowledge base for a given org.
 * Sends orgId (UUID) which the backend uses to associate the document.
 */
export async function uploadFile(file: File, orgId: string, sessionId?: string): Promise<{ docId: string }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('orgId', orgId)
  if (sessionId) formData.append('sessionId', sessionId)

  const token = getToken()
  const response = await fetch(`${BACKEND_URL}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}`)
  return response.json()
}

export async function getUploadStatus(docId: string): Promise<{ status: string; chunkCount: number }> {
  const response = await fetch(`${BACKEND_URL}/api/upload/${docId}/status`, {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(`Status check failed with status ${response.status}`)
  return response.json()
}

export async function listOrgStudents(orgSlug: string): Promise<Array<{ id: string; name: string; email: string; invite_token: string; created_at: string }>> {
  const response = await fetch(`${BACKEND_URL}/api/org/${orgSlug}/students`, {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(`Students fetch failed with status ${response.status}`)
  return response.json()
}

export async function createStudent(name: string, orgId: string, email?: string): Promise<{ id: string; name: string; inviteToken: string }> {
  const response = await fetch(`${BACKEND_URL}/api/auth/student/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ name, orgId, email }),
  })
  if (!response.ok) throw new Error(`Student create failed with status ${response.status}`)
  return response.json()
}

export async function generateAIExam(
  orgSlug: string,
  payload: {
    prompt: string
    domain?: string
    seniority?: string
    assessmentType?: string
    allowedLanguages?: string[]
    docText?: string
  }
): Promise<Partial<TenantConfig>> {
  const response = await fetch(`${BACKEND_URL}/api/org/${orgSlug}/generate-exam`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "AI exam generation failed" }))
    throw new Error(err.error || "AI exam generation failed")
  }
  return response.json()
}

export async function generateLearningChallenge(payload: {
  topic: string
  domain?: string
  seniority?: string
  assessmentType?: string
}): Promise<Partial<TenantConfig>> {
  const response = await fetch(`${BACKEND_URL}/api/session/generate-learning`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Learning challenge generation failed" }))
    throw new Error(err.error || "Learning challenge generation failed")
  }
  return response.json()
}

