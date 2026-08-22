import { Check, Copy, Play } from "lucide-react"
import Editor from "@monaco-editor/react"
import { useState } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

interface CodeEditorProps {
  code: string
  onChange: (code: string) => void
  onRun: () => void
  onSubmit: () => void
  onCopy?: () => void
  filename?: string
  language?: string
  languages?: string[]
  onLanguageChange?: (language: string) => void
}

export function CodeEditor({
  code,
  onChange,
  onRun,
  onSubmit,
  onCopy,
  filename,
  language = "javascript",
  languages = ["javascript"],
  onLanguageChange,
}: CodeEditorProps) {
  const [copied, setCopied] = useState(false)

  const extension = language === "python" ? ".py" : language === "typescript" ? ".ts" : language === "java" ? ".java" : ".js"
  const displayFilename = filename || `solution${extension}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      onCopy?.()
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Ignore copy failures.
    }
  }

  return (
    <Card className="overflow-hidden border-white/10 bg-white/[0.035] flex flex-col h-full">
      <CardHeader className="border-b border-white/8 pb-3 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Code Workspace</CardTitle>
            <p className="mt-1 text-xs text-zinc-400">
              Implement your solution, run test cases, and explain your approach to the Socratic AI mentor.
            </p>
          </div>

          <div className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-zinc-400 sm:block">
            {displayFilename.toLowerCase()}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-3 flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-hidden rounded-2xl border border-white/8 bg-zinc-950/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] flex flex-col">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-2 text-xs text-zinc-500 shrink-0">
            <span className="font-medium tracking-[0.14em] uppercase">{displayFilename}</span>
            {languages.length > 1 ? (
              <select
                value={language}
                onChange={(event) => onLanguageChange?.(event.target.value)}
                className="rounded-xl border border-white/10 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none"
              >
                {languages.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            ) : (
              <span className="font-mono">{language}</span>
            )}
          </div>

          <div className="flex-1 min-h-[360px] overflow-hidden">
            <Editor
              height="100%"
              language={language === "javascript" ? "javascript" : language}
              value={code}
              onChange={(value) => onChange(value || "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                lineNumbers: "on",
                lineNumbersMinChars: 3,
                fontSize: 14,
                lineHeight: 22,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                wrappingIndent: "indent",
                padding: { top: 12, bottom: 12 },
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div className="text-[11px] leading-4 text-zinc-500">
            <div>Ctrl+Enter runs code • Socratic mentor checks in on your progress</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleCopy} className="h-8 text-xs">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" onClick={onRun} className="h-8 text-xs">
              <Play size={13} />
              Run
            </Button>
            <Button onClick={onSubmit} className="h-8 text-xs">Submit</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
