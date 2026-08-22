import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai"
import { EvaluateRequestBody } from "../types/index.js"

const EVALUATOR_SYSTEM_PROMPT = `You are a silent, impartial technical examiner. You observed a software engineering practical assessment. You receive the full conversation transcript, the student's code submissions, and metadata.

Your ONLY job: output a precise JSON evaluation. Be honest. Base every score on specific evidence. Do not inflate.

Scoring guide:
- 8–10: Exceptional, would hire immediately
- 6–7: Solid, meets expectations
- 4–5: Borderline, significant gaps
- 1–3: Not ready for this role

The passed field is true ONLY if technicalAccuracy >= 6 AND adaptability >= 5.`

const EVALUATION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    technicalAccuracy: {
      type: SchemaType.NUMBER,
      description: "1–10. Did they fix the actual bug? Does the final code produce correct output for all test cases?",
    },
    adaptability: {
      type: SchemaType.NUMBER,
      description: "1–10. Did they address the O(n log n) constraint from the PM? Did they pivot approach after the curveball?",
    },
    communication: {
      type: SchemaType.NUMBER,
      description: "1–10. Did they ask clarifying questions before diving in? Did they explain reasoning? Clear articulation?",
    },
    efficiency: {
      type: SchemaType.NUMBER,
      description: "1–10. How quickly did they identify the bug? Systematic or scattered approach? Time well used?",
    },
    overallFeedback: {
      type: SchemaType.STRING,
      description: "2–3 sentences. Specific, reference actual things they said/did. Honest and constructive tone.",
    },
    strengths: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Exactly 2 specific strengths. Reference concrete moments from the transcript.",
    },
    improvements: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Exactly 2 specific improvement areas. Actionable, not vague.",
    },
    passed: {
      type: SchemaType.BOOLEAN,
      description: "True only if technicalAccuracy >= 6 AND adaptability >= 5.",
    },
  },
  required: [
    "technicalAccuracy",
    "adaptability",
    "communication",
    "efficiency",
    "overallFeedback",
    "strengths",
    "improvements",
    "passed",
  ],
}

export function createEvaluatorModel(apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: EVALUATOR_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: EVALUATION_SCHEMA as any,
      temperature: 0.15,
      maxOutputTokens: 1000,
    },
  })
}

export function buildEvaluationPrompt(body: EvaluateRequestBody): string {
  const finalCode = body.codeSnapshots[body.codeSnapshots.length - 1] || "(no code submitted)"
  const minutes = Math.floor(body.timeElapsedSeconds / 60)
  const seconds = body.timeElapsedSeconds % 60

  return `ASSESSMENT METADATA:
Student: ${body.studentName}
Time elapsed: ${minutes}m ${seconds}s (out of 10 minutes)
Curveball fired: ${body.curveballFired}
Curveball addressed in final code: ${body.curveballAddressed}
Total code submissions: ${body.codeSnapshots.length}

FINAL CODE SUBMISSION:
\`\`\`javascript
${finalCode}
\`\`\`

CODE PROGRESSION (all submissions in order):
${body.codeSnapshots.map((s, i) => `--- Submission ${i + 1} ---\n${s}`).join("\n\n")}

FULL CONVERSATION TRANSCRIPT:
${body.conversationHistory}

Evaluate this student based on the above evidence.`
}
