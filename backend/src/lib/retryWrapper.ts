/**
 * retryWrapper — exponential backoff for Gemini API calls
 *
 * DEMO mode: handles free-tier rate limits gracefully so the demo never crashes.
 * PRODUCTION design: replace with a proper queue worker (BullMQ) that limits
 * concurrency to 50 Gemini calls at a time across all workers.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  label = "Gemini call"
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("429")
      const isLastAttempt = attempt === retries - 1

      if (isRateLimit && !isLastAttempt) {
        const waitMs = 1500 * Math.pow(2, attempt)
        console.warn(`[${label}] Rate limited. Retrying in ${waitMs}ms (attempt ${attempt + 1}/${retries})`)
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }

      if (isLastAttempt) {
        console.error(`[${label}] Failed after ${retries} attempts:`, err?.message)
      }

      throw err
    }
  }
  throw new Error(`[${label}] Max retries exceeded`)
}
