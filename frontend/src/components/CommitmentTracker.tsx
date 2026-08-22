import { useEffect, useMemo, useState } from "react"
import { Check, Clock3, Plus, Save, Trash2 } from "lucide-react"
import { fetchSessionEvents, saveSessionCommitments } from "../lib/api"
import type { Commitment, CommitmentStatus, AgentEvent } from "../types/index"

interface CommitmentTrackerProps {
  sessionId: string | null
  studentName: string
  context: string
}

function makeDefaults(studentName: string, context: string): Commitment[] {
  const normalized = context.replace(/\s+/g, " ").trim()
  const subject = normalized.match(/(?:build|design|implement|create|explain)\s+([^.!?]+)/i)?.[1]
  const focus = subject ? subject.slice(0, 70) : "the assessment response"

  return [
    {
      id: "implementation",
      title: `Complete and verify ${focus}`,
      owner: studentName || "Me",
      dueDate: "Today",
      status: "open",
      priority: "high",
      notes: "Capture evidence in the workspace before submitting.",
      source: "suggested",
    },
    {
      id: "tradeoffs",
      title: "Document the key trade-offs and unresolved risks",
      owner: studentName || "Me",
      dueDate: "Before submission",
      status: "open",
      priority: "medium",
      notes: "",
      source: "suggested",
    },
  ]
}

function readSavedCommitments(events: AgentEvent[]): Commitment[] | null {
  const latest = [...events].reverse().find((event) => event.eventType === "commitment_update")
  const commitments = latest?.metadata?.commitments
  if (!Array.isArray(commitments)) return null
  return commitments.map((commitment) => ({
    ...commitment as Commitment,
    priority: (commitment as Partial<Commitment>).priority || "medium",
    notes: (commitment as Partial<Commitment>).notes || "",
    source: (commitment as Partial<Commitment>).source || "recorded",
  }))
}

export function CommitmentTracker({ sessionId, studentName, context }: CommitmentTrackerProps) {
  const defaults = useMemo(() => makeDefaults(studentName, context), [studentName, context])
  const localStorageKey = `simexam_commitments_${context.slice(0, 20)}`
  const [commitments, setCommitments] = useState<Commitment[]>(defaults)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setCommitments(defaults)
    setSaved(false)
    if (!sessionId) {
      try {
        const localDraft = sessionStorage.getItem(localStorageKey)
        if (localDraft) setCommitments(JSON.parse(localDraft) as Commitment[])
      } catch {
        // Ignore an invalid local draft and keep the generated defaults.
      }
      return
    }

    fetchSessionEvents(sessionId)
      .then((events) => {
        const stored = readSavedCommitments(events)
        if (stored) setCommitments(stored)
      })
      .catch(() => {})
  }, [defaults, localStorageKey, sessionId])

  function updateCommitment(id: string, field: "title" | "owner" | "dueDate" | "priority" | "notes", value: string) {
    setSaved(false)
    setCommitments((current) => current.map((commitment) =>
      commitment.id === id ? { ...commitment, [field]: value } : commitment
    ))
  }

  function toggleStatus(id: string) {
    setSaved(false)
    setCommitments((current) => current.map((commitment) =>
      commitment.id === id
        ? { ...commitment, status: commitment.status === "done" ? "open" : "done" as CommitmentStatus }
        : commitment
    ))
  }

  function addCommitment() {
    setSaved(false)
    setCommitments((current) => [...current, {
      id: `commitment-${Date.now()}`,
      title: "New follow-up commitment",
      owner: studentName || "Me",
      dueDate: "Later",
      status: "open",
      priority: "medium",
      notes: "",
      source: "recorded",
    }])
  }

  async function save() {
    if (!sessionId) {
      sessionStorage.setItem(localStorageKey, JSON.stringify(commitments))
      setSaved(true)
      return
    }
    setSaving(true)
    try {
      await saveSessionCommitments(sessionId, commitments)
      setSaved(true)
    } catch {
      setSaved(false)
    } finally {
      setSaving(false)
    }
  }

  const openCount = commitments.filter((item) => item.status === "open").length
  const doneCount = commitments.length - openCount
  const highPriorityCount = commitments.filter((item) => item.status === "open" && item.priority === "high").length
  const isDateOverdue = (dueDate: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return false
    return new Date(`${dueDate}T23:59:59`).getTime() < Date.now()
  }

  return (
    <section className="shrink-0 border-b border-white/8 bg-[#131316] px-4 py-3" aria-label="Commitment tracking">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Commitments</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">{doneCount}/{commitments.length} complete · {highPriorityCount} high priority</p>
        </div>
        <button
          type="button"
          onClick={addCommitment}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
        >
          <Plus size={13} /> Add
        </button>
      </div>

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
        {commitments.map((commitment) => (
          <div key={commitment.id} className={`rounded-lg border p-2 ${commitment.status === "done" ? "border-emerald-500/20 bg-emerald-500/[0.05]" : isDateOverdue(commitment.dueDate) ? "border-rose-500/30 bg-rose-500/[0.05]" : "border-white/8 bg-white/[0.02]"}`}>
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => toggleStatus(commitment.id)}
                aria-label={commitment.status === "done" ? "Reopen commitment" : "Complete commitment"}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${commitment.status === "done" ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-zinc-600 text-transparent hover:border-zinc-300"}`}
              >
                <Check size={11} strokeWidth={3} />
              </button>
              <input
                value={commitment.title}
                onChange={(event) => updateCommitment(commitment.id, "title", event.target.value)}
                className={`min-w-0 flex-1 bg-transparent text-xs outline-none ${commitment.status === "done" ? "text-zinc-500 line-through" : "text-zinc-200"}`}
                aria-label="Commitment"
              />
              <select
                value={commitment.priority}
                onChange={(event) => updateCommitment(commitment.id, "priority", event.target.value)}
                className="w-[68px] shrink-0 bg-transparent text-[10px] text-zinc-500 outline-none"
                aria-label="Priority"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button type="button" onClick={() => setCommitments((current) => current.filter((item) => item.id !== commitment.id))} aria-label="Delete commitment" className="text-zinc-600 hover:text-rose-300">
                <Trash2 size={13} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
              <input value={commitment.owner} onChange={(event) => updateCommitment(commitment.id, "owner", event.target.value)} className="border-b border-white/8 bg-transparent py-1 text-[11px] text-zinc-400 outline-none focus:border-indigo-400" aria-label="Owner" placeholder="Owner" />
              <label className="flex items-center gap-1 border-b border-white/8 text-[11px] text-zinc-500 focus-within:border-indigo-400">
                <Clock3 size={11} />
                <input value={commitment.dueDate} onChange={(event) => updateCommitment(commitment.id, "dueDate", event.target.value)} className="min-w-0 flex-1 bg-transparent py-1 text-zinc-400 outline-none" aria-label="Due date" placeholder="Due date" />
              </label>
            </div>
            <input value={commitment.notes} onChange={(event) => updateCommitment(commitment.id, "notes", event.target.value)} className="mt-2 w-full border-b border-white/8 bg-transparent py-1 pl-6 text-[11px] text-zinc-500 outline-none focus:border-indigo-400" aria-label="Notes" placeholder="Add evidence, dependency, or next step" />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-zinc-600">{openCount} open</span>
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-7 items-center gap-1 rounded-md bg-indigo-500/15 px-2.5 text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50">
          <Save size={12} /> {saving ? "Saving..." : saved ? "Saved" : "Save commitments"}
        </button>
      </div>
    </section>
  )
}
