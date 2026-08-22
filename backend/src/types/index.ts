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

export interface ChatRequestBody {
  messages: GeminiMessage[]
  studentName: string
  examState?: ExamState
  sessionId?: string
  orgSlug?: string
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

export type AssessmentType = "coding" | "conceptual" | "system_design" | "multiple_choice"

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
    type?: AssessmentType
    title: string
    description?: string
    problemStatement: string
    starterCode?: string
    allowedLanguages?: string[]
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
    rubricType?: "deterministic" | "semantic"
  }
}

export interface AgentEvent {
  id: string
  sessionId: string
  eventType: "message" | "code_run" | "tool_call" | "proactive" | "curveball" | "submission" | "evaluation"
  actor: "student" | "agent" | "system"
  content?: string
  metadata?: Record<string, unknown>
  createdAt: string
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

export interface EvaluateRequestBody {
  conversationHistory: string
  codeSnapshots: string[]
  finalCode?: string
  timeElapsedSeconds: number
  curveballFired: boolean
  curveballAddressed: boolean
  studentName: string
  sessionId?: string
  orgSlug?: string
  assessmentType?: AssessmentType
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

export interface TerminalOutput {
  lines: string[]
  status: "success" | "warning" | "error" | "idle"
  timestamp: string
}

export interface ExecuteRequestBody {
  code: string
  language?: string
  sessionId?: string
}

export interface ExecuteResult {
  stdout: string
  stderr: string
  exitCode: number
  status: "success" | "warning" | "error"
  lines: string[]
  testsPassed?: number
  testsTotal?: number
}

// ── Agent Loop types ──────────────────────────────────────────────

export type ProactiveActionType = 'CODE_STALE' | 'SILENCE_TIMEOUT' | 'CURVEBALL'

export interface AgentTrigger {
  type: 'student_message' | 'proactive' | 'curveball'
  sessionId: string
  orgSlug: string
  message?: string
  code?: string
  examState: ExamState
  tenantConfig: TenantConfig
  proactiveAction?: ProactiveActionType
  assessmentType?: AssessmentType
  studentName?: string
}

export interface ToolResult {
  resolved: boolean
  source: 'cag' | 'cag_static' | 'sandbox' | 'rag' | 'web_search' | 'doc_fetch' | 'llm' | 'cache'
  content: string
  metadata?: Record<string, unknown>
}

export type IntentHandler = (trigger: AgentTrigger, context: AgentLoopContext) => Promise<ToolResult>

export interface AgentLoopContext {
  sessionId: string
  orgSlug: string
  tenantConfig: TenantConfig
  examState: ExamState
  messages: GeminiMessage[]
  studentName: string
}

// ── RAG / Upload types ────────────────────────────────────────────

export interface UploadedDoc {
  id: string
  orgId: string
  sessionId?: string
  filename: string
  mimeType?: string
  sizeBytes?: number
  storageUrl?: string
  status: 'processing' | 'ready' | 'error'
  chunkCount?: number
  createdAt: string
}

export interface DocChunk {
  id: string
  docId: string
  orgId: string
  sessionId?: string
  chunkIndex: number
  content: string
  metadata?: Record<string, unknown>
  createdAt: string
}

// ── Sandbox types ─────────────────────────────────────────────────

export interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number
  testsPassed?: number
  testsTotal?: number
  testResults?: Array<{ input: string; expected: string; actual: string; passed: boolean }>
  executionTime?: number
}

// ── Security / Auth types ─────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

export interface JWTPayload {
  userId: string
  orgId: string
  role: 'admin' | 'viewer' | 'student'
  sessionId?: string
  iat: number
  exp: number
}
