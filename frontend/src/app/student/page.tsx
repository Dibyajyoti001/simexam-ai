import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, BookOpen, Clock, LogOut, PenTool, Search } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { useAuth } from "../../hooks/useAuth"
import { fetchMySessionHistory } from "../../lib/api"
import type { SessionSummary } from "../../types/index"

const SUGGESTED_TOPICS = ["React Hooks", "Microservices", "API Design", "System Design", "TypeScript"]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export default function StudentHub() {
  const navigate = useNavigate()
  const { user, logout, isLoading } = useAuth()

  const [inputValue, setInputValue] = useState("")
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)

  useEffect(() => {
    if (isLoading) return
    // Fetch the student's own session history
    fetchMySessionHistory()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false))
  }, [isLoading])

  if (isLoading || !user) return null

  function handleAction(type: "exam" | "learn") {
    if (!inputValue.trim()) return
    sessionStorage.setItem("simexam_hub_intent", type)
    sessionStorage.setItem("simexam_hub_query", inputValue)
    navigate(`/${user?.orgSlug || "demo"}/intake`)
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-zinc-100 font-sans">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,131,255,0.08),transparent_40%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.5),transparent_40%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6">
        {/* Header */}
        <nav className="flex items-center justify-between py-6">
          <span className="text-xl font-semibold tracking-tight text-zinc-50">SimExam</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400">
              Welcome, <span className="text-zinc-200">{user.name || user.email || "Student"}</span>
            </span>
            <button 
              onClick={logout}
              className="flex items-center text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-200"
            >
              Sign out <LogOut size={14} className="ml-2" />
            </button>
          </div>
        </nav>

        {/* Centered Hub Content */}
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center animate-fade-up">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            What would you like to do?
          </h1>
          <p className="mt-4 max-w-md text-base text-zinc-400">
            Enter an assessment code or topic to start an interactive session.
          </p>

          {/* Central Input Hub */}
          <div className="mt-10 w-full max-w-xl space-y-4">
            <div className="relative group">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-500">
                <Search size={18} />
              </div>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAction("exam") }}
                placeholder="e.g., 'ABCD-EFGH' or 'Learn System Design'"
                className="w-full rounded-2xl border border-white/10 bg-surface-raised/50 py-4 pl-12 pr-4 text-base text-zinc-100 shadow-sm backdrop-blur-md transition-all placeholder:text-zinc-600 focus:border-accent/50 focus:bg-surface-raised focus:outline-none focus:ring-4 focus:ring-accent/10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button 
                onClick={() => handleAction("exam")}
                disabled={!inputValue.trim()}
                className="h-12 w-full rounded-xl bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              >
                <PenTool size={16} className="mr-2" />
                Join Assessment
              </Button>
              <Button 
                onClick={() => handleAction("learn")}
                disabled={!inputValue.trim()}
                variant="outline"
                className="h-12 w-full rounded-xl border-white/10 bg-surface-raised hover:bg-white/5"
              >
                <BookOpen size={16} className="mr-2 text-accent" />
                Start Learning
              </Button>
            </div>
          </div>

          {/* Quick Stats / History */}
          <div className="mt-24 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="border-white/5 bg-transparent shadow-none">
              <CardContent className="p-6 text-left">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Recent Activity</div>
                {sessionsLoading ? (
                  <div className="mt-3 h-4 w-24 animate-pulse rounded bg-white/5" />
                ) : sessions.length === 0 ? (
                  <div className="mt-3 text-sm text-zinc-400">No recent sessions found.</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {sessions.slice(0, 3).map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Clock size={12} className="text-zinc-500" />
                          <span>{formatDate(s.startedAt)}</span>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === "evaluated"
                            ? s.passed ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
                            : "bg-white/5 text-zinc-400"
                        }`}>
                          {s.status === "evaluated" ? (s.passed ? "Passed" : "Failed") : s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-transparent shadow-none">
              <CardContent className="p-6 text-left">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Suggested Topics</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTED_TOPICS.map((topic) => (
                    <span
                      key={topic}
                      className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/10"
                      onClick={() => setInputValue(topic)}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}
