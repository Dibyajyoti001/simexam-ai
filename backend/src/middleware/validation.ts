import { z, ZodSchema, ZodError } from "zod"
import { Request, Response, NextFunction } from "express"

// ── Reusable primitives ───────────────────────────────────────────

const uuidField = z.string().uuid()
const safeName = z.string().min(1).max(200)
const safeSlug = z.string().min(1).max(50)
const safeCode = z.string().max(50_000)
const safeEmail = z.string().email().max(320)
// ── Chat ──────────────────────────────────────────────────────────

export const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        parts: z.array(z.object({ text: z.string().max(10_000) })),
      })
    )
    .max(50),
  studentName: safeName,
  examState: z.object({
    bugFixed: z.boolean(),
    approach: z.string(),
    curveballSeen: z.boolean(),
    curveballAddressed: z.boolean(),
    hintsGiven: z.number(),
    turnsElapsed: z.number(),
    lastCodeState: z.enum(["INITIAL", "COMPILING", "SYNTAX_ERROR", "LOGIC_ERROR", "OPTIMIZED", "UNKNOWN"]),
    lastIntentClass: z.string(),
  })
    .optional(),
  sessionId: uuidField.nullable().optional(),
  orgSlug: safeSlug.optional(),
})

// ── Execute ───────────────────────────────────────────────────────

export const ExecuteRequestSchema = z.object({
  code: safeCode,
  language: z.enum(["javascript", "typescript", "python", "java"]).optional(),
  sessionId: uuidField.nullable().optional(),
})

// ── Evaluate ──────────────────────────────────────────────────────

export const EvaluateRequestSchema = z.object({
  conversationHistory: z.string().max(100_000),
  codeSnapshots: z.array(z.string().max(50_000)).max(50),
  finalCode: safeCode.optional(),
  timeElapsedSeconds: z.number().int().min(0),
  curveballFired: z.boolean(),
  curveballAddressed: z.boolean(),
  studentName: safeName,
  sessionId: uuidField.nullable().optional(),
  orgSlug: safeSlug.optional(),
})

// ── Session ───────────────────────────────────────────────────────

export const SessionCreateSchema = z.object({
  orgSlug: safeSlug,
  studentName: safeName,
  studentEmail: safeEmail.optional(),
})

// ── Config ────────────────────────────────────────────────────────

export const ConfigUpdateSchema = z.object({
  title: z.string().min(1).max(200),
  problemStatement: z.string().min(1).max(10_000),
  starterCode: safeCode,
  allowedLanguages: z.array(z.string().max(20)).min(1).max(10).optional(),
  timeLimitSeconds: z.number().int().min(30).max(7200).optional(),
  curveballAtSeconds: z.number().int().min(10).max(7200).optional(),
  curveballMessage: z.string().max(2000).optional(),
  testCases: z.array(z.object({
    input: z.unknown(),
    expectedOutput: z.unknown(),
    hidden: z.boolean().optional(),
  })).optional(),
  knowledgeBaseUrls: z.array(z.string().url().max(2048)).max(20).optional(),
  agentPersona: z.object({
    name: z.string().max(100).optional(),
    role: z.string().max(200).optional(),
    systemPromptAdditions: z.string().max(5000).optional(),
  }).optional(),
  rubric: z.object({
    dimensions: z.array(z.object({
      name: z.string().max(100),
      weight: z.number().min(0).max(1),
      description: z.string().max(500),
      scoringHints: z.array(z.string().max(200)).optional(),
    })).optional(),
    passingScore: z.number().min(0).max(10).optional(),
  }).optional(),
  branding: z.object({
    name: z.string().max(200).optional(),
    logoUrl: z.string().url().max(2048).optional(),
    primaryColor: z.string().max(20).optional(),
    accentColor: z.string().max(20).optional(),
  }).optional(),
})

// ── Upload ────────────────────────────────────────────────────────

export const UploadSchema = z.object({
  orgId: z.string().min(1).max(200),
  sessionId: z.string().max(200).nullable().optional(),
})

// ── Auth ──────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: safeEmail,
  password: z.string().min(6).max(128),
})

export const RegisterSchema = z.object({
  email: safeEmail,
  password: z.string().min(6).max(128),
  orgSlug: safeSlug,
  orgName: z.string().min(1).max(200),
})

export const InviteTokenSchema = z.object({
  token: z.string().min(3).max(64),
})

// ── Middleware factory ────────────────────────────────────────────

/**
 * Express middleware factory that validates `req.body` against the supplied
 * Zod schema. Returns 400 with structured error details on failure.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: (result.error as ZodError).issues,
      })
      return
    }
    // Replace body with parsed (coerced/cleaned) version
    req.body = result.data
    next()
  }
}

// ── String sanitiser ──────────────────────────────────────────────

/**
 * Strips HTML tags, null bytes, and ASCII control characters from a string.
 * Safe for use in logs, DB fields, and SSE payloads.
 */
export function sanitizeString(input: string): string {
  return input
    // Strip angle brackets to prevent HTML tag injection
    .replace(/[<>]/g, "")
    // Strip null bytes
    .replace(/\0/g, "")
    // Strip control characters (except newline, tab, carriage return)
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
}
