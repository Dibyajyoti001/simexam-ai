import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  LayoutPanelLeft,
  Code2,
  PenTool,
  LayoutTemplate,
  FileText,
  X,
  Sparkles,
} from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"
import { ChatPanel } from "../../components/ChatPanel"
import { CodeEditor } from "../../components/CodeEditor"
import { CurveballBanner } from "../../components/CurveballBanner"
import { ExamStateDebugPanel } from "../../components/ExamStateDebugPanel"
import { ExamTimer } from "../../components/ExamTimer"
import { RealTerminal } from "../../components/RealTerminal"
import { RichTextEditor } from "../../components/RichTextEditor"
import { WhiteboardCanvas } from "../../components/WhiteboardCanvas"
import { AgentStatusBar } from "../../components/AgentStatusBar"
import { TenantShell } from "../../components/TenantShell"
import { Button } from "../../components/ui/button"
import {
  CURVEBALL_MESSAGE,
  INITIAL_CODE,
  SESSION_KEYS,
} from "../../lib/constants"
import { classifyIntent } from "../../lib/codeAnalysis"
import { createSession, submitSession } from "../../lib/api"
import { useChat } from "../../hooks/useChat"
import { useExamState } from "../../hooks/useExamState"
import { useExamTimer } from "../../hooks/useExamTimer"
import { useTerminal } from "../../hooks/useTerminal"
import { useTenantConfig } from "../../hooks/useTenantConfig"
import { useAgentStatus } from "../../hooks/useAgentStatus"
import { useAuth } from "../../hooks/useAuth"
import { TenantConfig } from "../../types/index"

export default function WorkspacePage() {
  const navigate = useNavigate()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const { user } = useAuth()
  const resolvedSlug = orgSlug || user?.orgSlug || "demo"
  const tenant = useTenantConfig(resolvedSlug)

  // Merge dynamic on-the-fly config if generated during intake/learn mode
  const dynamicConfig: Partial<TenantConfig> | null = useMemo(() => {
    if (typeof window === "undefined") return null
    const raw = sessionStorage.getItem("simexam_dynamic_config")
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }, [])

  const effectiveConfig: TenantConfig = useMemo(() => {
    const base = tenant.config
    if (!dynamicConfig) return base
    return {
      ...base,
      exam: {
        ...base.exam,
        ...(dynamicConfig.exam || {}),
      },
      agent: {
        ...base.agent,
        ...(dynamicConfig.agent || {}),
      },
      rubric: {
        ...base.rubric,
        ...(dynamicConfig.rubric || {}),
      },
    }
  }, [tenant.config, dynamicConfig])

  const studentName = useMemo(() => {
    if (typeof window === "undefined") return "Student"
    const stored = sessionStorage.getItem(SESSION_KEYS.STUDENT_NAME)
    if (stored) return stored
    if (user?.name) return user.name
    if (user?.email) return user.email.split("@")[0]
    return "Candidate"
  }, [user])

  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return sessionStorage.getItem(SESSION_KEYS.SESSION_ID)
  })

  // Read intent from Hub & Intake
  const hubIntent = typeof window !== "undefined" ? sessionStorage.getItem("simexam_hub_intent") : "exam"
  const intakeFormat = typeof window !== "undefined" ? sessionStorage.getItem("simexam_intake_format") : null
  
  // Current active mode (allows switching on the fly)
  const [activeMode, setActiveMode] = useState<"coding" | "system_design" | "conceptual" | "multiple_choice">(() => {
    if (intakeFormat === "system_design" || intakeFormat === "conceptual" || intakeFormat === "coding") {
      return intakeFormat
    }
    return effectiveConfig.exam?.type || "coding"
  })

  useEffect(() => {
    if (effectiveConfig.exam?.type && !intakeFormat) {
      setActiveMode(effectiveConfig.exam.type)
    }
  }, [effectiveConfig.exam?.type, intakeFormat])

  const [code, setCode] = useState(() => {
    if (typeof window === "undefined") return effectiveConfig.exam.starterCode || INITIAL_CODE
    return sessionStorage.getItem(SESSION_KEYS.CODE) || effectiveConfig.exam.starterCode || INITIAL_CODE
  })

  useEffect(() => {
    if (effectiveConfig.exam?.starterCode && !sessionStorage.getItem(SESSION_KEYS.CODE)) {
      setCode(effectiveConfig.exam.starterCode)
    }
  }, [effectiveConfig.exam?.starterCode])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!resolvedSlug || sessionId) return

    void createSession({
      orgSlug: resolvedSlug,
      studentName,
      email: user?.email,
      inviteToken: sessionStorage.getItem("simexam_hub_query") || undefined,
    })
      .then((session) => {
        sessionStorage.setItem(SESSION_KEYS.SESSION_ID, session.id)
        setSessionId(session.id)
      })
      .catch((err) => {
        console.warn("[Workspace] Could not create session:", err?.message || err)
      })
  }, [resolvedSlug, sessionId, studentName, user?.email])

  const [draft, setDraft] = useState("")
  const [debugVisible, setDebugVisible] = useState(false)
  const [showSpecsModal, setShowSpecsModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const chat = useChat(studentName, {
    orgSlug: resolvedSlug,
    tenant: effectiveConfig,
    assessmentType: activeMode,
    sessionId: sessionId ?? undefined,
  })
  const terminal = useTerminal()
  const examState = useExamState()
  const agentStatus = useAgentStatus()

  const { secondsLeft } = useExamTimer({
    durationSeconds: effectiveConfig.exam.timeLimitSeconds || 600,
    curveballAtSeconds: effectiveConfig.exam.curveballAtSeconds || 180,
    onCurveball: () => {
      chat.injectCurveball()
      examState.markCurveballSeen()
    },
    onExpire: () => {
      void submitAssessment(true)
    },
  })

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEYS.CODE, code)
  }, [code])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return
      if (event.key === "`") setDebugVisible((prev) => !prev)
      if (event.ctrlKey && event.key === "Enter" && activeMode === "coding") {
        event.preventDefault()
        runCurrentCode()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeMode, code])

  function runCurrentCode() {
    agentStatus.setStatus("running")
    terminal.executeCode(code, effectiveConfig.exam?.allowedLanguages?.[0] || "javascript", sessionId || undefined)
      .finally(() => agentStatus.setStatus("idle"))
    chat.recordCodeSnapshot(code)
    examState.updateFromCode(code, chat.curveballFired)
    examState.registerInteraction(classifyIntent(code))
  }

  async function handleSend() {
    const trimmed = draft.trim()
    if (!trimmed || chat.isTyping) return

    const intent = classifyIntent(trimmed)
    examState.registerInteraction(intent)
    chat.recordCodeSnapshot(code)
    
    agentStatus.setStatus("thinking")
    await chat.sendMessage(trimmed, examState.examState, code)
    agentStatus.setStatus("idle")
    
    examState.updateFromCode(code, chat.curveballFired)
    setDraft("")
  }

  async function submitAssessment(_auto = false) {
    if (submitting) return
    setSubmitting(true)

    const payload = {
      conversationHistory: chat.buildTranscript(),
      codeSnapshots: chat.codeSnapshots.length > 0 ? chat.codeSnapshots : [code],
      timeElapsedSeconds: Math.max(0, (effectiveConfig.exam.timeLimitSeconds || 600) - secondsLeft),
      curveballFired: chat.curveballFired,
      curveballAddressed: examState.examState.curveballAddressed,
      studentName,
      orgSlug: resolvedSlug,
      assessmentType: activeMode,
      sessionId: sessionId || undefined,
      finalCode: code,
    }

    if (sessionId) {
      void submitSession({
        sessionId,
        finalCode: code,
        timeElapsedSeconds: payload.timeElapsedSeconds,
        curveballFired: chat.curveballFired,
      }).catch((err) => {
        console.warn("[Workspace] Session submit failed:", err?.message || err)
      })
    }

    sessionStorage.setItem(SESSION_KEYS.EVALUATION_PAYLOAD, JSON.stringify(payload))
    sessionStorage.setItem(SESSION_KEYS.EVALUATION_PENDING, "true")
    sessionStorage.removeItem(SESSION_KEYS.RESULTS)

    navigate("/results")
  }

  const editorFilename = useMemo(() => {
    if (effectiveConfig.exam?.title) {
      return `${effectiveConfig.exam.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.js`
    }
    return "solution.js"
  }, [effectiveConfig.exam?.title])

  return (
    <TenantShell orgSlug={resolvedSlug}>
      <main className="flex h-screen flex-col overflow-hidden bg-surface text-zinc-100 font-sans">
        
        {/* Minimalist Top Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 bg-surface-raised/50 px-4">
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <button onClick={() => navigate("/dashboard")} className="hover:text-zinc-100 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <div className="h-4 w-px bg-white/10" />
            <span className="flex items-center gap-1.5 text-xs text-indigo-300 font-medium bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
              <Sparkles size={12} />
              {hubIntent === "exam" ? "Assessment" : "Interactive Study"}
            </span>
            <ChevronRight size={14} className="text-zinc-600" />
            <span className="font-medium text-zinc-200 truncate max-w-[240px]">
              {effectiveConfig.exam.title || "Technical Assessment"}
            </span>

            {/* Mode Switcher */}
            <div className="ml-2 flex items-center rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
              <button
                onClick={() => setActiveMode("coding")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeMode === "coding" ? "bg-indigo-600 text-white font-medium shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Code2 size={12} /> Coding
              </button>
              <button
                onClick={() => setActiveMode("system_design")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeMode === "system_design" ? "bg-indigo-600 text-white font-medium shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <LayoutPanelLeft size={12} /> Whiteboard
              </button>
              <button
                onClick={() => setActiveMode("conceptual")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeMode === "conceptual" ? "bg-indigo-600 text-white font-medium shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <PenTool size={12} /> Essay
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setShowSpecsModal(true)}
              className="h-8 px-3 text-xs border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
            >
              <FileText size={13} className="mr-1.5 text-zinc-400" />
              Specs & Constraints
            </Button>
            <div className="h-4 w-px bg-white/10" />
            <AgentStatusBar status={agentStatus.status} />
            <div className="h-4 w-px bg-white/10" />
            <ExamTimer secondsLeft={secondsLeft} studentName={studentName} curveballFired={chat.curveballFired} />
            <Button 
              onClick={() => submitAssessment(false)} 
              disabled={submitting}
              className="ml-1 h-8 px-4 text-xs font-semibold rounded-lg bg-white text-zinc-900 hover:bg-zinc-200"
            >
              <CheckCircle2 size={14} className="mr-1.5" />
              Submit
            </Button>
          </div>
        </header>

        {chat.curveballFired && <CurveballBanner message={effectiveConfig.exam.curveballMessage || CURVEBALL_MESSAGE} />}

        {/* Fluid Workspace Grid */}
        <div className="flex flex-1 overflow-hidden p-3 gap-3 bg-surface">
          
          {/* Main Content Area */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/5 bg-surface-raised shadow-sm">
             {activeMode === "coding" && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 overflow-hidden">
                    <CodeEditor
                      code={code}
                      onChange={setCode}
                      onRun={runCurrentCode}
                      onSubmit={() => submitAssessment(false)}
                      filename={editorFilename}
                      language={effectiveConfig.exam?.allowedLanguages?.[0] || "javascript"}
                      languages={effectiveConfig.exam?.allowedLanguages || ["javascript"]}
                    />
                  </div>
                  <div className="h-1/3 min-h-[200px] border-t border-white/5">
                    <RealTerminal outputs={terminal.outputs} onClear={terminal.clearTerminal} />
                  </div>
                </div>
             )}
             
             {activeMode === "conceptual" && (
                <div className="flex-1 overflow-hidden">
                   <RichTextEditor
                     value={code}
                     onChange={setCode}
                     sessionId={sessionId}
                     orgSlug={resolvedSlug}
                   />
                </div>
             )}

             {activeMode === "system_design" && (
                <div className="flex-1 overflow-hidden">
                   <WhiteboardCanvas
                     value={code}
                     onChange={setCode}
                     sessionId={sessionId}
                     orgSlug={resolvedSlug}
                   />
                </div>
             )}
          </div>

          {/* AI Mentor Panel */}
          <div className="w-[420px] shrink-0 overflow-hidden rounded-xl border border-white/5 bg-surface-raised shadow-sm flex flex-col">
             <ChatPanel
                studentName={studentName}
                messages={chat.messages}
                draft={draft}
                onDraftChange={setDraft}
                onSend={handleSend}
                isTyping={chat.isTyping}
             />
          </div>

        </div>

        {/* Problem Statement & Specs Drawer */}
        {showSpecsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
            <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl space-y-4 animate-fade-up">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-100">{effectiveConfig.exam.title}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{effectiveConfig.exam.description}</p>
                </div>
                <button onClick={() => setShowSpecsModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
                <div>
                  <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wide mb-1.5">
                    Problem Statement & Requirements
                  </h4>
                  <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 text-xs font-mono whitespace-pre-wrap">
                    {effectiveConfig.exam.problemStatement}
                  </div>
                </div>

                {effectiveConfig.exam.testCases && effectiveConfig.exam.testCases.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">
                      Sample Test Cases
                    </h4>
                    <div className="space-y-2">
                      {effectiveConfig.exam.testCases.filter(tc => !tc.hidden).map((tc, idx) => (
                        <div key={idx} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs font-mono">
                          <span className="text-zinc-500">Input: </span>
                          <span className="text-zinc-200">{typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input)}</span>
                          <span className="mx-2 text-zinc-600">→</span>
                          <span className="text-zinc-500">Expected: </span>
                          <span className="text-emerald-400">{typeof tc.expectedOutput === "string" ? tc.expectedOutput : JSON.stringify(tc.expectedOutput)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end">
                <Button onClick={() => setShowSpecsModal(false)} className="h-9 px-4 text-xs">
                  Back to Assessment
                </Button>
              </div>
            </div>
          </div>
        )}

        <ExamStateDebugPanel examState={examState.examState} visible={debugVisible} />
      </main>
    </TenantShell>
  )
}
