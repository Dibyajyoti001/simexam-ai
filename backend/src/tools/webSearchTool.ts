export interface WebSearchResult {
  title: string
  url: string
  content: string
}

export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  if (!process.env.TAVILY_API_KEY) return []

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: 3,
      search_depth: "basic",
    }),
  })

  if (!response.ok) {
    throw new Error(`Tavily returned ${response.status}`)
  }

  const payload = await response.json() as { results?: WebSearchResult[] }
  return payload.results || []
}
