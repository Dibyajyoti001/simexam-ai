import { Router, Request, Response } from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import rateLimit from "express-rate-limit"
import { validate, UploadSchema } from "../middleware/validation.js"
import { authenticateJWT } from "../middleware/authMiddleware.js"
import { hasDatabase, dbQuery } from "../lib/db.js"
import { pythonIngest } from "../tools/pythonBridge.js"

const router = Router()

const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many upload requests, please try again later." },
})

const statusRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many status requests, please try again later." },
})

// Configure multer storage
const uploadDir = path.join(process.cwd(), "uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")
    cb(null, `${uniqueSuffix}-${cleanName}`)
  },
})

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
]

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|txt|md|png|jpe?g)$/i)) {
      cb(null, true)
    } else {
      cb(new Error("Invalid file type"))
    }
  },
})

// Simple magic bytes check
function validateMagicBytes(filePath: string, mimetype: string): boolean {
  try {
    const buffer = Buffer.alloc(4)
    const fd = fs.openSync(filePath, "r")
    fs.readSync(fd, buffer, 0, 4, 0)
    fs.closeSync(fd)

    if (mimetype === "application/pdf") {
      return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
    } else if (mimetype === "image/png") {
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    } else if (mimetype === "image/jpeg") {
      return buffer[0] === 0xff && buffer[1] === 0xd8
    }
    return true
  } catch {
    return false
  }
}

/**
 * POST /api/upload
 * Supports file uploads for Knowledge Base RAG and dynamic AI Exam Generation.
 */
router.post(
  "/",
  uploadRateLimiter,
  authenticateJWT,
  upload.single("file"),
  validate(UploadSchema),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const { orgId: rawOrgId, sessionId } = req.body
    const resolvedUploadDir = path.resolve(uploadDir)

    let realUploadDir: string
    let realSafeFilePath: string | null = null
    try {
      realUploadDir = fs.realpathSync(resolvedUploadDir)
    } catch {
      return res.status(500).json({ error: "Upload directory is not accessible" })
    }

    const safeFilename = path.basename(req.file.path)
    const candidateFilePath = path.join(realUploadDir, safeFilename)

    if (fs.existsSync(candidateFilePath)) {
      try {
        realSafeFilePath = fs.realpathSync(candidateFilePath)
      } catch {}
    }

    const isWithinUploadDir = (() => {
      if (!realSafeFilePath) return false
      const relativePath = path.relative(realUploadDir, realSafeFilePath)
      return !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
    })()

    if (!isWithinUploadDir) {
      try {
        if (realSafeFilePath && fs.existsSync(realSafeFilePath)) {
          fs.unlinkSync(realSafeFilePath)
        }
      } catch {}
      return res.status(400).json({ error: "Invalid upload path" })
    }

    const verifiedFilePath = realSafeFilePath as string

    if (!validateMagicBytes(verifiedFilePath, req.file.mimetype)) {
      fs.unlinkSync(verifiedFilePath)
      return res.status(400).json({ error: "File content does not match extension" })
    }

    try {
      let resolvedOrgUuid = rawOrgId
      let docId = `doc-${Date.now()}`

      if (hasDatabase()) {
        // Resolve orgId: check if rawOrgId is a slug or uuid
        const orgCheck = await dbQuery<{ id: string }>(
          "SELECT id FROM orgs WHERE slug = $1 OR id::text = $1",
          [rawOrgId]
        ).catch(() => ({ rows: [] as { id: string }[] }))

        if (orgCheck.rows.length > 0) {
          resolvedOrgUuid = orgCheck.rows[0].id
        } else {
          // If no org found, get or create a default demo org
          const fallbackOrg = await dbQuery<{ id: string }>(
            "INSERT INTO orgs (slug, name) VALUES ('demo', 'Demo Org') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id"
          )
          resolvedOrgUuid = fallbackOrg.rows[0].id
        }

        // Org ownership check: authenticated user can only upload to their own org
        if (process.env.ENABLE_AUTH !== "false" && req.user?.orgId && resolvedOrgUuid !== req.user.orgId) {
          fs.unlinkSync(verifiedFilePath)
          return res.status(403).json({ error: "You can only upload to your own organization" })
        }

        const validSessionUuid = sessionId && sessionId.length === 36 ? sessionId : null

        const result = await dbQuery<{ id: string }>(
          `INSERT INTO uploaded_docs (org_id, session_id, filename, mime_type, size_bytes, storage_url, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'processing') RETURNING id`,
          [resolvedOrgUuid, validSessionUuid, req.file.originalname, req.file.mimetype, req.file.size, verifiedFilePath]
        )
        docId = result.rows[0].id
      }

      // Read file buffer for Python ingestion / text extraction
      const fileBuffer = fs.readFileSync(verifiedFilePath)
      let textSnippet = ""
      if (req.file.mimetype.startsWith("text/") || req.file.originalname.match(/\.(txt|md)$/i)) {
        textSnippet = fileBuffer.toString("utf-8").slice(0, 4000)
      }

      // Trigger Python RAG ingestion in background
      void pythonIngest(docId, resolvedOrgUuid, fileBuffer, req.file.originalname, req.file.mimetype).then((result) => {
        if (hasDatabase()) {
          dbQuery("UPDATE uploaded_docs SET status = $2, chunk_count = $3 WHERE id = $1", [docId, result.success && result.data?.status === "ready" ? "ready" : "error", result.data?.chunk_count || 0]).catch(() => {})
        }
      }).catch((err) => {
        console.warn("[Upload] Python ingestion skipped/fallback:", err?.message || err)
        if (hasDatabase()) {
          dbQuery("UPDATE uploaded_docs SET status = 'error' WHERE id = $1", [docId]).catch(() => {})
        }
      })

      // Immediate success response
      res.status(202).json({
        success: true,
        docId,
        filename: req.file.originalname,
        sizeBytes: req.file.size,
        textSnippet: textSnippet || undefined,
      })
    } catch (err: any) {
      console.error("[Upload] Failed to process upload:", err.message)
      res.status(500).json({ error: "Failed to process upload" })
    }
  }
)

/**
 * GET /api/upload/:docId/status
 */
router.get("/:docId/status", statusRateLimiter, authenticateJWT, async (req: Request, res: Response) => {
  const { docId } = req.params

  if (!hasDatabase()) {
    return res.json({ status: "ready", chunkCount: 5 })
  }

  try {
    const result = await dbQuery<{ status: string; chunk_count: number; org_id: string }>(
      "SELECT status, chunk_count, org_id FROM uploaded_docs WHERE id = $1",
      [docId]
    )

    if (result.rows.length === 0) {
      return res.json({ status: "ready", chunkCount: 1 })
    }

    res.json({
      status: result.rows[0].status,
      chunkCount: result.rows[0].chunk_count,
    })
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch status" })
  }
})

export default router
