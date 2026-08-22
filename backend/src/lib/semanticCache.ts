import { dbQuery, hasDatabase } from './db.js';

interface CachedResponse {
  query: string;
  response: string;
  embedding?: number[];
  similarity?: number;
}

export class SemanticCache {
  /**
   * Search for a similar query in the cache.
   */
  static async search(query: string, orgId: string, embedding?: number[], threshold = 0.85): Promise<CachedResponse | null> {
    if (!hasDatabase()) return null;

    try {
      // Exact match fallback
      const exactRes = await dbQuery(
        'SELECT query, response, embedding FROM semantic_cache WHERE query = $1 AND org_id = $2 LIMIT 1',
        [query, orgId]
      );
      if (exactRes && exactRes.rows.length > 0) {
        return {
          query: exactRes.rows[0].query,
          response: exactRes.rows[0].response,
          embedding: exactRes.rows[0].embedding,
          similarity: 1.0,
        };
      }
      
      // For vector search
      if (embedding && embedding.length > 0) {
        const vectorRes = await dbQuery(
          'SELECT query, response, embedding, 1 - (embedding <=> $1::vector) as similarity FROM semantic_cache WHERE org_id = $2 AND embedding <=> $1::vector < $3 ORDER BY embedding <=> $1::vector ASC LIMIT 1',
          [JSON.stringify(embedding), orgId, 1 - threshold]
        );
        
        if (vectorRes && vectorRes.rows.length > 0) {
          return {
            query: vectorRes.rows[0].query,
            response: vectorRes.rows[0].response,
            embedding: vectorRes.rows[0].embedding,
            similarity: vectorRes.rows[0].similarity,
          };
        }
      }
    } catch (err: any) {
      console.warn("[SemanticCache] search failed:", err?.message);
    }
    
    return null;
  }

  /**
   * Store a response in the cache
   */
  static async store(query: string, response: string, orgId: string, embedding?: number[]): Promise<void> {
    if (!hasDatabase()) return;

    try {
      const embValue = embedding && embedding.length > 0 ? JSON.stringify(embedding) : null;
      await dbQuery(
        'INSERT INTO semantic_cache (org_id, query, response, embedding) VALUES ($1, $2, $3, $4)',
        [orgId, query, response, embValue]
      );
    } catch (err: any) {
      console.warn("[SemanticCache] store failed:", err?.message);
    }
  }
}
