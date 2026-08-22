import { ArrowRight, CheckCircle2, Lightbulb } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

interface ResultsCardProps {
  strengths: string[]
  improvements: string[]
}

export function ResultsCard({ strengths, improvements }: ResultsCardProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-emerald-500/15 bg-emerald-500/[0.04]">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
              <CheckCircle2 size={18} />
            </div>
            <CardTitle className="text-xl">Strengths</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {strengths.map((item) => (
            <div
              key={item}
              className="flex gap-3 rounded-2xl border border-emerald-500/15 bg-zinc-950/35 px-4 py-3"
            >
              <span className="mt-0.5 text-emerald-300">✓</span>
              <p className="text-sm leading-6 text-zinc-200">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-amber-500/15 bg-amber-500/[0.04]">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-200">
              <Lightbulb size={18} />
            </div>
            <CardTitle className="text-xl">Areas for growth</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {improvements.map((item) => (
            <div
              key={item}
              className="flex gap-3 rounded-2xl border border-amber-500/15 bg-zinc-950/35 px-4 py-3"
            >
              <ArrowRight size={14} className="mt-1 shrink-0 text-amber-300" />
              <p className="text-sm leading-6 text-zinc-200">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}