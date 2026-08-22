// ── Python Micro-service Bridge ───────────────────────────────────
//
// Calls a co-located Python service (FastAPI) for heavy ML tasks:
// evaluation, RAG ingest/retrieve, code analysis, behavioural analysis.
// Implements a circuit breaker to avoid cascading failures.

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || "http://localhost:8000"
const SERVICE_SECRET = process.env.SERVICE_SECRET || ""

// ── Circuit Breaker ───────────────────────────────────────────────

let consecutiveFailures = 0
let circuitOpenUntil = 0
const FAILURE_THRESHOLD = 3
const COOL_DOWN_MS = 60_000

function isCircuitOpen(): boolean {
  if (consecutiveFailures < FAILURE_THRESHOLD) return false
  if (Date.now() > circuitOpenUntil) {
    // Half-open: allow one retry
    consecutiveFailures = FAILURE_THRESHOLD - 1
    return false
  }
  return true
}

function recordSuccess(): void {
  consecutiveFailures = 0
}

function recordFailure(): void {
  consecutiveFailures++
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + COOL_DOWN_MS
    console.warn(`[PythonBridge] Circuit breaker OPEN — will retry after ${COOL_DOWN_MS / 1000}s`)
  }
}

// ── Typed response ────────────────────────────────────────────────

interface BridgeResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

// ── Internal fetch helper ─────────────────────────────────────────

async function bridgePost<T = any>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<BridgeResponse<T>> {
  if (isCircuitOpen()) {
    return { success: false, error: "Python service circuit breaker is open" }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SERVICE_SECRET ? { "X-Service-Key": SERVICE_SECRET } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      recordFailure()
      const text = await response.text().catch(() => "")
      return { success: false, error: `Python service returned ${response.status}: ${text}` }
    }

    const data = (await response.json()) as T
    recordSuccess()
    return { success: true, data }
  } catch (err: any) {
    clearTimeout(timer)
    recordFailure()
    const msg = err?.name === "AbortError" ? "Request timed out" : err?.message || "Unknown error"
    console.error(`[PythonBridge] ${path} failed:`, msg)
    return { success: false, error: msg }
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Calls the Python evaluation endpoint.
 */
export async function pythonEvaluate(payload: Record<string, unknown>): Promise<BridgeResponse> {
  return bridgePost("/eval", payload, 30_000)
}

/**
 * Ingests a document for RAG chunking / embedding.
 */
export async function pythonIngest(
  docId: string,
  orgId: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<BridgeResponse> {
  // For file upload we need multipart, but the Python service may accept
  // base64-encoded content to keep things simple over JSON.
  return bridgePost(
    "/ingest",
    {
      docId,
      orgId,
      filename,
      mimeType,
      contentBase64: fileBuffer.toString("base64"),
    },
    60_000
  )
}

/**
 * Retrieves relevant document chunks for a query via semantic search.
 */
export async function pythonRetrieve(
  query: string,
  orgId: string,
  sessionId?: string,
  k = 5
): Promise<BridgeResponse<Array<{ content: string; metadata?: Record<string, unknown> }>>> {
  return bridgePost("/retrieve", { query, orgId, sessionId, k }, 10_000)
}

/**
 * Analyses code for complexity, patterns, etc.
 */
export async function pythonAnalyse(
  code: string,
  language: string
): Promise<BridgeResponse> {
  return bridgePost("/analyse", { code, language }, 10_000)
}

/**
 * Runs behavioural analysis on student events.
 */
export async function pythonBehavioural(
  events: Array<Record<string, unknown>>,
  config: Record<string, unknown>
): Promise<BridgeResponse> {
  return bridgePost("/behavioural", { events, config }, 15_000)
}

/**
 * Checks if the Python service is reachable.
 */
export async function isPythonAvailable(): Promise<boolean> {
  if (isCircuitOpen()) return false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/health`, {
      signal: controller.signal,
      headers: SERVICE_SECRET ? { "X-Service-Key": SERVICE_SECRET } : {},
    })
    clearTimeout(timer)

    if (response.ok) {
      recordSuccess()
      return true
    }
    recordFailure()
    return false
  } catch {
    clearTimeout(timer)
    recordFailure()
    return false
  }
}
