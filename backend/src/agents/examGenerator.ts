import { Groq } from "groq-sdk"
import { TenantConfig } from "../types/index.js"

export interface GenerateExamOptions {
  prompt: string
  domain?: string
  seniority?: string
  assessmentType?: "coding" | "system_design" | "conceptual" | "multiple_choice"
  allowedLanguages?: string[]
  docText?: string
  orgSlug?: string
  orgName?: string
}

/**
 * Generates a complete, domain-agnostic, production-grade assessment configuration
 * using Groq Llama-3.3-70B.
 */
export async function generateExamConfig(options: GenerateExamOptions): Promise<Partial<TenantConfig>> {
  const groqApiKey = process.env.GROQ_API_KEY
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is required for dynamic exam generation")
  }

  const groq = new Groq({ apiKey: groqApiKey })

  const domain = options.domain || "Software Engineering"
  const seniority = options.seniority || "Senior"
  const type = options.assessmentType || "coding"
  const languages = options.allowedLanguages && options.allowedLanguages.length > 0
    ? options.allowedLanguages
    : ["javascript", "typescript", "python"]

  const systemPrompt = `You are SimExam AI's Principal Assessment Architect.
Your task is to design an authentic, rigorous, domain-agnostic technical assessment based on the user's prompt, requirements, or uploaded documentation.

CRITICAL PRINCIPLES:
1. Authentic Engineering Challenges: No generic LeetCode fizzbuzz unless explicitly requested. Create practical scenarios (e.g. debugging a concurrency race condition, building a rate-limiter, designing a fault-tolerant cache, migrating schema, or optimizing algorithmic bottleneck).
2. Socratic Persona: Create an empathetic, razor-sharp technical interviewer persona who conducts the assessment.
3. Realistic Dynamic Curveball: Formulate a mid-exam constraint change (e.g. "Traffic just increased 100x — memory is now capped at 128MB. How does your design pivot?").
4. Multi-Dimensional Rubric: Create 4 clear dimensions with balanced weights that sum to 1.0.

You MUST reply ONLY with valid JSON conforming to this exact structure:
{
  "title": "Clear, professional assessment title",
  "description": "2-3 sentence overview of the challenge and goals",
  "problemStatement": "Detailed specification with instructions, constraints, and requirements",
  "starterCode": "Realistic starter code, template, or markdown boilerplate ready for candidate to work in",
  "allowedLanguages": ["javascript", "typescript", "python"],
  "timeLimitSeconds": 600,
  "curveballAtSeconds": 180,
  "curveballMessage": "The constraint change message that injects dynamically mid-assessment",
  "testCases": [
    { "input": "input data / args", "expectedOutput": "expected output / return", "hidden": false },
    { "input": "edge case input", "expectedOutput": "expected edge case return", "hidden": true }
  ],
  "agentPersona": {
    "personaName": "Interviewer Name (e.g. Alex Chen, Maya Lin, Dr. Marcus Ross)",
    "personaRole": "Specific Role (e.g. Staff Distributed Systems Engineer)",
    "systemPromptAdditions": "Specialized Socratic evaluation instructions for this domain"
  },
  "rubric": {
    "passingScore": 6,
    "dimensions": [
      { "name": "Technical Accuracy", "weight": 0.35, "description": "Correctness, error handling, and algorithmic soundness" },
      { "name": "Adaptability", "weight": 0.25, "description": "How candidate responds to the mid-exam curveball constraint" },
      { "name": "System & Code Quality", "weight": 0.20, "description": "Architecture, modularity, and clean structure" },
      { "name": "Communication", "weight": 0.20, "description": "Clarity of reasoning and interactive problem-solving" }
    ]
  }
}`

  const userContent = `Generate an assessment with the following parameters:
- Target Domain: ${domain}
- Target Seniority: ${seniority}
- Assessment Type: ${type}
- Allowed Languages: ${languages.join(", ")}
- Prompt / Requirements: ${options.prompt}
${options.docText ? `\n--- SOURCE DOCUMENT EXCERPT ---\n${options.docText.slice(0, 3000)}\n--- END EXCERPT ---` : ""}`

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: 0.6,
    max_tokens: 2200,
    response_format: { type: "json_object" }
  })

  const rawJson = response.choices[0]?.message?.content || "{}"
  const parsed = JSON.parse(rawJson)

  return {
    exam: {
      type: type,
      title: parsed.title || "Custom Practical Assessment",
      description: parsed.description || "Interactive problem-solving simulation.",
      problemStatement: parsed.problemStatement || "Implement the solution according to specifications.",
      starterCode: parsed.starterCode || "// Write your solution here\n",
      allowedLanguages: parsed.allowedLanguages || languages,
      timeLimitSeconds: parsed.timeLimitSeconds || 600,
      curveballAtSeconds: parsed.curveballAtSeconds || 180,
      curveballMessage: parsed.curveballMessage || "The constraints have been updated.",
      testCases: parsed.testCases || [],
      knowledgeBaseUrls: []
    },
    agent: {
      personaName: parsed.agentPersona?.personaName || "Alex Chen",
      personaRole: parsed.agentPersona?.personaRole || "Senior Staff Engineer",
      systemPromptAdditions: parsed.agentPersona?.systemPromptAdditions || ""
    },
    rubric: {
      passingScore: parsed.rubric?.passingScore || 6,
      dimensions: parsed.rubric?.dimensions || [
        { name: "Technical Accuracy", weight: 0.35, description: "Correctness and reliability" },
        { name: "Adaptability", weight: 0.25, description: "Response to changing requirements" },
        { name: "Code & Design Quality", weight: 0.20, description: "Structure and maintainability" },
        { name: "Communication", weight: 0.20, description: "Clarity of reasoning" }
      ]
    }
  }
}
