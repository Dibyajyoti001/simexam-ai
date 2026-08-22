import { Clock3, TimerReset } from "lucide-react"
import { formatTime } from "../lib/utils"
import { Badge } from "./ui/badge"

interface ExamTimerProps {
  secondsLeft: number
  studentName: string
  curveballFired?: boolean
}

export function ExamTimer({ secondsLeft, studentName, curveballFired = false }: ExamTimerProps) {
  const danger = secondsLeft <= 30
  const warning = secondsLeft <= 120

  return (
    <div className="glass-panel flex items-center justify-between gap-4 rounded-3xl px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-indigo-200">
          <Clock3 size={18} />
        </div>
        <div>
          <div className="text-xs font-medium tracking-[0.18em] text-zinc-500">
            LIVE ASSESSMENT
          </div>
          <div className="mt-1 text-sm font-semibold text-zinc-100">
            {studentName}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {curveballFired ? (
          <Badge variant="warning" className="hidden sm:inline-flex">
            <TimerReset size={12} className="mr-1" />
            CONSTRAINT ACTIVE
          </Badge>
        ) : null}

        <div
          className={[
            "rounded-2xl border px-4 py-2 text-center shadow-[0_18px_45px_rgba(0,0,0,0.22)]",
            danger
              ? "border-red-500/30 bg-red-500/12 text-red-100"
              : warning
                ? "border-amber-500/30 bg-amber-500/12 text-amber-100"
                : "border-white/10 bg-white/[0.03] text-zinc-50",
          ].join(" ")}
        >
          <div className="text-[10px] font-semibold tracking-[0.22em] text-zinc-400">
            TIME LEFT
          </div>
          <div className="mt-0.5 font-mono text-2xl font-semibold tracking-[-0.04em]">
            {formatTime(secondsLeft)}
          </div>
        </div>
      </div>
    </div>
  )
}