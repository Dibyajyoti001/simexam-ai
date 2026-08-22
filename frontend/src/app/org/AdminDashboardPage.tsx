import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  BarChart3,
  CheckCircle,
  Clock,
  Settings,
  Users,
  Eye,
  Inbox,
  UserPlus,
  Copy,
  Check,
  X,
} from "lucide-react"
import { listOrgSessions, listOrgStudents, createStudent } from "../../lib/api"
import { useTenantConfig } from "../../hooks/useTenantConfig"
import { TenantShell } from "../../components/TenantShell"
import { Card, CardContent } from "../../components/ui/card"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import type { SessionSummary } from "../../types/index"

function statusBadge(status: SessionSummary["status"]) {
  switch (status) {
    case "active":
      return <Badge variant="warning">Active</Badge>
    case "submitted":
      return <Badge variant="outline">Submitted</Badge>
    case "evaluated":
      return <Badge variant="success">Evaluated</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function passedBadge(passed: boolean | null | undefined) {
  if (passed === true)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
        Pass
      </span>
    )
  if (passed === false)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-300">
        Fail
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-0.5 text-[11px] font-medium text-zinc-500">
      Pending
    </span>
  )
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null) return "—"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

interface StudentRecord {
  id: string
  name: string
  email: string
  invite_token: string
  created_at: string
}

export default function AdminDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const navigate = useNavigate()
  const { config } = useTenantConfig(orgSlug)

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Student creation modal state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [studentName, setStudentName] = useState("")
  const [studentEmail, setStudentEmail] = useState("")
  const [creating, setCreating] = useState(false)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadData = () => {
    if (!orgSlug) return
    setLoading(true)
    Promise.all([
      listOrgSessions(orgSlug).catch(() => []),
      listOrgStudents(orgSlug).catch(() => []),
    ])
      .then(([sess, stds]) => {
        setSessions(sess)
        setStudents(stds)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [orgSlug])

  const stats = useMemo(() => {
    const total = sessions.length
    const active = sessions.filter((s) => s.status === "active").length
    const evaluated = sessions.filter((s) => s.status === "evaluated")
    const passed = evaluated.filter((s) => s.passed === true).length
    const passRate = evaluated.length > 0 ? Math.round((passed / evaluated.length) * 100) : 0
    const durations = evaluated
      .map((s) => s.timeElapsedSeconds)
      .filter((v): v is number => v != null)
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0

    return { total, active, passRate, avgDuration }
  }, [sessions])

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentName.trim()) return
    setCreating(true)
    try {
      const res = await createStudent(studentName, config.orgId, studentEmail || undefined)
      setCreatedToken(res.inviteToken)
      setStudentName("")
      setStudentEmail("")
      loadData()
    } catch (err: any) {
      alert(err.message || "Failed to create invite")
    } finally {
      setCreating(false)
    }
  }

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <TenantShell orgSlug={orgSlug ?? "demo"}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 font-sans">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
              Admin Dashboard
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{config.branding.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => { setShowInviteModal(true); setCreatedToken(null); }}>
              <UserPlus size={15} />
              Invite Student
            </Button>
            <Button variant="outline" onClick={() => navigate(`/${orgSlug}/admin/config`)}>
              <Settings size={15} />
              Config
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="stat-card border-white/10 bg-white/[0.035]">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04]">
                <Users size={18} className="text-indigo-300" />
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-zinc-500">Total Sessions</p>
                <p className="mt-0.5 font-mono text-2xl font-semibold text-zinc-100">
                  {stats.total}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card border-white/10 bg-white/[0.035]">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06]">
                <CheckCircle size={18} className="text-emerald-300" />
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-zinc-500">Pass Rate</p>
                <p className="mt-0.5 font-mono text-2xl font-semibold text-zinc-100">
                  {stats.passRate}%
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card border-white/10 bg-white/[0.035]">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04]">
                <BarChart3 size={18} className="text-indigo-300" />
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-zinc-500">Avg Duration</p>
                <p className="mt-0.5 font-mono text-2xl font-semibold text-zinc-100">
                  {formatDuration(stats.avgDuration)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card border-white/10 bg-white/[0.035]">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/[0.06]">
                <Clock size={18} className="text-amber-300" />
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-zinc-500">Active Now</p>
                <p className="mt-0.5 font-mono text-2xl font-semibold text-zinc-100">
                  {stats.active}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sessions table */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-200">Assessment Sessions</h2>
            <span className="text-xs text-zinc-500">{sessions.length} total</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Inbox size={40} className="text-zinc-700" />
                <p className="text-sm font-medium text-zinc-400">No sessions yet</p>
                <p className="text-xs text-zinc-600">
                  Sessions will appear here once candidates start their assessments.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="admin-table w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/8 bg-white/[0.02]">
                      <th className="px-5 py-3 text-xs font-medium tracking-wide text-zinc-500">
                        Candidate
                      </th>
                      <th className="px-5 py-3 text-xs font-medium tracking-wide text-zinc-500">
                        Status
                      </th>
                      <th className="px-5 py-3 text-xs font-medium tracking-wide text-zinc-500">
                        Started
                      </th>
                      <th className="px-5 py-3 text-xs font-medium tracking-wide text-zinc-500">
                        Duration
                      </th>
                      <th className="px-5 py-3 text-xs font-medium tracking-wide text-zinc-500">
                        Result
                      </th>
                      <th className="px-5 py-3 text-xs font-medium tracking-wide text-zinc-500">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr
                        key={session.id}
                        className="cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                        onClick={() => navigate(`/${orgSlug}/admin/session/${session.id}`)}
                      >
                        <td className="px-5 py-3 font-medium text-zinc-200">
                          {session.studentId ?? "Candidate"}
                        </td>
                        <td className="px-5 py-3">{statusBadge(session.status)}</td>
                        <td className="px-5 py-3 font-mono text-xs text-zinc-400">
                          {formatDate(session.startedAt)}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-zinc-400">
                          {formatDuration(session.timeElapsedSeconds)}
                        </td>
                        <td className="px-5 py-3">{passedBadge(session.passed)}</td>
                        <td className="px-5 py-3">
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/${orgSlug}/admin/session/${session.id}`)
                            }}
                          >
                            <Eye size={14} />
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Student Invites Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-200">Student Invite Tokens</h2>
            <span className="text-xs text-zinc-500">{students.length} invites</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
            {students.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-zinc-500">
                No student invites created yet. Click "Invite Student" to generate an access token.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="admin-table w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/8 bg-white/[0.02]">
                      <th className="px-5 py-3 text-xs font-medium text-zinc-500">Name</th>
                      <th className="px-5 py-3 text-xs font-medium text-zinc-500">Email</th>
                      <th className="px-5 py-3 text-xs font-medium text-zinc-500">Invite Token</th>
                      <th className="px-5 py-3 text-xs font-medium text-zinc-500">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((std) => (
                      <tr key={std.id} className="border-b border-white/[0.04]">
                        <td className="px-5 py-3 font-medium text-zinc-200">{std.name}</td>
                        <td className="px-5 py-3 text-zinc-400">{std.email || "—"}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
                              {std.invite_token}
                            </span>
                            <button
                              onClick={() => copyToken(std.invite_token)}
                              className="text-zinc-500 hover:text-zinc-300"
                              title="Copy Token"
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-zinc-400">
                          {formatDate(std.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl space-y-4 animate-fade-up">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-zinc-100">Invite Student</h3>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X size={16} />
                </button>
              </div>

              {createdToken ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center">
                    <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Invite Token Generated</p>
                    <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-zinc-100">{createdToken}</p>
                    <p className="mt-2 text-xs text-zinc-400">Share this token with the student to sign in via the Student Access form.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => copyToken(createdToken)} className="flex-1">
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                      {copied ? "Copied!" : "Copy Token"}
                    </Button>
                    <Button variant="outline" onClick={() => setCreatedToken(null)}>
                      Create Another
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateStudent} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Student Name *</label>
                    <input
                      required
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Student Email (optional)</label>
                    <input
                      type="email"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      placeholder="e.g. jane@example.com"
                      className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setShowInviteModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? "Generating..." : "Generate Invite"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

      </div>
    </TenantShell>
  )
}
