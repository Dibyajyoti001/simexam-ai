// ── Neon serverless driver ─────────────────────────────────────────
// Uses WebSocket/HTTPS (port 443) instead of raw TCP port 5432.
// This bypasses corporate firewalls that block outbound 5432.
import { Pool, neonConfig } from "@neondatabase/serverless"
import ws from "ws"
import type { QueryResult, QueryResultRow } from "pg"
import {
  AgentEvent,
  EvaluationResult,
  SessionSummary,
  TenantConfig,
} from "../types/index.js"

// Wire up ws so Neon can open WebSocket connections for transactions
neonConfig.webSocketConstructor = ws

export const NEON_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  exam_type VARCHAR(50) NOT NULL DEFAULT 'coding',
  title TEXT NOT NULL,
  description TEXT,
  problem_statement TEXT NOT NULL,
  starter_code TEXT NOT NULL,
  allowed_languages TEXT[] NOT NULL DEFAULT '{javascript}',
  time_limit_seconds INTEGER NOT NULL DEFAULT 600,
  curveball_at_seconds INTEGER NOT NULL DEFAULT 120,
  curveball_message TEXT,
  agent_persona JSONB NOT NULL DEFAULT '{}'::jsonb,
  rubric JSONB NOT NULL,
  rubric_type VARCHAR(50) NOT NULL DEFAULT 'deterministic',
  test_cases JSONB NOT NULL,
  knowledge_base_urls TEXT[] NOT NULL DEFAULT '{}',
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_configs_one_active_per_org
  ON exam_configs (org_id)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  invite_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  student_id UUID REFERENCES students(id),
  config_id UUID NOT NULL REFERENCES exam_configs(id),
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  time_elapsed_seconds INTEGER,
  final_code TEXT,
  curveball_fired BOOLEAN NOT NULL DEFAULT false,
  curveball_at_seconds INTEGER,
  passed BOOLEAN,
  CHECK (status IN ('active', 'submitted', 'evaluated'))
);

CREATE TABLE IF NOT EXISTS agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (actor IN ('student', 'agent', 'system'))
);

CREATE INDEX IF NOT EXISTS agent_events_session_time_idx
  ON agent_events (session_id, created_at);

CREATE TABLE IF NOT EXISTS code_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  code_state TEXT,
  sandbox_stdout TEXT,
  sandbox_stderr TEXT,
  sandbox_exit_code INTEGER,
  test_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS code_snapshots_session_time_idx
  ON code_snapshots (session_id, created_at);

CREATE TABLE IF NOT EXISTS uploaded_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RAG pipeline: stores chunked text + vector embeddings for uploaded docs
CREATE TABLE IF NOT EXISTS doc_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES uploaded_docs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_chunks_org_idx ON doc_chunks (org_id);
CREATE INDEX IF NOT EXISTS doc_chunks_doc_idx  ON doc_chunks (doc_id);

CREATE TABLE IF NOT EXISTS semantic_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tests_passed INTEGER,
  tests_total INTEGER,
  dimension_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  technical_accuracy INTEGER NOT NULL,
  adaptability INTEGER NOT NULL,
  communication INTEGER NOT NULL,
  efficiency INTEGER NOT NULL,
  doubt_resolution INTEGER,
  overall_feedback TEXT NOT NULL,
  strengths TEXT[] NOT NULL DEFAULT '{}',
  improvements TEXT[] NOT NULL DEFAULT '{}',
  passed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  auth_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role IN ('admin', 'viewer', 'student'))
);

CREATE INDEX IF NOT EXISTS idx_org_users_email ON org_users(email);

-- Migrations: safely add columns that may be missing from tables created by older schema versions
ALTER TABLE org_users ADD COLUMN IF NOT EXISTS email         TEXT         NOT NULL DEFAULT '';
ALTER TABLE org_users ADD COLUMN IF NOT EXISTS password_hash TEXT         NOT NULL DEFAULT '';
`

let pool: Pool | null = null

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured")
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // @neondatabase/serverless uses WebSocket — SSL is handled by the WS tunnel.
      // No raw TCP options needed here.
      max: Number(process.env.PG_POOL_MAX || 8),
    })
  }

  return pool
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params)
}

export async function initDatabase(): Promise<void> {
  const pool = getPool()

  // Split on semicolons and run each statement individually so errors
  // are surfaced per-statement rather than aborting the entire batch.
  const statements = NEON_SCHEMA_SQL
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const stmt of statements) {
    try {
      await pool.query(stmt)
    } catch (err: any) {
      // Log but continue — most errors here are benign schema drift
      // (e.g. index already exists, column already exists)
      console.warn("[DB] Schema stmt warning:", err?.message?.slice(0, 120))
    }
  }
}

type TenantConfigRow = {
  org_id: string
  org_slug: string
  org_name: string
  config_id: string
  exam_type: "coding" | "conceptual" | "system_design" | "multiple_choice"
  title: string
  description: string | null
  problem_statement: string
  starter_code: string
  allowed_languages: string[]
  time_limit_seconds: number
  curveball_at_seconds: number
  curveball_message: string | null
  agent_persona: Record<string, any>
  rubric: Record<string, any>
  rubric_type: "deterministic" | "semantic"
  test_cases: any[]
  knowledge_base_urls: string[]
  branding: Record<string, any>
}

function mapTenantConfig(row: TenantConfigRow): TenantConfig {
  const branding = row.branding || {}
  const persona = row.agent_persona || {}
  const rubric = row.rubric || {}

  return {
    orgId: row.org_id,
    orgSlug: row.org_slug,
    branding: {
      name: branding.companyName || branding.name || row.org_name,
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor || "#7c3aed",
      accentColor: branding.accentColor,
    },
    exam: {
      configId: row.config_id,
      type: row.exam_type || "coding",
      title: row.title,
      description: row.description || undefined,
      problemStatement: row.problem_statement,
      starterCode: row.starter_code,
      allowedLanguages: row.allowed_languages,
      timeLimitSeconds: row.time_limit_seconds,
      curveballAtSeconds: row.curveball_at_seconds,
      curveballMessage: row.curveball_message || undefined,
      testCases: row.test_cases || [],
      knowledgeBaseUrls: row.knowledge_base_urls || [],
    },
    agent: {
      personaName: persona.name || "Alex Chen",
      personaRole: persona.role || `Senior Engineer at ${row.org_name}`,
      systemPromptAdditions: persona.systemPromptAdditions,
    },
    rubric: {
      dimensions: rubric.dimensions || [],
      passingScore: rubric.passingScore ?? 6,
      rubricType: row.rubric_type || "deterministic",
    },
  }
}

export async function getTenantConfigBySlug(slug: string): Promise<TenantConfig | null> {
  const result = await dbQuery<TenantConfigRow>(
    `
    SELECT
      o.id AS org_id,
      o.slug AS org_slug,
      o.name AS org_name,
      c.id AS config_id,
      c.exam_type,
      c.title,
      c.description,
      c.problem_statement,
      c.starter_code,
      c.allowed_languages,
      c.time_limit_seconds,
      c.curveball_at_seconds,
      c.curveball_message,
      c.agent_persona,
      c.rubric,
      c.rubric_type,
      c.test_cases,
      c.knowledge_base_urls,
      c.branding
    FROM orgs o
    JOIN exam_configs c ON c.org_id = o.id AND c.is_active = true
    WHERE o.slug = $1
    LIMIT 1
    `,
    [slug]
  )

  return result.rows[0] ? mapTenantConfig(result.rows[0]) : null
}

export async function upsertTenantConfig(config: TenantConfig): Promise<TenantConfig> {
  const client = await getPool().connect()

  try {
    await client.query("BEGIN")

    const orgResult = await client.query<{ id: string }>(
      `
      INSERT INTO orgs (slug, name)
      VALUES ($1, $2)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
      `,
      [config.orgSlug, config.branding.name]
    )
    const orgId = orgResult.rows[0].id

    await client.query(
      "UPDATE exam_configs SET is_active = false WHERE org_id = $1 AND is_active = true",
      [orgId]
    )

    const versionResult = await client.query<{ next_version: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM exam_configs WHERE org_id = $1",
      [orgId]
    )

    const version = versionResult.rows[0].next_version

    await client.query(
      `
      INSERT INTO exam_configs (
        org_id,
        version,
        is_active,
        exam_type,
        title,
        description,
        problem_statement,
        starter_code,
        allowed_languages,
        time_limit_seconds,
        curveball_at_seconds,
        curveball_message,
        agent_persona,
        rubric,
        rubric_type,
        test_cases,
        knowledge_base_urls,
        branding
      )
      VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15::jsonb, $16, $17::jsonb)
      `,
      [
        orgId,
        version,
        config.exam.type || "coding",
        config.exam.title,
        config.exam.description || null,
        config.exam.problemStatement,
        config.exam.starterCode,
        config.exam.allowedLanguages,
        config.exam.timeLimitSeconds,
        config.exam.curveballAtSeconds,
        config.exam.curveballMessage || null,
        JSON.stringify({
          name: config.agent.personaName,
          role: config.agent.personaRole,
          systemPromptAdditions: config.agent.systemPromptAdditions,
        }),
        JSON.stringify(config.rubric),
        config.rubric.rubricType || "deterministic",
        JSON.stringify(config.exam.testCases),
        config.exam.knowledgeBaseUrls,
        JSON.stringify({
          companyName: config.branding.name,
          logoUrl: config.branding.logoUrl,
          primaryColor: config.branding.primaryColor,
          accentColor: config.branding.accentColor,
        }),
      ]
    )

    await client.query("COMMIT")

    const saved = await getTenantConfigBySlug(config.orgSlug)
    if (!saved) throw new Error("Tenant config was not saved")
    return saved
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

function mapSession(row: any): SessionSummary {
  return {
    id: row.id,
    orgId: row.org_id,
    studentId: row.student_id,
    configId: row.config_id,
    status: row.status,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    timeElapsedSeconds: row.time_elapsed_seconds,
    finalCode: row.final_code,
    curveballFired: row.curveball_fired,
    passed: row.passed,
  }
}

export async function createExamSession(input: {
  orgSlug: string
  studentName: string
  email?: string
  inviteToken?: string
}): Promise<SessionSummary> {
  const client = await getPool().connect()

  try {
    await client.query("BEGIN")

    const config = await client.query<{
      org_id: string
      config_id: string
      curveball_at_seconds: number
    }>(
      `
      SELECT o.id AS org_id, c.id AS config_id, c.curveball_at_seconds
      FROM orgs o
      JOIN exam_configs c ON c.org_id = o.id AND c.is_active = true
      WHERE o.slug = $1
      LIMIT 1
      `,
      [input.orgSlug]
    )

    if (!config.rows[0]) {
      throw new Error(`No active exam config found for org slug "${input.orgSlug}"`)
    }

    const student = await client.query<{ id: string }>(
      `
      INSERT INTO students (org_id, name, email, invite_token)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (invite_token) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
      RETURNING id
      `,
      [
        config.rows[0].org_id,
        input.studentName,
        input.email || null,
        input.inviteToken || null,
      ]
    )

    const session = await client.query(
      `
      INSERT INTO sessions (org_id, student_id, config_id, curveball_at_seconds)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        config.rows[0].org_id,
        student.rows[0].id,
        config.rows[0].config_id,
        config.rows[0].curveball_at_seconds,
      ]
    )

    await client.query("COMMIT")
    return mapSession(session.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function getExamSession(sessionId: string): Promise<SessionSummary | null> {
  const result = await dbQuery("SELECT * FROM sessions WHERE id = $1 LIMIT 1", [sessionId])
  return result.rows[0] ? mapSession(result.rows[0]) : null
}

export async function listOrgSessions(orgSlug: string): Promise<SessionSummary[]> {
  const result = await dbQuery(
    `
    SELECT s.*
    FROM sessions s
    JOIN orgs o ON o.id = s.org_id
    WHERE o.slug = $1
    ORDER BY s.started_at DESC
    LIMIT 100
    `,
    [orgSlug]
  )
  return result.rows.map(mapSession)
}

export async function listSessionEvents(sessionId: string): Promise<AgentEvent[]> {
  const result = await dbQuery<{
    id: string
    session_id: string
    event_type: AgentEvent["eventType"]
    actor: AgentEvent["actor"]
    content: string | null
    metadata: Record<string, unknown>
    created_at: string
  }>(
    `
    SELECT id, session_id, event_type, actor, content, metadata, created_at
    FROM agent_events
    WHERE session_id = $1
    ORDER BY created_at ASC
    `,
    [sessionId]
  )

  return result.rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    eventType: row.event_type,
    actor: row.actor,
    content: row.content || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }))
}

export async function recordAgentEvent(input: {
  sessionId: string
  eventType: AgentEvent["eventType"]
  actor: AgentEvent["actor"]
  content?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await dbQuery(
    `
    INSERT INTO agent_events (session_id, event_type, actor, content, metadata)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.sessionId,
      input.eventType,
      input.actor,
      input.content || null,
      JSON.stringify(input.metadata || {}),
    ]
  )
}

export async function recordCodeSnapshot(input: {
  sessionId: string
  code: string
  codeState?: string
  stdout?: string
  stderr?: string
  exitCode?: number
  testResults?: Record<string, unknown>
}): Promise<void> {
  await dbQuery(
    `
    INSERT INTO code_snapshots (
      session_id,
      code,
      code_state,
      sandbox_stdout,
      sandbox_stderr,
      sandbox_exit_code,
      test_results
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.sessionId,
      input.code,
      input.codeState || null,
      input.stdout || null,
      input.stderr || null,
      input.exitCode ?? null,
      JSON.stringify(input.testResults || {}),
    ]
  )
}

export async function submitSession(input: {
  sessionId: string
  finalCode: string
  timeElapsedSeconds?: number
  curveballFired?: boolean
}): Promise<SessionSummary> {
  const result = await dbQuery(
    `
    UPDATE sessions
    SET
      status = 'submitted',
      submitted_at = now(),
      final_code = $2,
      time_elapsed_seconds = COALESCE($3, time_elapsed_seconds),
      curveball_fired = COALESCE($4, curveball_fired)
    WHERE id = $1
    RETURNING *
    `,
    [
      input.sessionId,
      input.finalCode,
      input.timeElapsedSeconds ?? null,
      input.curveballFired ?? null,
    ]
  )

  if (!result.rows[0]) throw new Error("Session not found")
  return mapSession(result.rows[0])
}

export async function recordEvaluation(input: {
  sessionId: string
  result: EvaluationResult
}): Promise<void> {
  await dbQuery(
    `
    INSERT INTO evaluations (
      session_id,
      tests_passed,
      tests_total,
      dimension_scores,
      technical_accuracy,
      adaptability,
      communication,
      efficiency,
      doubt_resolution,
      overall_feedback,
      strengths,
      improvements,
      passed
    )
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      input.sessionId,
      input.result.testsPassed ?? null,
      input.result.testsTotal ?? null,
      JSON.stringify(input.result.dimensionScores || {}),
      input.result.technicalAccuracy,
      input.result.adaptability,
      input.result.communication,
      input.result.efficiency,
      input.result.doubtResolution ?? null,
      input.result.overallFeedback,
      input.result.strengths,
      input.result.improvements,
      input.result.passed,
    ]
  )

  await dbQuery(
    "UPDATE sessions SET status = 'evaluated', passed = $2 WHERE id = $1",
    [input.sessionId, input.result.passed]
  )
}
