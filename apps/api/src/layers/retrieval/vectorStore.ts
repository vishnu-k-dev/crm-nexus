/**
 * In-memory vector store for Basic RAG pipeline.
 * Uses Google Gemini gemini-embedding-001 (free tier).
 * Chunks are loaded from the Wikipedia dataset at startup.
 */

export interface Chunk {
  id: string;
  docTitle: string;
  text: string;
  embedding?: number[];
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

let _chunks: Chunk[] = [];
let _ready = false;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

// Jina AI Embeddings — 1M free tokens/month, no shared quota with TigerGraph ECC
// Get free key at: https://jina.ai → "Get API Key"
const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v2-base-en';  // 768 dims

export async function embedText(texts: string[]): Promise<number[][]> {
  const key = process.env.JINA_API_KEY;
  if (!key) throw new Error('JINA_API_KEY not set — get a free key at https://jina.ai');

  const res = await fetch(JINA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ model: JINA_MODEL, input: texts }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jina embed error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map(d => d.embedding);
}

export function loadChunks(chunks: Chunk[]) {
  _chunks = chunks;
}

export function isReady() { return _ready; }
export function setReady(v: boolean) { _ready = v; }
export function getChunkCount() { return _chunks.length; }

export function search(queryEmbedding: number[], topK = 5): SearchResult[] {
  const scored = _chunks
    .filter(c => c.embedding && c.embedding.length > 0)
    .map(c => ({ chunk: c, score: cosineSimilarity(queryEmbedding, c.embedding!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored;
}
