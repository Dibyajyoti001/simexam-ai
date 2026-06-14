"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, CheckCircle2, ChevronRight, LayoutPanelLeft, Code2, PenTool, LayoutTemplate } from "lucide-react"
import { useParams } from "react-router-dom"
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
import { navigateTo } from "../../lib/navigation"
import { classifyIntent } from "../../lib/codeAnalysis"
import { createSession, submitSession } from "../../lib/api"
import { useChat } from "../../hooks/useChat"
import { useExamState } from "../../hooks/useExamState"
import { useExamTimer } from "../../hooks/useExamTimer"
import { useTerminal } from "../../hooks/useTerminal"
import { useTenantConfig } from "../../hooks/useTenantConfig"
import { useAgentStatus } from "../../hooks/useAgentStatus"
import { getUser } from "../../lib/auth"

export default function WorkspacePage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const user = getUser()
  const tenant = useTenantConfig(orgSlug || user?.orgSlug || "demo")

  const [studentName] = useState(() => {
    if (typeof window === "undefined") return "Student"
    return sessionStorage.getItem(SESSION_KEYS.STUDENT_NAME) || user?.email?.split("@")[0] || "Student"
  })

  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return sessionStorage.getItem(SESSION_KEYS.SESSION_ID)
  })

  // Read intent from Hub & Intake
  const hubIntent = typeof window !== "undefined" ? sessionStorage.getItem("simexam_hub_intent") : "exam"
  const intakeFocus = typeof window !== "undefined" ? sessionStorage.getItem("simexam_intake_focus") : ""
  
  // Determine mode dynamically
  const activeMode = useMemo(() => {
    if (intakeFocus === "System Architecture") return "system_design"
    if (intakeFocus === "Backend & APIs" || intakeFocus === "Frontend & UI") return "coding"
    if (intakeFocus === "Product Management" || intakeFocus === "Theoretical") return "conceptual"
    return "coding"
  }, [hubIntent, intakeFocus, tenant.config])

  const [code, setCode] = useState(() => {
    if (typeof window === "undefined") return tenant.config?.exam.starterCode || INITIAL_CODE
    return sessionStorage.getItem(SESSION_KEYS.CODE) || tenant.config?.exam.starterCode || INITIAL_CODE
  })

  useEffect(() => {
    if (tenant.config && !sessionStorage.getItem(SESSION_KEYS.CODE)) {
      setCode(tenant.config.exam.starterCode)
    }
  }, [tenant.config])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!orgSlug || sessionId) return

    void createSession({ orgSlug, studentName, email: user?.email })
      .then((session) => {
        sessionStorage.setItem(SESSION_KEYS.SESSION_ID, session.id)
        setSessionId(session.id)
      })
      .catch((err) => {
        console.warn("[Workspace] Could not create session:", err?.message || err)
      })
  }, [orgSlug, sessionId, studentName, user?.email])

  const [draft, setDraft] = useState("")
  const [debugVisible, setDebugVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const chat = useChat(studentName, { orgSlug, assessmentType: activeMode, sessionId: sessionId ?? undefined })
  const terminal = useTerminal()
  const examState = useExamState()
  const agentStatus = useAgentStatus()

  const { secondsLeft, curveballFired } = useExamTimer({
    durationSeconds: tenant.config?.exam.timeLimitSeconds || 3600,
    curveballAtSeconds: tenant.config?.exam.curveballAtSeconds || 1800,
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
      if (event.shiftKey && event.key.toLowerCase() === "d" && !curveballFired) {
        chat.injectCurveball()
        examState.markCurveballSeen()
      }
      if (event.ctrlKey && event.key === "Enter" && activeMode === "coding") {
        event.preventDefault()
        runCurrentCode()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [curveballFired, chat, code, activeMode])

  function runCurrentCode() {
    agentStatus.setStatus("running")
    terminal.executeCode(code, sessionId || undefined).finally(() => agentStatus.setStatus("idle"))
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

  async function submitAssessment(auto = false) {
    if (submitting) return
    setSubmitting(true)

    const payload = {
      conversationHistory: chat.buildTranscript(),
      codeSnapshots: chat.codeSnapshots.length > 0 ? chat.codeSnapshots : [code],
      timeElapsedSeconds: Math.max(0, (tenant.config?.exam.timeLimitSeconds || 3600) - secondsLeft),
      curveballFired: chat.curveballFired,
      curveballAddressed: examState.examState.curveballAddressed,
      studentName,
      orgSlug,
      assessmentType: activeMode,
      sessionId: sessionId || undefined,
      finalCode: code,
    }

    if (sessionId) {
      void submitSession({ sessionId, finalCode: code, timeElapsedSeconds: payload.timeElapsedSeconds, curveballFired: chat.curveballFired })
        .catch((err) => {
          console.warn("[Workspace] Session submit failed:", err?.message || err)
        })
    }

    sessionStorage.setItem(SESSION_KEYS.EVALUATION_PAYLOAD, JSON.stringify(payload))
    sessionStorage.setItem(SESSION_KEYS.EVALUATION_PENDING, "true")
    sessionStorage.removeItem(SESSION_KEYS.RESULTS)

    navigateTo("/results")
  }

  return (
    <TenantShell orgSlug={orgSlug || "demo"}>
      <main className="flex h-screen flex-col overflow-hidden bg-surface text-zinc-100 font-sans">
        
        {/* Minimalist Top Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 bg-surface-raised/50 px-4">
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <button onClick={() => navigateTo("/dashboard")} className="hover:text-zinc-100 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <div className="h-4 w-px bg-white/10" />
            <span className="flex items-center gap-2">
              <LayoutTemplate size={14} className="text-accent" />
              {hubIntent === "exam" ? "Assessment" : "Learning Session"}
            </span>
            <ChevronRight size={14} className="text-zinc-600" />
            <span className="font-medium text-zinc-200 truncate max-w-[200px]">
              {tenant.config?.exam.title || "Module"}
            </span>
            <ChevronRight size={14} className="text-zinc-600" />
            <span className="text-zinc-500 capitalize flex items-center gap-1.5">
               {activeMode === "coding" ? <Code2 size={12}/> : activeMode === "system_design" ? <LayoutPanelLeft size={12}/> : <PenTool size={12}/>}
               {activeMode.replace("_", " ")}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <AgentStatusBar status={agentStatus.status} />
            <div className="h-4 w-px bg-white/10" />
            <ExamTimer secondsLeft={secondsLeft} studentName={studentName} curveballFired={chat.curveballFired} />
            <Button 
              onClick={() => submitAssessment(false)} 
              disabled={submitting}
              className="ml-2 h-8 px-4 text-xs font-semibold rounded-lg bg-white text-zinc-900 hover:bg-zinc-200"
            >
              <CheckCircle2 size={14} className="mr-1.5" />
              Submit
            </Button>
          </div>
        </header>

        {chat.curveballFired && <CurveballBanner message={tenant.config?.exam.curveballMessage || CURVEBALL_MESSAGE} />}

        {/* Fluid Workspace Grid */}
        <div className="flex flex-1 overflow-hidden p-3 gap-3 bg-surface">
          
          {/* Main Content Area */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/5 bg-surface-raised shadow-sm">
             {activeMode === "coding" && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 overflow-hidden">
                    <CodeEditor code={code} onChange={setCode} onRun={runCurrentCode} onSubmit={() => submitAssessment(false)} />
                  </div>
                  <div className="h-1/3 min-h-[200px] border-t border-white/5">
                    <RealTerminal outputs={terminal.outputs} onClear={terminal.clearTerminal} />
                  </div>
                </div>
             )}
             
             {activeMode === "conceptual" && (
                <div className="flex-1 overflow-hidden">
                   <RichTextEditor value={code} onChange={setCode} />
                </div>
             )}

             {activeMode === "system_design" && (
                <div className="flex-1 overflow-hidden">
                   <WhiteboardCanvas value={code} onChange={setCode} />
                </div>
             )}
          </div>

          {/* AI Mentor Panel */}
          <div className="w-[400px] shrink-0 overflow-hidden rounded-xl border border-white/5 bg-surface-raised shadow-sm flex flex-col">
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

        <ExamStateDebugPanel examState={examState.examState} visible={debugVisible} />
      </main>
    </TenantShell>
  )
}
