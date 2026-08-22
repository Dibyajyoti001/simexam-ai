import { useCallback, useEffect, useRef } from "react"
import { BACKEND_URL } from '../lib/constants'
import SimpleMdeReact from "react-simplemde-editor"
import "easymde/dist/easymde.min.css"
import { getToken } from '../lib/auth'

interface RichTextEditorProps {
  value: string
  onChange: (val: string) => void
  onSubmit?: () => void
  title?: string
  prompt?: string
  sessionId?: string | null
  orgSlug?: string
}

export function RichTextEditor({ value, onChange, onSubmit: _onSubmit, title, prompt, sessionId, orgSlug }: RichTextEditorProps) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (!sessionId) return
      fetch(`${BACKEND_URL}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: JSON.stringify({
          type: 'proactive',
          action: 'SILENCE_TIMEOUT',
          sessionId,
          orgSlug: orgSlug || 'default',
        })
      }).catch(err => console.error("Proactive agent error", err))
    }, 60000)
  }, [sessionId, orgSlug])

  useEffect(() => {
    resetTimeout()
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [resetTimeout])

  const handleChange = useCallback((val: string) => {
    onChange(val)
    resetTimeout()
  }, [onChange, resetTimeout])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-rose-500/80" />
            <div className="h-3 w-3 rounded-full bg-amber-500/80" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-300">{title || "Technical response"}</div>
            {prompt ? <div className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{prompt}</div> : null}
          </div>
        </div>
      </div>
      
      <div className="flex-1 p-4 overflow-auto prose-invert">
        <SimpleMdeReact
          value={value}
          onChange={handleChange}
          options={{
            spellChecker: false,
            status: false,
            placeholder: prompt ? "Develop your response against the assessment brief..." : "Write your structured response here... Markdown formatting is supported.",
          }}
        />
      </div>
    </div>
  )
}
