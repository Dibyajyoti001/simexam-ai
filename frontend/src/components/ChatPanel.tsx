import { Send, Sparkles, UserRound } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { ChatMessage } from "../types/index"
import { CurveballBanner } from "./CurveballBanner"
import { TypingIndicator } from "./TypingIndicator"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

interface ChatPanelProps {
  studentName: string
  messages: ChatMessage[]
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  isTyping: boolean
}

export function ChatPanel({
  studentName,
  messages,
  draft,
  onDraftChange,
  onSend,
  isTyping,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, isTyping])

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.role !== "system"),
    [messages]
  )

  return (
    <Card className="overflow-hidden border-white/10 bg-white/[0.035]">
      <CardHeader className="border-b border-white/8 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl sm:text-2xl">AI interviewer</CardTitle>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Ask for clarification, explain your changes, or talk through the approach.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            LIVE
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex h-full flex-col p-4 sm:p-5">
        <div
          ref={scrollRef}
          className="min-h-[460px] max-h-[560px] flex-1 space-y-3 overflow-y-auto rounded-3xl border border-white/8 bg-zinc-950/75 p-3"
        >
          {visibleMessages.map((message) => {
            if (message.role === "pm") {
              return <CurveballBanner key={message.id} message={message.content} />
            }

            const isStudent = message.role === "student"
            const bubbleClasses = isStudent
              ? "ml-auto border-indigo-400/20 bg-indigo-500/10 text-zinc-100"
              : "mr-auto border-white/8 bg-white/[0.03] text-zinc-100"

            const avatar = isStudent ? studentName.slice(0, 2).toUpperCase() || "YO" : "AC"

            return (
              <div
                key={message.id}
                className={`flex max-w-[92%] items-start gap-3 ${isStudent ? "ml-auto flex-row-reverse" : ""}`}
              >
                <div
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                    isStudent
                      ? "border-indigo-400/25 bg-indigo-500/15 text-indigo-100"
                      : "border-white/10 bg-white/[0.04] text-zinc-200",
                  ].join(" ")}
                >
                  {avatar}
                </div>

                <div className={`rounded-3xl border px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)] ${bubbleClasses}`}>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  {message.streaming ? (
                    <span className="ml-1 inline-block animate-pulse text-indigo-300">▌</span>
                  ) : null}
                </div>
              </div>
            )
          })}

          {isTyping ? <TypingIndicator /> : null}
        </div>

        <div className="mt-4 space-y-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            }}
            rows={3}
            placeholder="Ask about the bug, the output, or the next step..."
            className="w-full resize-none rounded-xl border border-white/8 bg-zinc-950/80 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/15"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">
                <Sparkles size={12} />
                Ask for hints, not solutions
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">
                <UserRound size={12} />
                Conversation stays on task
              </span>
            </div>

            <Button onClick={onSend} className="sm:w-auto">
              <Send size={15} />
              Send
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}