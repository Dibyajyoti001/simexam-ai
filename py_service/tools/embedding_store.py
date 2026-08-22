import asyncpg

class EmbeddingStore:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.pool = None

    async def _get_pool(self):
        if self.pool is None:
            self.pool = await asyncpg.create_pool(self.database_url)
        return self.pool

    async def insert_chunks(self, chunks, embeddings, doc_id, org_id, session_id=None):
        if not self.database_url:
            return
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            for chunk, emb in zip(chunks, embeddings):
                await conn.execute(
                    """
                    INSERT INTO doc_chunks (doc_id, org_id, session_id, chunk_index, content, embedding, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    doc_id, org_id, session_id, chunk.index, chunk.content, str(emb), "{}"
                )

    async def vector_search(self, query_embedding, org_id, session_id=None, k=10):
        if not self.database_url:
            return []
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            query = """
                SELECT content, 1 - (embedding <=> $1) as score, metadata
                FROM doc_chunks
                WHERE org_id = $2
                ORDER BY embedding <=> $1
                LIMIT $3
            """
            rows = await conn.fetch(query, str(query_embedding), org_id, k)
            return rows

    async def hybrid_search(self, query_embedding, query_text, org_id, session_id=None, k=5):
        # Fallback to vector search for now
        return await self.vector_search(query_embedding, org_id, session_id, k)
