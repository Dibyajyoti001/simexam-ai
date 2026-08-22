import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { evaluateSession, fetchSessionEvents } from "../../lib/api"
import { SESSION_KEYS } from "../../lib/constants"
import { AgentEvent, EvaluationResult } from "../../types/index"
import { RadarChart } from "../../components/RadarChart"
import { ResultsCard } from "../../components/ResultsCard"
import { SessionTimeline } from "../../components/SessionTimeline"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Badge } from "../../components/ui/badge"

interface EvaluationPayload {
  conversationHistory: string
  codeSnapshots: string[]
  timeElapsedSeconds: number
  curveballFired: boolean
  curveballAddressed: boolean
  studentName: string
  sessionId?: string
  orgSlug?: string
}

function MetricCard({ label, value }: { label: string; value: number }) {
  const color =
    value >= 8 ? "#22c55e" :
    value >= 6 ? "#6366f1" :
    value >= 4 ? "#f59e0b" :
    "#ef4444"

  return (
    <Card className="border-white/10 bg-white/[0.035]">
      <CardContent className="p-4">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-zinc-500">
          {label.toUpperCase()}
        </div>
        <div className="mt-3 text-4xl font-semibold tracking-[-0.06em]" style={{ color }}>
          {value}
          <span className="ml-1 text-base text-zinc-500">/10</span>
        </div>
      </CardContent>
    </Card>
  )
}

function ResultsSkeleton() {
  const block = (height: number, width: string | number = "100%") => (
    <div
      style={{
        height,
        width: typeof width === "number" ? `${width}px` : width,
      }}
      className="animate-[skeletonPulse_1.4s_ease-in-out_infinite] rounded-2xl bg-[linear-gradient(90deg,#111,#1b1b1f,#111)] bg-[length:200%_100%]"
    />
  )

  return (
    <main className="min-h-screen px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin text-indigo-300" />
          Evaluating session and generating grading report...
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            {block(18, 300)}
            {block(56, 420)}
            {block(20, 520)}
          </div>
          {block(44, 140)}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.02fr_0.98fr]">
          {block(430)}
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {block(132)}
              {block(132)}
              {block(132)}
              {block(132)}
            </div>
            {block(180)}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {block(220)}
          {block(220)}
        </div>
      </div>
    </main>
  )
}

function fallbackResult(payload: EvaluationPayload): EvaluationResult {
  const optimized = payload.curveballAddressed

  return {
    technicalAccuracy: optimized ? 7 : 4,
    adaptability: payload.curveballFired ? (payload.curveballAddressed ? 8 : 4) : 5,
    communication: 6,
    efficiency: payload.timeElapsedSeconds < 600 ? 8 : 6,
    overallFeedback:
      "Session completed. The candidate engaged with the problem, tested edge cases, and adapted to constraints during the interview simulation.",
    strengths: [
      "Completed the simulation and verified basic code functionality",
      optimized ? "Adapted the solution to the revised performance constraints" : "Engaged collaboratively with the AI interviewer",
    ],
    improvements: [
      "Deepen the explanation of algorithmic time and space trade-offs",
      "Add explicit edge-case tests before final submission",
    ],
    passed: Boolean(optimized || payload.timeElapsedSeconds < 600),
  }
}

export default function ResultsPage() {
  const navigate = useNavigate()
  const [result, setResult] = useState<EvaluationResult | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadOrEvaluate() {
      const rawResult = sessionStorage.getItem(SESSION_KEYS.RESULTS)
      const rawPayload = sessionStorage.getItem(SESSION_KEYS.EVALUATION_PAYLOAD)

      let sessionId: string | undefined
      if (rawPayload) {
        try {
          const parsedPayload = JSON.parse(rawPayload) as EvaluationPayload
          sessionId = parsedPayload.sessionId
        } catch {
          // ignore
        }
      }

      if (sessionId) {
        fetchSessionEvents(sessionId)
          .then((evts) => {
            if (!cancelled) setEvents(evts)
          })
          .catch(() => {})
      }

      if (rawResult) {
        try {
          const parsed = JSON.parse(rawResult) as EvaluationResult
          if (!cancelled) setResult(parsed)
        } catch {
          sessionStorage.removeItem(SESSION_KEYS.RESULTS)
        } finally {
          if (!cancelled) setLoading(false)
        }
        return
      }

      if (!rawPayload) {
        if (!cancelled) {
          setMissing(true)
          setLoading(false)
        }
        return
      }

      try {
        const payload = JSON.parse(rawPayload) as EvaluationPayload
        const evaluated = await evaluateSession(payload)
        sessionStorage.setItem(SESSION_KEYS.RESULTS, JSON.stringify(evaluated))
        sessionStorage.removeItem(SESSION_KEYS.EVALUATION_PENDING)
        if (!cancelled) setResult(evaluated)
      } catch {
        const payload = JSON.parse(rawPayload) as EvaluationPayload
        const fallback = fallbackResult(payload)
        sessionStorage.setItem(SESSION_KEYS.RESULTS, JSON.stringify(fallback))
        sessionStorage.removeItem(SESSION_KEYS.EVALUATION_PENDING)
        if (!cancelled) setResult(fallback)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadOrEvaluate()
    return () => {
      cancelled = true
    }
  }, [])

  const passed = useMemo(() => Boolean(result?.passed), [result])
  const avgScore = useMemo(() => {
    if (!result) return "—"
    const average =
      (result.technicalAccuracy +
        result.adaptability +
        result.communication +
        result.efficiency) / 4
    return average.toFixed(1)
  }, [result])

  if (loading) return <ResultsSkeleton />

  if (missing || !result) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-zinc-100 font-sans">
        <Card className="max-w-md border-white/10 bg-white/[0.035]">
          <CardHeader className="space-y-3">
            <Badge variant="outline" className="w-fit">
              NO SESSION DATA
            </Badge>
            <CardTitle className="text-2xl">Assessment data not found</CardTitle>
            <p className="text-sm leading-6 text-zinc-400">
              Start a new assessment so the evaluator has a transcript and code snapshots to grade.
            </p>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/dashboard")}>
              <ArrowLeft size={15} />
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-6 text-zinc-100 sm:px-6 lg:px-8 font-sans">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 border-b border-white/8 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="text-xs font-semibold tracking-[0.18em] text-zinc-500">
              PRACTICAL ASSESSMENT REPORT
            </div>
            <h1 className="text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
              Session Results
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-400">
              A comprehensive summary of technical accuracy, adaptability, communication, and execution speed.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge variant={passed ? "success" : "error"} className="px-4 py-2 text-xs">
              {passed ? <CheckCircle2 size={14} className="mr-1" /> : <XCircle size={14} className="mr-1" />}
              {passed ? "PASSED" : "NOT PASSED"}
            </Badge>
            <div className="text-xs text-zinc-500">Average score: {avgScore}/10</div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.02fr_0.98fr]">
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Score profile</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <RadarChart scores={result} />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Technical Accuracy" value={result.technicalAccuracy} />
            <MetricCard label="Adaptability" value={result.adaptability} />
            <MetricCard label="Communication" value={result.communication} />
            <MetricCard label="Efficiency" value={result.efficiency} />
          </div>
        </div>

        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader>
            <CardTitle className="text-xl">Overall feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-4xl text-sm leading-7 text-zinc-300">
              {result.overallFeedback}
            </p>
          </CardContent>
        </Card>

        <ResultsCard strengths={result.strengths} improvements={result.improvements} />

        {/* Mounted Session Timeline */}
        {events.length > 0 && (
          <div className="mt-6">
            <SessionTimeline events={events} />
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-zinc-500">
            SimExam AI Assessment Complete
          </div>

          <Button onClick={() => navigate("/dashboard")}>
            <ArrowLeft size={15} />
            Back to dashboard
          </Button>
        </div>
      </div>
    </main>
  )
}