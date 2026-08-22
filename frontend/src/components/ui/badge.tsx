import * as React from "react"
import { cn } from "../../lib/utils"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error" | "outline"
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-indigo-500/30 bg-indigo-500/12 text-indigo-200",
    success: "border-emerald-500/25 bg-emerald-500/12 text-emerald-200",
    warning: "border-amber-500/25 bg-amber-500/12 text-amber-200",
    error: "border-red-500/25 bg-red-500/12 text-red-200",
    outline: "border-white/10 bg-transparent text-zinc-300",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.08em]",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}