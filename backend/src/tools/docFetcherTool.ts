import * as cheerio from "cheerio"
import got from "got"

export interface DocFetchResult {
  url: string
  title: string
  text: string
}

export async function fetchDocs(urls: string[], limit = 2): Promise<DocFetchResult[]> {
  const safeUrls = urls.filter(Boolean).slice(0, limit)
  const results: DocFetchResult[] = []

  for (const url of safeUrls) {
    try {
      const html = await got(url, { timeout: { request: 6000 } }).text()
      const $ = cheerio.load(html)
      $("script, style, nav, footer, header").remove()
      const title = $("title").first().text().trim() || url
      const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 2400)
      if (text) results.push({ url, title, text })
    } catch (err: any) {
      console.warn("[DocFetcher] Skipped:", url, err?.message)
    }
  }

  return results
}
