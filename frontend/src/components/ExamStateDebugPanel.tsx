import { ExamState } from "../types/index"

interface ExamStateDebugPanelProps {
  examState: ExamState
  visible: boolean
}

export function ExamStateDebugPanel({ examState, visible }: ExamStateDebugPanelProps) {
  if (!visible) return null

  const pill = "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.1em]"

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[300px] rounded-3xl border border-indigo-500/20 bg-zinc-950/95 p-4 text-xs text-zinc-200 shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-indigo-200">
          DEBUG STATE
        </div>
        <div className="text-[10px] text-zinc-500">press ` to hide</div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Bug fixed</span>
          <span className={`${pill} border-emerald-500/20 bg-emerald-500/10 text-emerald-200`}>
            {String(examState.bugFixed)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Approach</span>
          <span className={`${pill} border-white/10 bg-white/[0.04] text-zinc-200`}>
            {examState.approach}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Last code state</span>
          <span className={`${pill} border-white/10 bg-white/[0.04] text-zinc-200`}>
            {examState.lastCodeState}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Curveball seen</span>
          <span className={`${pill} border-amber-500/20 bg-amber-500/10 text-amber-200`}>
            {String(examState.curveballSeen)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Curveball addressed</span>
          <span className={`${pill} border-amber-500/20 bg-amber-500/10 text-amber-200`}>
            {String(examState.curveballAddressed)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Hints given</span>
          <span className={`${pill} border-indigo-500/20 bg-indigo-500/10 text-indigo-200`}>
            {examState.hintsGiven}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-zinc-500">Turns elapsed</span>
          <span className={`${pill} border-indigo-500/20 bg-indigo-500/10 text-indigo-200`}>
            {examState.turnsElapsed}
          </span>
        </div>
      </div>
    </div>
  )
}