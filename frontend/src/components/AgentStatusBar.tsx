import { Activity, BookOpen, Brain, TerminalSquare } from "lucide-react"

interface AgentStatusBarProps {
  status: "idle" | "thinking" | "running" | "docs" | "hint"
}

const labels = {
  idle: { text: "Ready", icon: Activity },
  thinking: { text: "Thinking", icon: Brain },
  running: { text: "Running code", icon: TerminalSquare },
  docs: { text: "Reading docs", icon: BookOpen },
  hint: { text: "Hint mode", icon: Brain },
}

export function AgentStatusBar({ status }: AgentStatusBarProps) {
  const item = labels[status]
  const Icon = item.icon

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-zinc-400">
      <Icon size={14} className="text-indigo-200" />
      <span>{item.text}</span>
    </div>
  )
}
