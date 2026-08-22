export type MessageRole = "student" | "simulator" | "pm" | "system"

export type IntentClass =
  | "HINT_REQUEST"
  | "CODE_PASTE"
  | "CONCEPT_QUESTION"
  | "DOUBT_DEEP"
  | "CURVEBALL_ACK"
  | "DONE_SIGNAL"
  | "OFF_TOPIC"
  | "SILENCE_TIMEOUT"
  | "CODE_STALE"
  | "NOVEL_INPUT"

export type CodeState =
  | "INITIAL"
  | "COMPILING"
  | "SYNTAX_ERROR"
  | "LOGIC_ERROR"
  | "OPTIMIZED"
  | "UNKNOWN"

export interface ExamState {
  bugFixed: boolean
  approach: string
  curveballSeen: boolean
  curveballAddressed: boolean
  hintsGiven: number
  turnsElapsed: number
  lastCodeState: CodeState
  lastIntentClass: IntentClass
}

export interface GeminiMessage {
  role: "user" | "model"
  parts: Array<{ text: string }>
}

export type AssessmentType = "coding" | "conceptual" | "system_design" | "multiple_choice"

export interface ChatRequestBody {
  messages: GeminiMessage[]
  studentName: string
  examState?: ExamState
  sessionId?: string
  orgSlug?: string
  assessmentType?: AssessmentType
}

export interface RubricDimension {
  name: string
  weight: number
  description: string
  scoringHints?: string[]
}

export interface TestCase {
  input: unknown
  expectedOutput: unknown
  hidden?: boolean
}

export interface TenantConfig {
  orgId: string
  orgSlug: string
  branding: {
    name: string
    logoUrl?: string
    primaryColor: string
    accentColor?: string
  }
  exam: {
    configId?: string
    type?: "coding" | "conceptual" | "system_design" | "multiple_choice"
    title: string
    description?: string
    problemStatement: string
    starterCode: string
    allowedLanguages: string[]
    timeLimitSeconds: number
    curveballAtSeconds: number
    curveballMessage?: string
    testCases: TestCase[]
    knowledgeBaseUrls: string[]
  }
  agent: {
    personaName: string
    personaRole: string
    systemPromptAdditions?: string
  }
  rubric: {
    dimensions: RubricDimension[]
    passingScore: number
  }
}

export interface SessionSummary {
  id: string
  orgId: string
  studentId: string | null
  configId: string
  status: "active" | "submitted" | "evaluated"
  startedAt: string
  submittedAt?: string | null
  timeElapsedSeconds?: number | null
  finalCode?: string | null
  curveballFired: boolean
  passed?: boolean | null
}

export type CommitmentStatus = "open" | "done"
export type CommitmentPriority = "high" | "medium" | "low"

export interface Commitment {
  id: string
  title: string
  owner: string
  dueDate: string
  status: CommitmentStatus
  priority: CommitmentPriority
  notes: string
  source: "suggested" | "recorded"
}

export interface AgentEvent {
  id: string
  sessionId: string
  eventType: "message" | "code_run" | "tool_call" | "proactive" | "curveball" | "submission" | "evaluation" | "commitment_update"
  actor: "student" | "agent" | "system"
  content?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface EvaluateRequestBody {
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
}

export interface EvaluationResult {
  technicalAccuracy: number
  adaptability: number
  communication: number
  efficiency: number
  doubtResolution?: number
  testsPassed?: number
  testsTotal?: number
  dimensionScores?: Record<string, number>
  overallFeedback: string
  strengths: string[]
  improvements: string[]
  passed: boolean
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  streaming?: boolean
  isError?: boolean
}

export interface TerminalOutput {
  lines: string[]
  status: "success" | "warning" | "error" | "idle"
  timestamp: string
}
