import { useEffect, useState } from "react"
import { CURVEBALL_MESSAGE, EXAM_DURATION_SECONDS, INITIAL_CODE } from "../lib/constants"
import { fetchTenantConfig } from "../lib/api"
import { AssessmentType, TenantConfig } from "../types/index"

function cleanTitle(value: string, fallback: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim()
  return trimmed ? trimmed.slice(0, 96) : fallback
}

export function createLocalChallenge(input: {
  orgSlug?: string
  topic?: string
  domain?: string
  assessmentType?: AssessmentType
}): Partial<TenantConfig> {
  const assessmentType = input.assessmentType || "coding"
  const topic = cleanTitle(input.topic || input.domain || "Technical problem solving", "Technical problem solving")
  const domain = cleanTitle(input.domain || "Software engineering", "Software engineering")
  const common = {
    type: assessmentType,
    title: assessmentType === "system_design"
      ? `Design: ${topic}`
      : assessmentType === "conceptual"
        ? `Technical analysis: ${topic}`
        : `Implementation: ${topic}`,
    description: `${domain} assessment generated locally while the AI generation service is unavailable.`,
    timeLimitSeconds: assessmentType === "system_design" ? 2700 : 1800,
    curveballAtSeconds: assessmentType === "system_design" ? 900 : 600,
    curveballMessage: assessmentType === "system_design"
      ? "Constraint update: traffic is now regional and one primary dependency may be unavailable. Revisit the failure path and explain the trade-off."
      : "Constraint update: the happy path is no longer enough. Address scale, failure handling, and the boundary cases in your chosen approach.",
    allowedLanguages: assessmentType === "coding" ? ["javascript", "typescript", "python"] : [],
    knowledgeBaseUrls: [],
  }

  if (assessmentType === "system_design") {
    return {
      orgSlug: input.orgSlug || "demo",
      exam: {
        ...common,
        problemStatement: `Design a production-ready ${topic}.\n\nYour board should make clear:\n- the client and API boundary\n- durable data and ownership\n- the asynchronous or scaling path\n- failure handling, observability, and one deliberate trade-off\n\nUse the AI interviewer to defend decisions as you draw.`,
        starterCode: "",
        testCases: [],
      },
      agent: {
        personaName: "Mira Patel",
        personaRole: "Principal Systems Architect",
      },
    }
  }

  if (assessmentType === "conceptual") {
    return {
      orgSlug: input.orgSlug || "demo",
      exam: {
        ...common,
        problemStatement: `Write a structured technical position on ${topic}.\n\nState your assumptions, compare at least two approaches, identify the main risk, and describe how you would validate the decision in production.`,
        starterCode: `# ${topic}\n\n## Assumptions\n\n## Proposed approach\n\n## Alternatives and trade-offs\n\n## Validation plan\n`,
        testCases: [],
      },
      agent: {
        personaName: "Noah Singh",
        personaRole: "Staff Engineer",
      },
    }
  }

  return {
    orgSlug: input.orgSlug || "demo",
    exam: {
      ...common,
      problemStatement: `Implement a small, testable solution for ${topic}.\n\nExplain the input contract, choose a data model, handle invalid or boundary input, and call out the complexity of the critical operation. Do not rely on hidden global state.`,
      starterCode: `/**\n * ${topic}\n *\n * Define the input and return contract before implementing.\n */\nexport function solve(input) {\n  // Your implementation\n}\n`,
      testCases: [],
    },
    agent: {
      personaName: "Avery Chen",
      personaRole: "Senior Software Engineer",
    },
  }
}

export function fallbackTenantConfig(orgSlug = "demo"): TenantConfig {
  return {
    orgId: "local-demo",
    orgSlug,
    branding: {
      name: orgSlug === "demo" ? "SimExam Demo" : orgSlug,
      primaryColor: "#6366f1",
      accentColor: "#22c55e",
    },
    exam: {
      type: "coding",
      title: "Production Sort Assessment",
      description: "Debug the module, run it, and adapt when the requirement changes.",
      problemStatement: "Fix the broken inventory sorting module and move to a custom O(n log n) approach after the PM update.",
      starterCode: INITIAL_CODE,
      allowedLanguages: ["javascript"],
      timeLimitSeconds: EXAM_DURATION_SECONDS,
      curveballAtSeconds: 120,
      curveballMessage: CURVEBALL_MESSAGE,
      testCases: [
        { input: [8, 5, 2, 9, 1, 12], expectedOutput: [1, 2, 5, 8, 9, 12] },
        { input: [100, 3, 7, 55], expectedOutput: [3, 7, 55, 100] },
        { input: [], expectedOutput: [] },
      ],
      knowledgeBaseUrls: [],
    },
    agent: {
      personaName: "Alex Chen",
      personaRole: "Senior Engineer",
    },
    rubric: {
      passingScore: 6,
      dimensions: [
        { name: "Technical Accuracy", weight: 0.4, description: "Correctness and edge cases" },
        { name: "Adaptability", weight: 0.25, description: "Response to changing constraints" },
        { name: "Communication", weight: 0.2, description: "Clarity of reasoning" },
        { name: "Efficiency", weight: 0.15, description: "Time and approach quality" },
      ],
    },
  }
}

export function useTenantConfig(orgSlug?: string) {
  const [config, setConfig] = useState<TenantConfig>(() => fallbackTenantConfig(orgSlug))
  const [loading, setLoading] = useState(Boolean(orgSlug))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgSlug) return

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchTenantConfig(orgSlug)
      .then((tenant) => {
        if (!cancelled) setConfig(tenant)
      })
      .catch(() => {
        if (!cancelled) {
          setConfig(fallbackTenantConfig(orgSlug))
          setError(orgSlug === "demo" ? "Using local demo config" : "No active tenant configuration is available")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [orgSlug])

  return { config, loading, error, isFallback: Boolean(error) }
}
