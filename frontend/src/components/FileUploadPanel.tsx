import { useCallback, useRef, useState } from "react"
import { Upload, FileText, CheckCircle, XCircle } from "lucide-react"
import { uploadFile, getUploadStatus } from "../lib/api"
import { Card, CardContent } from "./ui/card"

interface FileUploadPanelProps {
  orgId: string
  sessionId?: string
  onUploadComplete?: (docId: string) => void
}

type UploadState = "idle" | "uploading" | "processing" | "ready" | "error"

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
]

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg"
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

export function FileUploadPanel({ orgId, sessionId, onUploadComplete }: FileUploadPanelProps) {
  const [state, setState] = useState<UploadState>("idle")
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const validateFile = useCallback((file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) return "File exceeds 20 MB limit"
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|docx|txt|md|png|jpe?g)$/i)) {
      return "Unsupported file type"
    }
    return null
  }, [])

  const handleUpload = useCallback(
    async (file: File) => {
      const validationError = validateFile(file)
      if (validationError) {
        setErrorMsg(validationError)
        setState("error")
        return
      }

      setFileName(file.name)
      setState("uploading")
      setProgress(0)
      setErrorMsg(null)

      // Simulate progress during upload
      const progressInterval = window.setInterval(() => {
        setProgress((prev) => Math.min(prev + 12, 90))
      }, 200)

      try {
        const { docId } = await uploadFile(file, orgId, sessionId)

        window.clearInterval(progressInterval)
        setProgress(100)
        setState("processing")

        // Poll for processing completion
        let attempts = 0
        const poll = window.setInterval(async () => {
          attempts++
          try {
            const status = await getUploadStatus(docId)
            if (status.status === "ready") {
              window.clearInterval(poll)
              setState("ready")
              onUploadComplete?.(docId)
            } else if (status.status === "error") {
              window.clearInterval(poll)
              setState("error")
              setErrorMsg("Processing failed")
            }
          } catch {
            // keep polling
          }
          if (attempts > 30) {
            window.clearInterval(poll)
            setState("ready")
            onUploadComplete?.(docId)
          }
        }, 2000)
      } catch (err) {
        window.clearInterval(progressInterval)
        setState("error")
        setErrorMsg(err instanceof Error ? err.message : "Upload failed")
      }
    },
    [orgId, sessionId, onUploadComplete, validateFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) void handleUpload(file)
    },
    [handleUpload]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void handleUpload(file)
    },
    [handleUpload]
  )

  const reset = useCallback(() => {
    setState("idle")
    setProgress(0)
    setFileName(null)
    setErrorMsg(null)
  }, [])

  return (
    <Card className="border-white/10 bg-white/[0.035]">
      <CardContent className="p-5">
        {state === "idle" && (
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click() }}
            className={[
              "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-all duration-200",
              dragOver
                ? "scale-[1.02] border-indigo-400/50 bg-indigo-500/[0.06]"
                : "border-white/10 bg-white/[0.02] hover:border-indigo-400/30 hover:bg-white/[0.04]",
            ].join(" ")}
          >
            <Upload size={28} className="text-zinc-500" />
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-300">
                Drop a file here or click to browse
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                PDF, DOCX, TXT, MD, PNG, JPG — max 20 MB
              </p>
            </div>
          </div>
        )}

        {state === "uploading" && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-8">
            <FileText size={24} className="text-indigo-300" />
            <p className="text-sm text-zinc-300">{fileName}</p>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500">Uploading… {progress}%</p>
          </div>
        )}

        {state === "processing" && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] px-6 py-8">
            <FileText size={24} className="animate-pulse text-indigo-300" />
            <p className="text-sm text-zinc-300">Processing {fileName}…</p>
            <p className="text-xs text-zinc-500">Chunking and indexing document</p>
          </div>
        )}

        {state === "ready" && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-6 py-8">
            <CheckCircle size={24} className="text-emerald-400" />
            <p className="text-sm font-medium text-emerald-200">{fileName} ready</p>
            <button
              onClick={reset}
              className="text-xs text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200"
            >
              Upload another
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.04] px-6 py-8">
            <XCircle size={24} className="text-red-400" />
            <p className="text-sm text-red-200">{errorMsg || "Something went wrong"}</p>
            <button
              onClick={reset}
              className="text-xs text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200"
            >
              Try again
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
          className="hidden"
        />
      </CardContent>
    </Card>
  )
}
