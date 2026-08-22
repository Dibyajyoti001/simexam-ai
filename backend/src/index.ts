import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import chatRouter from "./routes/chat.js"
import evaluateRouter from "./routes/evaluate.js"
import executeRouter from "./routes/execute.js"
import orgRouter from "./routes/org.js"
import sessionRouter from "./routes/session.js"
import authRouter from "./routes/auth.js"
import uploadRouter from "./routes/upload.js"
import agentRouter from "./routes/agent.js"
import { securityHeaders, rateLimiter } from "./middleware/securityMiddleware.js"
import { hasDatabase, initDatabase } from "./lib/db.js"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(securityHeaders())
app.use(rateLimiter({ windowMs: 60000, maxRequests: 60 }))

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}))

app.use(express.json({ limit: "10mb" }))

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    database: hasDatabase() ? "configured" : "not_configured",
    model: "gemini-2.0-flash",
    mode: "agentic backend with optional Neon persistence",
    production_note: "Set DATABASE_URL for Neon Postgres and JUDGE0_URL for real sandbox execution.",
    timestamp: new Date().toISOString(),
  })
})

app.post("/api/db/init", async (req, res) => {
  if (!hasDatabase()) return res.status(503).json({ error: "DATABASE_URL not configured" })

  const adminSecret = process.env.ADMIN_SECRET || process.env.SERVICE_SECRET
  if (process.env.NODE_ENV === "production" && adminSecret) {
    const provided = req.headers["x-admin-secret"] || req.headers["authorization"]
    if (provided !== adminSecret && provided !== `Bearer ${adminSecret}`) {
      return res.status(403).json({ error: "Forbidden: Admin secret required in production" })
    }
  }

  try {
    await initDatabase()
    return res.json({ ok: true })
  } catch (err: any) {
    console.error("[DB] Init failed:", err?.message)
    return res.status(500).json({ error: "Database initialization failed" })
  }
})

app.use("/api/chat", chatRouter)
app.use("/api/execute", executeRouter)
app.use("/api/evaluate", evaluateRouter)
app.use("/api/org", orgRouter)
app.use("/api/session", sessionRouter)
app.use("/api/auth", authRouter)
app.use("/api/upload", uploadRouter)
app.use("/api/agent", agentRouter)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Global Error]", err?.message)
  res.status(500).json({ error: "Internal server error" })
})

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║       SimExam.ai Backend — DEMO mode     ║
║  Model: gemini-2.0-flash (free tier)     ║
║  Architecture: CAG-ready (scaffolded)    ║
╠══════════════════════════════════════════╣
║  POST /api/chat     → SSE stream         ║
║  POST /api/evaluate → JSON scores        ║
║  GET  /health       → status             ║
╚══════════════════════════════════════════╝
  Server running on http://localhost:${PORT}
  `)
})

export default app
