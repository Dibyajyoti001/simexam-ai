import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  X,
  Sparkles,
  Wand2,
  Code2,
  LayoutPanelLeft,
  PenTool,
  Loader2,
} from "lucide-react"
import { fetchTenantConfig, saveTenantConfig, generateAIExam } from "../../lib/api"
import { TenantShell } from "../../components/TenantShell"
import { FileUploadPanel } from "../../components/FileUploadPanel"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import type { RubricDimension, TenantConfig, TestCase } from "../../types/index"
import { fallbackTenantConfig } from "../../hooks/useTenantConfig"

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-zinc-400">
      {children}
    </label>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  id,
  mono,
}: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  id?: string
  mono?: boolean
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        "w-full rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition-all duration-200 focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/10",
        mono ? "font-mono" : "",
      ].join(" ")}
    />
  )
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  mono,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  mono?: boolean
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={[
        "w-full resize-y rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition-all duration-200 focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/10",
        mono ? "font-mono text-xs" : "",
      ].join(" ")}
    />
  )
}

const DOMAIN_PRESETS = [
  "Backend & APIs",
  "Frontend & UI Architecture",
  "System Design & Scalability",
  "Cloud & DevOps Infrastructure",
  "Machine Learning & Data Engineering",
  "Cybersecurity & Threat Modeling",
  "Product Management & System Specs",
]

const LANGUAGE_OPTIONS = ["javascript", "typescript", "python", "java", "go", "cpp"] as const

export default function AdminConfigPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const navigate = useNavigate()

  const [config, setConfig] = useState<TenantConfig>(() => fallbackTenantConfig(orgSlug))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // AI Generator Modal state
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiDomain, setAiDomain] = useState("Backend & APIs")
  const [aiSeniority, setAiSeniority] = useState("Senior")
  const [aiType, setAiType] = useState<"coding" | "system_design" | "conceptual">("coding")
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!orgSlug) return
    fetchTenantConfig(orgSlug)
      .then(setConfig)
      .catch(() => setConfig(fallbackTenantConfig(orgSlug)))
      .finally(() => setLoading(false))
  }, [orgSlug])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  const update = useCallback(
    <K extends keyof TenantConfig>(section: K, partial: Partial<TenantConfig[K]>) => {
      setConfig((prev) => {
        const currentSection = prev[section]
        if (typeof currentSection === "object" && currentSection !== null) {
          return {
            ...prev,
            [section]: { ...currentSection, ...partial },
          }
        }
        return {
          ...prev,
          [section]: partial as any,
        }
      })
    },
    []
  )

  const handleSave = useCallback(async () => {
    if (!orgSlug || saving) return
    setSaving(true)
    try {
      await saveTenantConfig(orgSlug, config)
      setToast({ type: "success", text: "Configuration saved and published!" })
    } catch {
      setToast({ type: "error", text: "Failed to save config" })
    } finally {
      setSaving(false)
    }
  }, [orgSlug, config, saving])

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!aiPrompt.trim() || !orgSlug) return
    setGenerating(true)
    try {
      const result = await generateAIExam(orgSlug, {
        prompt: aiPrompt,
        domain: aiDomain,
        seniority: aiSeniority,
        assessmentType: aiType,
        allowedLanguages: config.exam.allowedLanguages,
      })

      if (result.exam) {
        setConfig((prev) => ({
          ...prev,
          exam: {
            ...prev.exam,
            ...result.exam,
            type: aiType,
          },
          agent: {
            ...prev.agent,
            ...(result.agent || {}),
          },
          rubric: {
            ...prev.rubric,
            ...(result.rubric || {}),
          },
        }))
        setShowAiModal(false)
        setToast({ type: "success", text: "✨ AI Assessment generated and populated!" })
      }
    } catch (err: any) {
      setToast({ type: "error", text: err.message || "AI generation failed" })
    } finally {
      setGenerating(false)
    }
  }

  // Rubric helpers
  const addDimension = () => {
    setConfig((prev) => ({
      ...prev,
      rubric: {
        ...prev.rubric,
        dimensions: [
          ...prev.rubric.dimensions,
          { name: "", weight: 0.2, description: "" },
        ],
      },
    }))
  }

  const removeDimension = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      rubric: {
        ...prev.rubric,
        dimensions: prev.rubric.dimensions.filter((_, i) => i !== index),
      },
    }))
  }

  const updateDimension = (index: number, partial: Partial<RubricDimension>) => {
    setConfig((prev) => ({
      ...prev,
      rubric: {
        ...prev.rubric,
        dimensions: prev.rubric.dimensions.map((d, i) =>
          i === index ? { ...d, ...partial } : d
        ),
      },
    }))
  }

  // Test case helpers
  const addTestCase = () => {
    setConfig((prev) => ({
      ...prev,
      exam: {
        ...prev.exam,
        testCases: [
          ...prev.exam.testCases,
          { input: "", expectedOutput: "", hidden: false },
        ],
      },
    }))
  }

  const removeTestCase = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      exam: {
        ...prev.exam,
        testCases: prev.exam.testCases.filter((_, i) => i !== index),
      },
    }))
  }

  const updateTestCase = (index: number, partial: Partial<TestCase>) => {
    setConfig((prev) => ({
      ...prev,
      exam: {
        ...prev.exam,
        testCases: prev.exam.testCases.map((tc, i) =>
          i === index ? { ...tc, ...partial } : tc
        ),
      },
    }))
  }

  if (loading) {
    return (
      <TenantShell orgSlug={orgSlug ?? "demo"}>
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
        </div>
      </TenantShell>
    )
  }

  return (
    <TenantShell orgSlug={orgSlug ?? "demo"}>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 font-sans">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(`/${orgSlug}/admin`)}>
              <ArrowLeft size={15} />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
                Exam Configuration
              </h1>
              <p className="mt-0.5 text-xs text-zinc-500">{config.branding.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowAiModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]"
            >
              <Sparkles size={15} />
              AI Exam Generator
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save size={15} />
              {saving ? "Saving…" : "Save Config"}
            </Button>
          </div>
        </div>

        {/* AI Generator Banner */}
        <div className="mt-6 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-zinc-950/40 p-5 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm">
                <Wand2 size={16} />
                <span>Domain-Agnostic AI Assessment Engine</span>
              </div>
              <p className="text-xs text-zinc-400 max-w-2xl">
                Automatically generate full technical challenges, Socratic interviewer personas, dynamic mid-exam curveballs, and 4D evaluation rubrics from a prompt or uploaded documents.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowAiModal(true)}
              className="border-indigo-400/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 text-xs shrink-0"
            >
              <Sparkles size={14} className="mr-1.5" />
              Generate with AI
            </Button>
          </div>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div
            className={[
              "mt-4 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 animate-fade-up",
              toast.type === "success"
                ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200"
                : "border-red-500/20 bg-red-500/[0.06] text-red-200",
            ].join(" ")}
          >
            <span>{toast.text}</span>
            <button onClick={() => setToast(null)} className="ml-auto text-zinc-500 hover:text-zinc-300">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="mt-6 space-y-5">
          {/* Section 1: Assessment Type & Details */}
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Assessment Format & Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Assessment Type Selector */}
              <div>
                <Label>Assessment Type</Label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => update("exam", { type: "coding" })}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                      config.exam.type === "coding" || !config.exam.type
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-300 shadow-sm"
                        : "border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Code2 size={15} />
                    Live Coding Simulation
                  </button>
                  <button
                    type="button"
                    onClick={() => update("exam", { type: "system_design" })}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                      config.exam.type === "system_design"
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-300 shadow-sm"
                        : "border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <LayoutPanelLeft size={15} />
                    System Design Whiteboard
                  </button>
                  <button
                    type="button"
                    onClick={() => update("exam", { type: "conceptual" })}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                      config.exam.type === "conceptual"
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-300 shadow-sm"
                        : "border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <PenTool size={15} />
                    Conceptual / Essay
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="title">Assessment Title</Label>
                <Input
                  id="title"
                  value={config.exam.title}
                  onChange={(v) => update("exam", { title: v })}
                  placeholder="e.g. Distributed Cache & High-Throughput Pipeline"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={config.exam.description ?? ""}
                  onChange={(v) => update("exam", { description: v })}
                  placeholder="Brief description for candidates"
                />
              </div>
              <div>
                <Label>Problem Statement & Specifications</Label>
                <Textarea
                  value={config.exam.problemStatement}
                  onChange={(v) => update("exam", { problemStatement: v })}
                  placeholder="The detailed problem statement shown to candidates..."
                  mono
                  rows={5}
                />
              </div>
              <div>
                <Label>Starter Code / Template</Label>
                <Textarea
                  value={config.exam.starterCode}
                  onChange={(v) => update("exam", { starterCode: v })}
                  placeholder="// Starter boilerplate..."
                  mono
                  rows={8}
                />
              </div>
              <div>
                <Label htmlFor="timeLimit">Time Limit (seconds)</Label>
                <Input
                  id="timeLimit"
                  type="number"
                  value={config.exam.timeLimitSeconds}
                  onChange={(v) => update("exam", { timeLimitSeconds: parseInt(v) || 600 })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Dynamic Curveball Constraint */}
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Dynamic Mid-Exam Curveball</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="curveballAt">Trigger Timing (seconds after start)</Label>
                <Input
                  id="curveballAt"
                  type="number"
                  value={config.exam.curveballAtSeconds}
                  onChange={(v) => update("exam", { curveballAtSeconds: parseInt(v) || 120 })}
                />
              </div>
              <div>
                <Label>Constraint Change Message</Label>
                <Textarea
                  value={config.exam.curveballMessage ?? ""}
                  onChange={(v) => update("exam", { curveballMessage: v })}
                  placeholder="e.g. Product requirement update: memory is now limited to 128MB, must be O(N log N)..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Allowed Languages */}
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Allowed Languages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <label
                    key={lang}
                    className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={config.exam.allowedLanguages.includes(lang)}
                      onChange={(e) => {
                        const current = config.exam.allowedLanguages
                        const next = e.target.checked
                          ? [...current, lang]
                          : current.filter((l) => l !== lang)
                        update("exam", { allowedLanguages: next })
                      }}
                      className="h-4 w-4 rounded border-white/20 bg-zinc-900 text-indigo-500 accent-indigo-500"
                    />
                    <span className="capitalize">{lang}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Socratic AI Interviewer Persona */}
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Socratic AI Interviewer Persona</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="personaName">Interviewer Name</Label>
                  <Input
                    id="personaName"
                    value={config.agent.personaName}
                    onChange={(v) => update("agent", { personaName: v })}
                    placeholder="Alex Chen"
                  />
                </div>
                <div>
                  <Label htmlFor="personaRole">Interviewer Role</Label>
                  <Input
                    id="personaRole"
                    value={config.agent.personaRole}
                    onChange={(v) => update("agent", { personaRole: v })}
                    placeholder="Principal Systems Architect"
                  />
                </div>
              </div>
              <div>
                <Label>System Prompt Instructions & Focus Areas</Label>
                <Textarea
                  value={config.agent.systemPromptAdditions ?? ""}
                  onChange={(v) => update("agent", { systemPromptAdditions: v })}
                  placeholder="Specialized instructions for the Socratic AI interviewer..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 5: Evaluation Rubric */}
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Evaluation Rubric Dimensions</CardTitle>
                <Button variant="ghost" onClick={addDimension}>
                  <Plus size={14} />
                  Add Dimension
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.rubric.dimensions.map((dim, i) => (
                <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>Dimension Name</Label>
                          <Input
                            value={dim.name}
                            onChange={(v) => updateDimension(i, { name: v })}
                            placeholder="e.g. Technical Accuracy"
                          />
                        </div>
                        <div>
                          <Label>Weight (0–1)</Label>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={dim.weight}
                              onChange={(e) =>
                                updateDimension(i, {
                                  weight: parseFloat(e.target.value),
                                })
                              }
                              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-indigo-500"
                            />
                            <span className="font-mono text-xs text-zinc-400 w-8 text-right">
                              {dim.weight.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label>Evaluation Criteria</Label>
                        <Input
                          value={dim.description}
                          onChange={(v) => updateDimension(i, { description: v })}
                          placeholder="What this dimension evaluates"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => removeDimension(i)}
                      className="mt-5 text-zinc-600 transition-colors hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Section 6: Test Cases */}
          <Card className="border-white/10 bg-white/[0.035]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Test Cases</CardTitle>
                <Button variant="ghost" onClick={addTestCase}>
                  <Plus size={14} />
                  Add Test Case
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.exam.testCases.map((tc, i) => (
                <div key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>Input</Label>
                          <Input
                            value={typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input)}
                            onChange={(v) => {
                              try { updateTestCase(i, { input: JSON.parse(v) }) }
                              catch { updateTestCase(i, { input: v }) }
                            }}
                            placeholder="Input value or JSON"
                            mono
                          />
                        </div>
                        <div>
                          <Label>Expected Output</Label>
                          <Input
                            value={
                              typeof tc.expectedOutput === "string"
                                ? tc.expectedOutput
                                : JSON.stringify(tc.expectedOutput)
                            }
                            onChange={(v) => {
                              try { updateTestCase(i, { expectedOutput: JSON.parse(v) }) }
                              catch { updateTestCase(i, { expectedOutput: v }) }
                            }}
                            placeholder="Expected output or JSON"
                            mono
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tc.hidden ?? false}
                          onChange={(e) => updateTestCase(i, { hidden: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-white/20 bg-zinc-900 accent-indigo-500"
                        />
                        Hidden Test (used for grading only)
                      </label>
                    </div>
                    <button
                      onClick={() => removeTestCase(i)}
                      className="mt-5 text-zinc-600 transition-colors hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Section 7: Knowledge Base Files */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-300">Knowledge Base Files (RAG Context)</h3>
            <FileUploadPanel
              orgId={config.orgId || orgSlug || "demo"}
              onUploadComplete={() => {
                setToast({ type: "success", text: "Knowledge base document processed and indexed for RAG" })
              }}
            />
          </div>
        </div>

        {/* Bottom save */}
        <div className="mt-8 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="px-6 h-11">
            <Save size={15} />
            {saving ? "Saving…" : "Save Configuration"}
          </Button>
        </div>

        {/* ─── AI Exam Generator Modal ─── */}
        {showAiModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4">
            <div className="w-full max-w-lg rounded-2xl border border-indigo-500/30 bg-zinc-950 p-6 shadow-2xl space-y-5 animate-fade-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-lg">
                  <Sparkles size={20} />
                  <span>Generate Assessment with AI</span>
                </div>
                <button onClick={() => setShowAiModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleGenerateAI} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Target Domain</label>
                  <select
                    value={aiDomain}
                    onChange={(e) => setAiDomain(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-400"
                  >
                    {DOMAIN_PRESETS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Seniority Level</label>
                    <select
                      value={aiSeniority}
                      onChange={(e) => setAiSeniority(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-400"
                    >
                      <option value="Junior">Junior Engineer</option>
                      <option value="Mid-Level">Mid-Level Engineer</option>
                      <option value="Senior">Senior Engineer</option>
                      <option value="Staff / Lead">Staff / Principal Architect</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Format</label>
                    <select
                      value={aiType}
                      onChange={(e) => setAiType(e.target.value as any)}
                      className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-400"
                    >
                      <option value="coding">Live Coding Assessment</option>
                      <option value="system_design">System Design Whiteboard</option>
                      <option value="conceptual">Conceptual / Essay</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Describe the Challenge / Topic / Scenario *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Build a high-throughput rate-limiting middleware in Redis and Node.js. Inject a mid-exam curveball where Redis goes down and memory fallback is required."
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm text-zinc-100 outline-none focus:border-indigo-400 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setShowAiModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={generating || !aiPrompt.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[160px]"
                  >
                    {generating ? (
                      <>
                        <Loader2 size={15} className="mr-2 animate-spin" />
                        Designing Exam...
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} className="mr-1.5" />
                        Generate Suite
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </TenantShell>
  )
}
