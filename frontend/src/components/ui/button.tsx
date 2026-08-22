import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "danger"
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default:
        "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-[0_10px_30px_rgba(99,102,241,0.28)] hover:from-indigo-400 hover:to-violet-400",
      outline:
        "border border-white/10 bg-white/0 text-zinc-100 hover:bg-white/5 hover:border-white/15",
      ghost:
        "bg-transparent text-zinc-300 hover:bg-white/5 hover:text-zinc-100",
      danger:
        "bg-red-500 text-white hover:bg-red-400 shadow-[0_10px_30px_rgba(239,68,68,0.18)]",
    }

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 active:translate-y-[1px]",
          variants[variant],
          className
        )}
        {...props}
      />
    )
  }
)

Button.displayName = "Button"