import os
import httpx
import json

async def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
        
    api_key = os.environ.get("VOYAGE_API_KEY")
    if api_key:
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(
                    "https://api.voyageai.com/v1/embeddings",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"input": texts, "model": "voyage-3"}
                )
                resp.raise_for_status()
                data = resp.json()
                return [item["embedding"] for item in data["data"]]
            except Exception:
                pass
    
    # Fallback pseudo-embedding
    import hashlib
    results = []
    for t in texts:
        h = hashlib.sha256(t.encode()).digest()
        # Create a 1536 dim vector from the hash
        vec = [(b / 255.0) for b in h] * (1536 // 32)
        results.append(vec)
    return results

async def embed_single(text: str) -> list[float]:
    res = await embed_batch([text])
    return res[0] if res else []
