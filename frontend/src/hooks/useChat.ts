import { useCallback, useEffect, useRef, useState } from "react"
import { ChatMessage, ExamState, GeminiMessage, TenantConfig } from "../types/index"
import { CURVEBALL_MESSAGE, SESSION_KEYS, SIMULATOR_OPENING_MESSAGE } from "../lib/constants"
import { streamChat } from "../lib/api"
import { generateId } from "../lib/utils"

function openingMessage(name: string, tenant?: TenantConfig | null): ChatMessage {
  return {
    id: generateId(),
    role: "simulator",
    content: tenant
      ? `Hey ${name} - welcome to ${tenant.branding.name}. I have loaded ${tenant.exam.title}; start with the code and talk me through what you notice.`
      : SIMULATOR_OPENING_MESSAGE(name),
    timestamp: Date.now(),
  }
}

function loadMessages(studentName: string, tenant?: TenantConfig | null): ChatMessage[] {
  if (typeof window === "undefined") return [openingMessage(studentName, tenant)]

  const raw = sessionStorage.getItem(SESSION_KEYS.MESSAGES)
  if (!raw) return [openingMessage(studentName, tenant)]

  try {
    const parsed = JSON.parse(raw) as ChatMessage[]
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {
    // ignore invalid storage
  }

  return [openingMessage(studentName, tenant)]
}

function toGeminiHistory(messages: ChatMessage[]): GeminiMessage[] {
  return messages
    .filter((message) => message.role === "student" || message.role === "simulator" || message.role === "pm")
    .map((message) => ({
      role: message.role === "simulator" ? "model" : "user",
      parts: [
        {
          text: message.role === "pm" ? `[PM_ALEX] ${message.content}` : message.content,
        },
      ],
    }))
}

export function useChat(studentName: string, options: {
  sessionId?: string
  orgSlug?: string
  tenant?: TenantConfig | null
  assessmentType?: string
} = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(studentName, options.tenant))
  const [isTyping, setIsTyping] = useState(false)
  const [curveballFired, setCurveballFired] = useState(false)

  const codeSnapshotsRef = useRef<string[]>([])
  const messagesRef = useRef(messages)

  useEffect(() => {
    messagesRef.current = messages
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_KEYS.MESSAGES, JSON.stringify(messages))
    }
  }, [messages])

  useEffect(() => {
    if (messages.some((message) => message.role === "pm")) {
      setCurveballFired(true)
    }
  }, [])

  const recordCodeSnapshot = useCallback((code: string) => {
    const snapshot = code.trim()
    if (!snapshot) return

    const lastSnapshot = codeSnapshotsRef.current[codeSnapshotsRef.current.length - 1]
    if (lastSnapshot?.trim() === snapshot) return

    codeSnapshotsRef.current = [...codeSnapshotsRef.current, code]
  }, [])

  const injectCurveball = useCallback(() => {
    if (curveballFired) return
    setCurveballFired(true)

    const curveballMsg: ChatMessage = {
      id: generateId(),
      role: "pm",
      content: options.tenant?.exam?.curveballMessage || CURVEBALL_MESSAGE,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, curveballMsg])
  }, [curveballFired, options.tenant?.exam?.curveballMessage])

  const sendMessage = useCallback(
    async (userText: string, examState: ExamState, currentCode: string) => {
      const trimmed = userText.trim()
      if (!trimmed || isTyping) return

      recordCodeSnapshot(currentCode)

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "student",
        content: trimmed,
        timestamp: Date.now(),
      }

      const assistantId = generateId()
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "simulator",
        content: "",
        timestamp: Date.now(),
        streaming: true,
      }

      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setIsTyping(true)

      const geminiHistory = toGeminiHistory([...messagesRef.current, userMessage])

      await streamChat(
        geminiHistory,
        studentName,
        examState,
        {
          sessionId: options.sessionId,
          orgSlug: options.orgSlug,
          assessmentType: options.assessmentType,
          tenantConfig: options.tenant || undefined,
        },
        (chunk) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: message.content + chunk,
                    streaming: true,
                  }
                : message
            )
          )
        },
        () => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId ? { ...message, streaming: false } : message
            )
          )
          setIsTyping(false)
        },
        (errorMessage) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: errorMessage,
                    streaming: false,
                    isError: true,
                  }
                : message
            )
          )
          setIsTyping(false)
        }
      )
    },
    [isTyping, options.assessmentType, options.orgSlug, options.sessionId, recordCodeSnapshot, studentName]
  )

  const buildTranscript = useCallback(() => {
    const personaName = options.tenant?.agent?.personaName || "Alex Chen"
    const personaRole = options.tenant?.agent?.personaRole || "Interviewer"

    return messagesRef.current
      .map((message) => {
        const label =
          message.role === "student"
            ? `Student (${studentName})`
            : message.role === "simulator"
              ? `${personaRole} (${personaName})`
              : "PM (Constraint Update)"

        return `${label}: ${message.content}`
      })
      .join("\n\n")
  }, [options.tenant?.agent?.personaName, options.tenant?.agent?.personaRole, studentName])

  return {
    messages,
    isTyping,
    curveballFired,
    injectCurveball,
    sendMessage,
    buildTranscript,
    recordCodeSnapshot,
    codeSnapshots: codeSnapshotsRef.current,
  }
}
