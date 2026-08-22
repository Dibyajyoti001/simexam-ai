import { Trash2, TerminalSquare } from "lucide-react"
import { useEffect, useRef } from "react"
import { TerminalOutput } from "../types/index"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

interface RealTerminalProps {
  outputs: TerminalOutput[]
  onClear: () => void
}

function statusStyle(status: TerminalOutput["status"]) {
  switch (status) {
    case "success":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
    case "warning":
      return "border-amber-500/20 bg-amber-500/10 text-amber-200"
    case "error":
      return "border-red-500/20 bg-red-500/10 text-red-200"
    default:
      return "border-white/8 bg-white/[0.03] text-zinc-300"
  }
}

export function RealTerminal({ outputs, onClear }: RealTerminalProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    ref.current?.scrollTo({
      top: ref.current.scrollHeight,
      behavior: "smooth",
    })
  }, [outputs])

  return (
    <Card className="overflow-hidden border-white/10 bg-white/[0.035]">
      <CardHeader className="border-b border-white/8 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl sm:text-2xl">Terminal output</CardTitle>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Feedback from the backend execution service.
            </p>
          </div>

          <Button variant="ghost" onClick={onClear}>
            <Trash2 size={15} />
            Clear
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        <div
          ref={ref}
          className="min-h-[230px] max-h-[320px] overflow-y-auto rounded-3xl border border-white/8 bg-zinc-950/85 p-4 font-mono text-sm text-zinc-100"
        >
          {outputs.map((output, index) => (
            <div key={`${output.timestamp}-${index}`} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-500">
                <TerminalSquare size={12} />
                <span>{output.timestamp}</span>
                <span className={`rounded-full border px-2 py-0.5 ${statusStyle(output.status)}`}>
                  {output.status.toUpperCase()}
                </span>
              </div>

              <div className="space-y-1 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                {output.lines.map((line, lineIndex) => (
                  <div key={lineIndex} className="whitespace-pre-wrap leading-6 text-zinc-100">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
