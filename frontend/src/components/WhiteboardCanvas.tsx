import { Tldraw } from '@tldraw/tldraw'
import { BACKEND_URL } from '../lib/constants'
import '@tldraw/tldraw/tldraw.css'
import { useEffect, useRef } from 'react'
import { getToken } from '../lib/auth'

interface WhiteboardCanvasProps {
  value: string
  onChange: (val: string) => void
  sessionId?: string | null
  orgSlug?: string
}

export function WhiteboardCanvas({ value: _value, onChange, sessionId, orgSlug }: WhiteboardCanvasProps) {
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
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#161618] overflow-hidden relative">
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
