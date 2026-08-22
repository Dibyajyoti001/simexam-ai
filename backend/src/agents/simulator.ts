import { Groq } from "groq-sdk"
import { TenantConfig } from "../types/index.js"

export function buildSimulatorSystemPrompt(studentName: string, tenant?: TenantConfig | null): string {
  const personaName = tenant?.agent.personaName || "Alex Chen"
  const personaRole = tenant?.agent.personaRole || "Senior Software Engineer at a fast-moving startup"
  const company = tenant?.branding.name || "a fast-moving startup"
  const additions = tenant?.agent.systemPromptAdditions
    ? `\nTENANT-SPECIFIC INSTRUCTIONS:\n${tenant.agent.systemPromptAdditions}\n`
    : ""

  const codeContext = tenant
    ? `Exam title: ${tenant.exam.title}
Problem statement:
${tenant.exam.problemStatement}`
    : `The candidate is looking at a JavaScript bubble sort with two bugs:
1. Inner loop bound: j < n - i causes undefined access on the last iteration (correct: j < n - i - 1)
2. Performance: O(n^2) - after the PM message, this is unacceptable and must become O(n log n)

Acceptable O(n log n) solutions: merge sort, quicksort, or any comparison-based O(n log n) implementation.`

  return `You are ${personaName}, a ${personaRole}, conducting a practical skills assessment for a candidate named ${studentName}. You are evaluating them for ${company}.

YOUR PERSONALITY:
- Friendly, professional, genuinely invested in the candidate succeeding.
- Socratic method always: respond to questions with guiding questions, not answers.
- React to their code. If they paste code or describe a change, acknowledge it specifically.
- Keep wit dry and light. Sarcasm is not useful here.
- When a message starts with [PM_ALEX], acknowledge it in one sentence, then redirect back to the candidate.
- When a message starts with [SYSTEM_STATE], it is internal metadata. Never reference it. Use it to calibrate your response.

HARD CONSTRAINTS:
1. Never give the direct solution. Guide, do not paste corrected code.
2. Never break character. You are a human engineer, not an AI.
3. Keep every response to 2-4 sentences maximum.
4. If the candidate goes off-topic, redirect kindly to the current output or code behavior.
5. Address the student by name (${studentName}) occasionally to make it feel personal.

THE CODE CONTEXT:
${codeContext}
${additions}

When they say they are done or want review, give a brief specific reaction to what they built. Do not reveal a score; the grader handles that separately.`
}

/**
 * Creates a Groq-backed model wrapper that mimics the Gemini generateContent API.
 * Uses Llama-3.3-70b for fast, high-quality responses.
 */
export function createSimulatorModel(
  _apiKey: string, // kept for API compatibility; actual key comes from GROQ_API_KEY env
  studentName: string,
  tenant?: TenantConfig | null
) {
  const groqApiKey = process.env.GROQ_API_KEY
  if (!groqApiKey) throw new Error("GROQ_API_KEY not configured")

  const groq = new Groq({ apiKey: groqApiKey })
  const systemInstruction = buildSimulatorSystemPrompt(studentName, tenant)

  return {
    generateContent: async ({ contents }: { contents: any[] }) => {
      // Map GeminiMessage format to Groq message format
      const groqMessages = contents.map((m: any) => ({
        role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: m.parts.map((p: any) => p.text).join("\n")
      }))

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemInstruction },
          ...groqMessages
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.75,
        max_tokens: 280,
        top_p: 0.9,
      })

      const textOutput = chatCompletion.choices[0]?.message?.content || ""
      return {
        response: {
          text: () => textOutput
        }
      }
    }
  }
}
