import { Router, Request, Response } from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import { validate, UploadSchema } from "../middleware/validation.js"
import { authenticateJWT, requireAdmin } from "../middleware/authMiddleware.js"
import { hasDatabase, dbQuery } from "../lib/db.js"
import { pythonIngest } from "../tools/pythonBridge.js"

const router = Router()

// Configure multer storage
const uploadDir = path.join(process.cwd(), "uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    // Basic sanitization
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")
    cb(null, `${uniqueSuffix}-${cleanName}`)
  },
})

// Define allowed mime types
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Invalid file type"))
    }
  },
})

// Magic bytes validation (simple check)
function validateMagicBytes(filePath: string, mimetype: string): boolean {
  try {
    const buffer = Buffer.alloc(4)
    const fd = fs.openSync(filePath, "r")
    fs.readSync(fd, buffer, 0, 4, 0)
    fs.closeSync(fd)

    if (mimetype === "application/pdf") {
      // PDF starts with %PDF
      return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
    } else if (mimetype === "image/png") {
      // PNG starts with 89 50 4E 47
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    } else if (mimetype === "image/jpeg") {
      // JPEG starts with FF D8
      return buffer[0] === 0xff && buffer[1] === 0xd8
    }
    // Trust other extensions (docx, txt, md)
    return true
  } catch {
    return false
  }
}

/**
 * POST /api/upload
 * Requires JWT token, orgId in body.
 */
router.post("/", authenticateJWT, upload.single("file"), validate(UploadSchema), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" })
  }

  const { orgId, sessionId } = req.body
  const resolvedUploadDir = path.resolve(uploadDir)
  const safeFilePath = path.resolve(req.file.path)

  if (!safeFilePath.startsWith(resolvedUploadDir + path.sep)) {
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path)
      }
    } catch {}
    return res.status(400).json({ error: "Invalid upload path" })
  }

  if (process.env.ENABLE_AUTH && req.user && req.user.role !== "admin" && req.user.orgId !== orgId) {
    fs.unlinkSync(safeFilePath)
    return res.status(403).json({ error: "Unauthorized for this organization" })
  }

  if (!validateMagicBytes(safeFilePath, req.file.mimetype)) {
    fs.unlinkSync(safeFilePath)
    return res.status(400).json({ error: "File content does not match extension" })
  }

  try {
    let docId = "mock-doc-id"

    if (hasDatabase()) {
      const result = await dbQuery<{ id: string }>(
        `INSERT INTO uploaded_docs (org_id, session_id, filename, mime_type, size_bytes, storage_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'processing') RETURNING id`,
        [orgId, sessionId || null, req.file.originalname, req.file.mimetype, req.file.size, safeFilePath]
      )
      docId = result.rows[0].id
    }

    // Read file buffer for Python ingestion
    const fileBuffer = fs.readFileSync(safeFilePath)
    
    // Fire-and-forget
    pythonIngest(docId, orgId, fileBuffer, req.file.originalname, req.file.mimetype).catch((err) => {
      console.error("[Upload] Python ingestion failed:", err)
      if (hasDatabase()) {
         dbQuery("UPDATE uploaded_docs SET status = 'error' WHERE id = $1", [docId])
      }
    })

    res.status(202).json({ success: true, docId })
  } catch (err: any) {
    console.error("[Upload] Failed to process upload:", err.message)
    res.status(500).json({ error: "Failed to process upload" })
  }
})

/**
 * GET /api/upload/:docId/status
 */
router.get("/:docId/status", authenticateJWT, async (req: Request, res: Response) => {
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
      return res.status(404).json({ error: "Document not found" })
    }

    if (process.env.ENABLE_AUTH && req.user && req.user.role !== "admin" && req.user.orgId !== result.rows[0].org_id) {
      return res.status(403).json({ error: "Unauthorized for this organization" })
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
