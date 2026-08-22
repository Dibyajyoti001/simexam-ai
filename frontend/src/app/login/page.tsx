import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowRight,
  ArrowLeft,
  GraduationCap,
  Building2,
  Sparkles,
  KeyRound,
  ShieldCheck,
  Zap,
} from "lucide-react"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { useAuth } from "../../hooks/useAuth"
import { verifyStudentToken } from "../../lib/auth"

type AuthRole = "candidate" | "organization" | null

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, register, isAuthenticated, user } = useAuth()

  // Selected Portal Role
  const [role, setRole] = useState<AuthRole>(null)

  // Candidate mode: "invite" | "demo" | "student_login"
  const [candidateMode, setCandidateMode] = useState<"invite" | "student_login">("invite")
  const [inviteToken, setInviteToken] = useState("")

  // Org tab: "login" | "register"
  const [orgTab, setOrgTab] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [orgSlug, setOrgSlug] = useState("")
  const [orgName, setOrgName] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Redirect if already authenticated
  if (isAuthenticated && user) {
    if (user.role === "admin") {
      navigate(`/${user.orgSlug}/admin`, { replace: true })
    } else {
      navigate("/dashboard", { replace: true })
    }
    return null
  }

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      if (orgTab === "login") {
        const result = await login(email, password)
        navigate(`/${result.orgSlug}/admin`, { replace: true })
      } else {
        const result = await register(email, password, orgSlug, orgName)
        navigate(`/${result.orgSlug}/admin`, { replace: true })
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed")
    } finally {
      setLoading(false)
    }
  }

  async function handleStudentInvite(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const cleanToken = inviteToken.trim().toUpperCase()
      const data = await verifyStudentToken(cleanToken)
      sessionStorage.setItem("simexam_hub_query", cleanToken)
      navigate(`/${data.orgSlug || "demo"}/intake`, { replace: true })
    } catch (err: any) {
      setError(err.message || "Invalid invite token. Check spelling or request a new invite.")
    } finally {
      setLoading(false)
    }
  }

  function handleQuickDemo() {
    sessionStorage.setItem("simexam_hub_intent", "exam")
    sessionStorage.setItem("simexam_hub_query", "Demo Engineering Challenge")
    navigate("/demo/intake")
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 font-sans text-zinc-100">
      {/* Dynamic ambient gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.15),transparent_35%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.6),transparent_40%)]" />

      {/* Top Bar navigation */}
      <div className="absolute left-6 top-6 z-10">
        <button
          onClick={() => (role ? setRole(null) : navigate("/"))}
          className="flex items-center text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <ArrowLeft size={16} className="mr-2" />
          {role ? "Change Role" : "Back to Home"}
        </button>
      </div>

      <div className="relative z-10 w-full max-w-lg space-y-8 animate-fade-up">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
            <Sparkles size={22} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
            {role === null
              ? "Select Portal Type"
              : role === "candidate"
              ? "Candidate & Learner Portal"
              : "Organization & Examiner Portal"}
          </h1>
          <p className="text-sm text-zinc-400">
            {role === null
              ? "Choose your account type to access assessments or configure exams"
              : role === "candidate"
              ? "Take dynamic technical interviews, self-study topics, or join via token"
              : "Create custom AI exams, customize interviewer personas, and review candidate intelligence"}
          </p>
        </div>

        {/* ─── STAGE 1: Role Selector ─── */}
        {role === null && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Candidate Card */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setRole("candidate")}
              onKeyDown={(e) => { if (e.key === "Enter") setRole("candidate") }}
              className="group relative cursor-pointer rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-200 hover:border-indigo-400/50 hover:bg-indigo-500/[0.04] hover:shadow-[0_0_25px_rgba(99,102,241,0.15)] flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-indigo-300 group-hover:border-indigo-400/40 group-hover:bg-indigo-500/20">
                  <GraduationCap size={22} />
                </div>
                <h2 className="text-lg font-semibold text-zinc-100 group-hover:text-indigo-200">
                  Candidate / Learner
                </h2>
                <p className="text-xs leading-5 text-zinc-400">
                  Join with an organization invite token, take interactive AI interviews, or self-study any technical topic.
                </p>
              </div>

              <div className="mt-6 flex items-center text-xs font-semibold text-indigo-400 group-hover:text-indigo-300">
                Continue as Candidate <ArrowRight size={14} className="ml-1.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>

            {/* Organization Card */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setRole("organization")}
              onKeyDown={(e) => { if (e.key === "Enter") setRole("organization") }}
              className="group relative cursor-pointer rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-200 hover:border-emerald-400/50 hover:bg-emerald-500/[0.04] hover:shadow-[0_0_25px_rgba(34,197,94,0.15)] flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-emerald-300 group-hover:border-emerald-400/40 group-hover:bg-emerald-500/20">
                  <Building2 size={22} />
                </div>
                <h2 className="text-lg font-semibold text-zinc-100 group-hover:text-emerald-200">
                  Organization / Examiner
                </h2>
                <p className="text-xs leading-5 text-zinc-400">
                  Generate dynamic multi-modal exams with AI, ingest docs, configure curveballs, and evaluate candidates.
                </p>
              </div>

              <div className="mt-6 flex items-center text-xs font-semibold text-emerald-400 group-hover:text-emerald-300">
                Organization Sign In <ArrowRight size={14} className="ml-1.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </div>
        )}

        {/* ─── STAGE 2: Candidate Portal ─── */}
        {role === "candidate" && (
          <Card className="border-white/10 bg-zinc-950/70 backdrop-blur-xl">
            <CardContent className="p-6 space-y-6">
              {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 text-xs text-red-300">{error}</div>}

              <div className="flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
                <button
                  onClick={() => { setCandidateMode("invite"); setError("") }}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${candidateMode === "invite" ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  <KeyRound size={13} className="inline mr-1.5" />
                  Invite Token
                </button>
                <button
                  onClick={() => { setCandidateMode("student_login"); setError("") }}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${candidateMode === "student_login" ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  <ShieldCheck size={13} className="inline mr-1.5" />
                  Self-Study / Learner
                </button>
              </div>

              {candidateMode === "invite" ? (
                <form onSubmit={handleStudentInvite} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Assessment Invite Token
                    </label>
                    <input
                      required
                      value={inviteToken}
                      onChange={(e) => setInviteToken(e.target.value.toUpperCase())}
                      placeholder="e.g. ABCD-EFGH"
                      className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-center font-mono text-base tracking-widest text-zinc-100 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <p className="mt-1.5 text-[11px] text-zinc-500">
                      Enter the 8-character token issued by your organization to start your assessment.
                    </p>
                  </div>

                  <Button type="submit" className="w-full h-11 rounded-xl" disabled={loading}>
                    {loading ? "Verifying..." : "Join Assigned Assessment"} <ArrowRight size={16} className="ml-1.5" />
                  </Button>
                </form>
              ) : (
                <div className="space-y-4 text-center">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Practice any technical discipline, run mock architecture interviews, or self-study with our low-latency Socratic AI mentor.
                  </p>
                  <Button onClick={() => navigate("/dashboard")} className="w-full h-11 rounded-xl">
                    <Zap size={16} className="mr-1.5 text-amber-300" />
                    Enter Student Learning Hub
                  </Button>
                </div>
              )}

              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleQuickDemo}
                  className="w-full text-center text-xs text-zinc-400 hover:text-indigo-300 transition-colors py-1"
                >
                  ⚡ Or start an instant demo coding assessment &rarr;
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── STAGE 2: Organization Portal ─── */}
        {role === "organization" && (
          <Card className="border-white/10 bg-zinc-950/70 backdrop-blur-xl">
            <CardContent className="p-6 space-y-6">
              {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 text-xs text-red-300">{error}</div>}

              <div className="flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
                <button
                  onClick={() => { setOrgTab("login"); setError("") }}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${orgTab === "login" ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  Admin Sign In
                </button>
                <button
                  onClick={() => { setOrgTab("register"); setError("") }}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${orgTab === "register" ? "bg-emerald-600 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  Create Organization
                </button>
              </div>

              <form onSubmit={handleAdminSubmit} className="space-y-4">
                {orgTab === "register" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Organization Name</label>
                      <input
                        required
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="e.g. Acme Engineering"
                        className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Organization Slug</label>
                      <input
                        required
                        value={orgSlug}
                        onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                        placeholder="e.g. acme-corp"
                        className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-100 font-mono outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Email Address</label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@organization.com"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Password</label>
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-400"
                  />
                </div>

                <Button type="submit" className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white" disabled={loading}>
                  {loading ? "Authenticating..." : orgTab === "login" ? "Sign in to Dashboard" : "Create Organization"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
