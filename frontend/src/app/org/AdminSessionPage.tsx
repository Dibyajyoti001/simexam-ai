import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react"
import { fetchSessionEvents } from "../../lib/api"
import { TenantShell } from "../../components/TenantShell"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import type { AgentEvent } from "../../types/index"

function eventTypeBadge(type: AgentEvent["eventType"]) {
  const styles: Record<string, string> = {
    message: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    code_run: "border-purple-500/20 bg-purple-500/10 text-purple-300",
    tool_call: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    curveball: "border-red-500/20 bg-red-500/10 text-red-300",
    proactive: "border-teal-500/20 bg-teal-500/10 text-teal-300",
    submission: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    evaluation: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    commitment_update: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
  }

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
        styles[type] ?? "border-white/8 bg-white/[0.03] text-zinc-400",
      ].join(" ")}
    >
      {type.replace("_", " ").toUpperCase()}
    </span>
  )
}

function actorBadge(actor: AgentEvent["actor"]) {
  const styles: Record<string, string> = {
    student: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    agent: "border-white/8 bg-white/[0.03] text-zinc-300",
    system: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
  }

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        styles[actor] ?? "border-white/8 bg-white/[0.03] text-zinc-400",
      ].join(" ")}
    >
      {actor}
    </span>
  )
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour12: false })
}

function EventCard({ event }: { event: AgentEvent }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="relative ml-6 rounded-xl border border-white/8 bg-zinc-950/50 p-4 transition-all duration-200 hover:bg-white/[0.03]">
      {/* Timeline dot */}
      <div className="absolute -left-[25px] top-5 h-2.5 w-2.5 rounded-full border-2 border-zinc-700 bg-zinc-900" />

      <div className="flex flex-wrap items-center gap-2">
        {eventTypeBadge(event.eventType)}
        {actorBadge(event.actor)}
        <span className="ml-auto font-mono text-[11px] text-zinc-600">
          {formatTimestamp(event.createdAt)}
        </span>
      </div>

      {event.eventType === "commitment_update" && Array.isArray(event.metadata?.commitments) ? (
        <div className="mt-3 space-y-2">
          {(event.metadata.commitments as Array<{ title?: string; owner?: string; dueDate?: string; status?: string; priority?: string }>).map((commitment, index) => (
            <div key={`${event.id}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-xs">
              <span className={commitment.status === "done" ? "text-zinc-500 line-through" : "text-zinc-200"}>{commitment.title || "Untitled commitment"}</span>
              <span className="shrink-0 text-zinc-500">{commitment.priority || "medium"} · {commitment.owner || "Me"} · {commitment.dueDate || "Later"}</span>
            </div>
          ))}
        </div>
      ) : event.content ? (
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-300">
          {event.content}
        </p>
      ) : null}

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? "Collapse" : "Details"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-white/[0.04] pt-3">
          {event.content && (
            <div>
              <p className="mb-1 text-[10px] font-medium tracking-wide text-zinc-600">
                FULL CONTENT
              </p>
              <pre className="max-h-40 overflow-auto rounded-lg border border-white/[0.04] bg-zinc-950/80 p-3 font-mono text-xs leading-5 text-zinc-300">
                {event.content}
              </pre>
            </div>
          )}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium tracking-wide text-zinc-600">
                METADATA
              </p>
              <pre className="max-h-40 overflow-auto rounded-lg border border-white/[0.04] bg-zinc-950/80 p-3 font-mono text-xs leading-5 text-zinc-400">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminSessionPage() {
  const { orgSlug, sessionId } = useParams<{ orgSlug: string; sessionId: string }>()
  const navigate = useNavigate()

  const [events, setEvents] = useState<AgentEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return
    fetchSessionEvents(sessionId)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [sessionId])

  // Derive session-level info from events
  const firstEvent = events[0]
  const lastEvent = events[events.length - 1]
  const evaluationEvent = events.find((e) => e.eventType === "evaluation")
  const submissionEvent = events.find((e) => e.eventType === "submission")

  const sessionStatus = evaluationEvent
    ? "evaluated"
    : submissionEvent
      ? "submitted"
      : "active"

  const duration =
    firstEvent && lastEvent
      ? Math.round(
          (new Date(lastEvent.createdAt).getTime() -
            new Date(firstEvent.createdAt).getTime()) /
            1000
        )
      : null

  const durationStr = duration != null
    ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`
    : "—"

  // Parse evaluation scores from evaluation event metadata
  const evalScores = evaluationEvent?.metadata as Record<string, unknown> | undefined

  return (
    <TenantShell orgSlug={orgSlug ?? "demo"}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(`/${orgSlug}/admin`)}>
              <ArrowLeft size={15} />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
                Session {sessionId?.slice(0, 8)}…
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant={
                    sessionStatus === "evaluated"
                      ? "success"
                      : sessionStatus === "submitted"
                        ? "outline"
                        : "warning"
                  }
                >
                  {sessionStatus}
                </Badge>
                <span className="font-mono text-xs text-zinc-500">{durationStr}</span>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-12 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            {/* Left: Timeline */}
            <Card className="border-white/10 bg-white/[0.035]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Event Timeline</CardTitle>
                <p className="text-xs text-zinc-500">{events.length} events</p>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-600">
                    No events recorded for this session.
                  </p>
                ) : (
                  <div className="relative border-l-2 border-zinc-800 pl-0">
                    <div className="space-y-4">
                      {events.map((event) => (
                        <EventCard key={event.id} event={event} />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right: Evaluation */}
            <div className="space-y-5">
              {evalScores && (
                <Card className="border-white/10 bg-white/[0.035]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Evaluation Scores</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries(evalScores).map(([key, value]) => {
                      if (typeof value !== "number") return null
                      return (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-zinc-400 capitalize">
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(value * 10, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-zinc-300 w-6 text-right">
                              {typeof value === "number" ? value.toFixed(1) : String(value)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Session info card */}
              <Card className="border-white/10 bg-white/[0.035]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Session Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Session ID</span>
                    <span className="font-mono text-xs text-zinc-300">{sessionId}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Status</span>
                    <span className="text-zinc-300 capitalize">{sessionStatus}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Duration</span>
                    <span className="font-mono text-zinc-300">{durationStr}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Total Events</span>
                    <span className="font-mono text-zinc-300">{events.length}</span>
                  </div>
                  {firstEvent && (
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Started</span>
                      <span className="font-mono text-xs text-zinc-300">
                        {new Date(firstEvent.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </TenantShell>
  )
}
