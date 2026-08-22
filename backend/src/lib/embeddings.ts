import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Compute a vector embedding for the given text using Google's text-embedding-004 model.
 * Returns an empty array on failure so callers can safely degrade.
 */
export async function computeEmbedding(text: string): Promise<number[]> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.warn('[Embeddings] GEMINI_API_KEY not set, skipping embedding')
      return []
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
    const result = await model.embedContent(text)
    return result.embedding.values
  } catch (err: any) {
    console.warn('[Embeddings] computeEmbedding failed:', err?.message)
    return []
  }
}
