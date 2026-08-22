import { Tldraw } from '@tldraw/tldraw'
import { BACKEND_URL } from '../lib/constants'
import '@tldraw/tldraw/tldraw.css'
import { useEffect, useRef } from 'react'
import { getToken } from '../lib/auth'

interface WhiteboardCanvasProps {
  value: string
  onChange: (val: string) => void
  title?: string
  prompt?: string
  sessionId?: string | null
  orgSlug?: string
}

export function WhiteboardCanvas({ value: _value, onChange, title, prompt, sessionId, orgSlug }: WhiteboardCanvasProps) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const resetTimeout = () => {
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
  }

  useEffect(() => {
    resetTimeout()
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [sessionId, orgSlug])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#161618]">
      <div className="relative z-10 shrink-0 border-b border-white/8 bg-zinc-950/90 px-4 py-3">
        <div className="text-sm font-semibold text-zinc-100">{title || "System design workspace"}</div>
        {prompt ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{prompt}</p> : null}
      </div>
      <Tldraw
        onMount={(editor) => {
          editor.store.listen(() => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
              const snapshot = (editor.store as any).getSnapshot
                ? (editor.store as any).getSnapshot()
                : (editor as any).getSnapshot
                ? (editor as any).getSnapshot()
                : {}
              onChange(JSON.stringify(snapshot))
            }, 350)
            resetTimeout()
          }, { source: 'user', scope: 'document' })
        }}
      />
    </div>
  )
}
