import { AlertTriangle } from "lucide-react"

interface CurveballBannerProps {
  message: string
}

export function CurveballBanner({ message }: CurveballBannerProps) {
  return (
    <div className="animate-[curveballPulse_0.35s_ease-out] rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.2)]">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-amber-200">
        <AlertTriangle size={13} />
        CONSTRAINT UPDATE
      </div>
      <p className="text-sm leading-6 text-zinc-200">{message}</p>
    </div>
  )
}