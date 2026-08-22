import { SandboxResult, TestCase } from "../types/index.js"

// ── Dangerous pattern detection ───────────────────────────────────

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /require\s*\(\s*['"](?:child_process|fs|net|os|cluster|dgram|dns|http2|inspector|tls|vm|worker_threads)['"]/,
    label: "Dangerous Node.js module import",
  },
  { pattern: /\beval\s*\(/, label: "eval() call" },
  { pattern: /\bFunction\s*\(/, label: "Function() constructor" },
  { pattern: /\bexec\s*\(/, label: "exec() call" },
  { pattern: /\bspawn\s*\(/, label: "spawn() call" },
]

const MAX_CODE_SIZE = 50 * 1024 // 50 KB
const MAX_OUTPUT_SIZE = 10 * 1024 // 10 KB

/**
 * Validates code for size limits and dangerous patterns.
 */
export function validateCode(code: string): { safe: boolean; reason?: string } {
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_SIZE) {
    return { safe: false, reason: `Code exceeds maximum size of ${MAX_CODE_SIZE / 1024}KB` }
  }

  for (const { pattern, label } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `Blocked: ${label} detected` }
    }
  }

  return { safe: true }
}

// ── Judge0 language IDs (CE v1.13.1) ──────────────────────────────

export const LANGUAGE_IDS: Record<string, number> = {
  javascript: 93,
  typescript: 94,
  python: 92,
  java: 91,
}

// ── ANSI escape code stripper ─────────────────────────────────────

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
}

function truncateOutput(str: string, max = MAX_OUTPUT_SIZE): string {
  return str.length > max ? str.slice(0, max) + "\n[output truncated]" : str
}

// ── Main sandbox executor ─────────────────────────────────────────

const JUDGE0_URL = process.env.JUDGE0_URL || ""

/**
 * Executes code in the Judge0 sandbox. Falls back to static analysis
 * when Judge0 is unavailable.
 */
export async function executeSandbox(
  code: string,
  language: string,
  testCases?: TestCase[]
): Promise<SandboxResult> {
  // Step 1: validate
  const validation = validateCode(code)
  if (!validation.safe) {
    return {
      stdout: "",
      stderr: validation.reason || "Code validation failed",
      exitCode: 1,
    }
  }

  // Step 2: run test cases if provided
  if (testCases && testCases.length > 0) {
    return runTestCases(code, language, testCases)
  }

  // Step 3: single execution
  if (!JUDGE0_URL) {
    return staticAnalysisFallback(code, language)
  }

  try {
    return await executeOnJudge0(code, language)
  } catch (err: any) {
    console.warn("[Sandbox] Judge0 unavailable, falling back to static analysis:", err?.message)
    return staticAnalysisFallback(code, language)
  }
}

// ── Judge0 API call ───────────────────────────────────────────────

async function executeOnJudge0(code: string, language: string, stdin?: string): Promise<SandboxResult> {
  const languageId = LANGUAGE_IDS[language] || LANGUAGE_IDS.javascript
  const startTime = Date.now()
  
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const submitResponse = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language_id: languageId,
        stdin: stdin || "",
        cpu_time_limit: 10,
        memory_limit: 131072, // 128 MB in KB
        enable_network: false,
      }),
      signal: controller.signal,
    })
    
    clearTimeout(timer)

    if (!submitResponse.ok) {
      throw new Error(`Judge0 returned ${submitResponse.status}`)
    }

    const result = await submitResponse.json() as {
      stdout?: string
      stderr?: string
      status?: { id: number }
      time?: string
    }

    const executionTime = Date.now() - startTime

    return {
      stdout: truncateOutput(stripAnsi(result.stdout || "")),
      stderr: truncateOutput(stripAnsi(result.stderr || "")),
      exitCode: result.status?.id === 3 ? 0 : 1,
      executionTime,
    }
  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === "AbortError") {
      return {
        stdout: "",
        stderr: "Execution timed out (sandbox unresponsive)",
        exitCode: 1,
        executionTime: Date.now() - startTime,
      }
    }
    throw err
  }
}

// ── Test case runner ──────────────────────────────────────────────

/**
 * Runs each test case separately and collects pass/fail results.
 */
export async function runTestCases(
  code: string,
  language: string,
  testCases: TestCase[]
): Promise<SandboxResult> {
  const testResults: Array<{
    input: string
    expected: string
    actual: string
    passed: boolean
  }> = []

  let totalPassed = 0

  for (const tc of testCases) {
    const inputStr = JSON.stringify(tc.input)
    const expectedStr = JSON.stringify(tc.expectedOutput)

    if (!JUDGE0_URL) {
      // Without Judge0, we can't actually run test cases
      testResults.push({
        input: inputStr,
        expected: expectedStr,
        actual: "(sandbox unavailable)",
        passed: false,
      })
      continue
    }

    try {
      const result = await executeOnJudge0(code, language, inputStr)
      const actual = result.stdout.trim()
      const passed = actual === expectedStr || actual === String(tc.expectedOutput)

      if (passed) totalPassed++

      testResults.push({
        input: inputStr,
        expected: expectedStr,
        actual,
        passed,
      })
    } catch (err: any) {
      testResults.push({
        input: inputStr,
        expected: expectedStr,
        actual: `Error: ${err?.message || "execution failed"}`,
        passed: false,
      })
    }
  }

  return {
    stdout: testResults
      .map((r, i) => `Test ${i + 1}: ${r.passed ? "PASS" : "FAIL"} | Input: ${r.input} | Expected: ${r.expected} | Got: ${r.actual}`)
      .join("\n"),
    stderr: "",
    exitCode: totalPassed === testCases.length ? 0 : 1,
    testsPassed: totalPassed,
    testsTotal: testCases.length,
    testResults,
  }
}

// ── Static analysis fallback ──────────────────────────────────────

function staticAnalysisFallback(code: string, language: string): SandboxResult {
  const issues: string[] = []

  // Basic static checks
  if (language === "javascript" || language === "typescript") {
    if (/\bvar\b/.test(code)) issues.push("Consider using 'let' or 'const' instead of 'var'")
    if (/console\.(log|warn|error)/.test(code)) issues.push("Code contains console output statements")
    if (code.includes("== ") && !code.includes("=== ")) issues.push("Consider using strict equality (===)")
  }

  if (language === "python") {
    if (/\bprint\s*\(/.test(code)) issues.push("Code contains print statements")
  }

  return {
    stdout: issues.length
      ? `Static analysis (sandbox unavailable):\n${issues.map((i) => `- ${i}`).join("\n")}`
      : "Static analysis: no issues detected (sandbox unavailable for runtime testing)",
    stderr: "",
    exitCode: 0,
  }
}
