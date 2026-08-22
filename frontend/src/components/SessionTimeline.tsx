import { AgentEvent } from "../types/index"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

interface SessionTimelineProps {
  events: AgentEvent[]
}

export function SessionTimeline({ events }: SessionTimelineProps) {
  return (
    <Card className="border-white/10 bg-white/[0.035]">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Session timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm text-zinc-500">
            No persisted events yet.
          </div>
        ) : events.map((event) => (
          <div key={event.id} className="rounded-2xl border border-white/8 bg-zinc-950/55 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500">
              <span className="font-medium tracking-[0.14em]">{event.eventType.toUpperCase()}</span>
              <span>{new Date(event.createdAt).toLocaleTimeString("en-US", { hour12: false })}</span>
            </div>
            {event.eventType === "commitment_update" && Array.isArray(event.metadata?.commitments) ? (
              <div className="mt-2 space-y-1.5">
                {(event.metadata.commitments as Array<{ title?: string; owner?: string; dueDate?: string; status?: string; priority?: string; notes?: string }>).map((commitment, index) => (
                  <div key={`${event.id}-${index}`} className="border-b border-white/[0.04] pb-1.5 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3 text-sm text-zinc-200">
                      <span className={commitment.status === "done" ? "text-zinc-500 line-through" : ""}>{commitment.title || "Untitled commitment"}</span>
                      <span className="shrink-0 text-[11px] text-zinc-500">{commitment.owner || "Me"} · {commitment.dueDate || "Later"}</span>
                    </div>
                    {(commitment.priority || commitment.notes) && (
                      <div className="mt-1 flex gap-2 pl-0 text-[11px] text-zinc-500">
                        {commitment.priority ? <span className="uppercase tracking-wide text-zinc-600">{commitment.priority}</span> : null}
                        {commitment.notes ? <span className="truncate">{commitment.notes}</span> : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm leading-6 text-zinc-200">
                {event.content || event.actor}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
