import httpx
from bs4 import BeautifulSoup
from middleware.security import validate_url

async def fetch_url(url: str) -> str:
    if not validate_url(url):
        return ""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            return parse_html(resp.text)
        except Exception:
            return ""

def parse_html(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator=" ")
    return " ".join(text.split())[:5000]

async def fetch_docs(urls: list[str], limit=3) -> list[dict]:
    results = []
    for u in urls[:limit]:
        content = await fetch_url(u)
        if content:
            results.append({"url": u, "title": u, "content": content})
    return results
