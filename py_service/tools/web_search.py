import os
import httpx

async def search_web(query: str, max_results=3) -> list[dict]:
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return []
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": api_key, "query": query, "max_results": max_results}
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for item in data.get("results", []):
                results.append({
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "content": item.get("content", "")
                })
            return results
        except Exception:
            return []
