from schemas.types import ChunkResult
from tools.embedding_store import EmbeddingStore
from ingest.embedder import embed_single

async def retrieve_relevant(query: str, org_id: str, session_id: str = None, k: int = 5, db_url: str = None) -> list[ChunkResult]:
    if not db_url:
        return []
        
    store = EmbeddingStore(db_url)
    query_emb = await embed_single(query)
    
    if not query_emb:
        return []
        
    rows = await store.hybrid_search(query_emb, query, org_id, session_id, k)
    
    results = []
    for r in rows:
        score = r["score"]
        if score > 0.65:
            results.append(ChunkResult(
                content=r["content"],
                score=score,
                metadata=r["metadata"],
                source="rag"
            ))
            
    return results
