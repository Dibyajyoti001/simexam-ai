import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowRight, BrainCircuit, ShieldAlert, Sparkles, Loader2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { useAuth } from "../../hooks/useAuth"
import { generateLearningChallenge } from "../../lib/api"
import { SESSION_KEYS } from "../../lib/constants"
import { createLocalChallenge } from "../../hooks/useTenantConfig"

const DOMAIN_OPTIONS = [
  "Backend & APIs",
  "Frontend & UI Architecture",
  "System Architecture",
  "Cloud & DevOps Infrastructure",
  "AI & Data Engineering",
  "Product Management & Specs",
  "Theoretical / Conceptual",
]

const EXPERIENCE_OPTIONS = ["Junior Engineer", "Mid-Level Engineer", "Senior Engineer", "Staff / Principal"]

const FORMAT_OPTIONS: Array<{ id: "coding" | "system_design" | "conceptual"; label: string; desc: string }> = [
  { id: "coding", label: "Live Code Simulation", desc: "Monaco Editor with live execution & Socratic code guidance" },
  { id: "system_design", label: "System Design Whiteboard", desc: "Interactive canvas for architecture, bottlenecks & tradeoffs" },
  { id: "conceptual", label: "Conceptual / Essay", desc: "Deep structured essay editor evaluated across semantic rubrics" },
]

export default function IntakePage() {
  const navigate = useNavigate()
  const { orgSlug, token } = useParams<{ orgSlug: string; token?: string }>()
  const { user } = useAuth()

  // If token is provided in URL params, store it
  if (token && typeof window !== "undefined") {
    sessionStorage.setItem("simexam_hub_query", token.toUpperCase())
  }

  const hubQuery = typeof window !== "undefined" ? sessionStorage.getItem("simexam_hub_query") || token || "" : ""
  const hubIntent = typeof window !== "undefined" ? sessionStorage.getItem("simexam_hub_intent") || "exam" : "exam"

  const [focusArea, setFocusArea] = useState(DOMAIN_OPTIONS[0])
  const [experience, setExperience] = useState(EXPERIENCE_OPTIONS[2])
  const [format, setFormat] = useState<"coding" | "system_design" | "conceptual">("coding")
  const [generating, setGenerating] = useState(false)

  async function handleStart() {
    // Every intake begins a new attempt. Without this, an old transcript or
    // code snapshot can make a fresh assessment look like the previous one.
    sessionStorage.removeItem(SESSION_KEYS.SESSION_ID)
    sessionStorage.removeItem(SESSION_KEYS.MESSAGES)
    sessionStorage.removeItem(SESSION_KEYS.EXAM_STATE)
    sessionStorage.removeItem(SESSION_KEYS.EVALUATION_PAYLOAD)
    sessionStorage.removeItem(SESSION_KEYS.EVALUATION_PENDING)
    sessionStorage.removeItem(SESSION_KEYS.RESULTS)
    sessionStorage.removeItem("simexam_mode_conceptual")
    sessionStorage.removeItem("simexam_mode_whiteboard")
    sessionStorage.setItem("simexam_intake_focus", focusArea)
    sessionStorage.setItem("simexam_intake_experience", experience)
    sessionStorage.setItem("simexam_intake_format", format)

    const resolvedSlug = orgSlug || user?.orgSlug || "demo"

    // Check if query is an invite token or a custom learning/assessment topic
    const isInviteToken = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(hubQuery.trim())
    const shouldGenerateCustom = Boolean(hubQuery && !isInviteToken && (hubIntent === "learn" || hubQuery.length > 1))

    if (shouldGenerateCustom) {
      setGenerating(true)
      try {
        const challenge = await generateLearningChallenge({
          topic: hubQuery,
          domain: focusArea,
          seniority: experience,
          assessmentType: format,
        })

        if (challenge.exam) {
          sessionStorage.setItem("simexam_dynamic_config", JSON.stringify(challenge))
          sessionStorage.setItem(SESSION_KEYS.CODE, challenge.exam.starterCode || "")
          sessionStorage.setItem("simexam_intake_format", challenge.exam.type || format)
        }
      } catch (err) {
        const localChallenge = createLocalChallenge({
          orgSlug: resolvedSlug,
          topic: hubQuery,
          domain: focusArea,
          assessmentType: format,
        })
        sessionStorage.setItem("simexam_dynamic_config", JSON.stringify(localChallenge))
        sessionStorage.setItem(SESSION_KEYS.CODE, localChallenge.exam?.starterCode || "")
        sessionStorage.setItem("simexam_intake_format", localChallenge.exam?.type || format)
        console.warn("[Intake] AI generation unavailable; opened a format-specific local challenge.")
      } finally {
        setGenerating(false)
      }
    } else {
      sessionStorage.removeItem("simexam_dynamic_config")
      sessionStorage.removeItem(SESSION_KEYS.CODE)
    }

    navigate(`/${resolvedSlug}/exam`)
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-8 font-sans text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.15),transparent_35%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.5),transparent_40%)]" />

      <div className="relative z-10 w-full max-w-2xl space-y-6 animate-fade-up">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
            <BrainCircuit size={24} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
            {hubQuery ? `Custom Challenge: ${hubQuery}` : "Assessment & Persona Setup"}
          </h1>
          <p className="mx-auto max-w-md text-sm text-zinc-400">
            Configure your focus domain and evaluation format. The autonomous Socratic AI interviewer will calibrate its difficulty and rubrics accordingly.
          </p>
        </div>

        <Card className="border-white/10 bg-zinc-950/70 backdrop-blur-xl overflow-hidden shadow-2xl">
          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Domain Focus */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                1. Select Primary Domain
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DOMAIN_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFocusArea(opt)}
                    className={`flex items-center justify-start rounded-xl border px-3.5 py-2.5 text-xs text-left transition-all ${
                      focusArea === opt 
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-200 font-medium shadow-[0_0_12px_rgba(99,102,241,0.15)]" 
                        : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Level */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                2. Experience Level
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setExperience(opt)}
                    className={`flex items-center justify-center rounded-xl border p-2.5 text-xs transition-all ${
                      experience === opt 
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-200 font-medium shadow-[0_0_12px_rgba(99,102,241,0.15)]" 
                        : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Assessment Format */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                3. Assessment Interface Format
              </label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {FORMAT_OPTIONS.map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => setFormat(fmt.id)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                      format === fmt.id
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-200 shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                        : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    }`}
                  >
                    <span className="text-xs font-semibold text-zinc-200">{fmt.label}</span>
                    <span className="mt-1 text-[10px] leading-relaxed text-zinc-500">{fmt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-white/10">
              <div className="flex items-center text-xs text-zinc-500">
                <ShieldAlert size={14} className="mr-2 text-indigo-400 shrink-0" />
                Adaptive evaluation, low-latency CAG, and dynamic curveballs enabled.
              </div>
              <Button 
                onClick={handleStart} 
                disabled={generating}
                className="h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white min-w-[160px]"
              >
                {generating ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    Enter Workspace <ArrowRight size={16} className="ml-1.5" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
