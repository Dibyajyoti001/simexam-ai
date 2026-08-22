import { useEffect, useState } from "react"
import { CURVEBALL_MESSAGE, EXAM_DURATION_SECONDS, INITIAL_CODE } from "../lib/constants"
import { fetchTenantConfig } from "../lib/api"
import { TenantConfig } from "../types/index"

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
          setError("Using local demo config")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [orgSlug])

  return { config, loading, error }
}
