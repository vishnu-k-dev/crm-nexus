/**
 * Builds the Basic RAG vector index from Wikipedia articles.
 * Chunks articles into ~800-word segments, embeds with Gemini, stores in memory.
 * Call buildIndex() once at server startup.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadChunks, embedText, setReady, type Chunk } from './vectorStore.js';

const CHUNK_SIZE = 300;   // words per chunk (smaller = fewer tokens per batch)
const CHUNK_OVERLAP = 30; // words overlap
const EMBED_BATCH = 8;    // Jina free tier: stay under 100k tokens/min
// Resolve data dir relative to project root (works from apps/api or root)
const DATA_DIR   = existsSync(join(process.cwd(), 'data'))
  ? join(process.cwd(), 'data')
  : join(process.cwd(), '..', '..', 'data');
const CACHE_PATH = join(DATA_DIR, 'embed_cache.json');
const WIKI_DIR   = join(DATA_DIR, 'wikipedia');

function chunkText(text: string, docTitle: string, docId: number): Chunk[] {
  const words = text.split(/\s+/);
  const chunks: Chunk[] = [];
  let i = 0;
  let chunkIdx = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + CHUNK_SIZE).join(' ');
    if (slice.trim().length > 50) {
      chunks.push({ id: `${docId}_${chunkIdx}`, docTitle, text: slice });
      chunkIdx++;
    }
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

async function embedBatched(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const vecs = await embedText(batch);
    results.push(...vecs);
    if (i + EMBED_BATCH < texts.length) {
      const pct = Math.round((i / texts.length) * 100);
      if (i % (EMBED_BATCH * 10) === 0) console.log(`[index] Embedding progress: ${pct}% (${i}/${texts.length})`);
      await new Promise(r => setTimeout(r, 5000)); // 5s gap → ~8 batches/min → ~12k tokens/min
    }
  }
  return results;
}

export async function buildIndex(forceRebuild = false): Promise<void> {
  // Check cache FIRST — no need for raw wikipedia files if cache exists
  if (!forceRebuild && existsSync(CACHE_PATH)) {
    console.log('[index] Loading vector index from cache…');
    const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Chunk[];
    loadChunks(cached);
    setReady(true);
    console.log(`[index] Loaded ${cached.length} chunks from cache.`);
    return;
  }

  if (!existsSync(WIKI_DIR)) {
    console.warn('[index] Wikipedia data not found and no cache — run scripts/download-wiki.ts first');
    setReady(false);
    return;
  }

  console.log('[index] Building vector index from Wikipedia articles…');
  const files = readdirSync(WIKI_DIR).filter(f => f.endsWith('.txt'));
  const allChunks: Chunk[] = [];

  for (const [i, file] of files.entries()) {
    const text = readFileSync(join(WIKI_DIR, file), 'utf8');
    const title = text.split('\n')[0]?.replace('TITLE: ', '') ?? file;
    const chunks = chunkText(text, title, i);
    allChunks.push(...chunks);
  }

  console.log(`[index] ${files.length} articles → ${allChunks.length} chunks. Embedding…`);

  // Embed in batches
  const texts = allChunks.map(c => c.text);
  const embeddings = await embedBatched(texts);
  for (let i = 0; i < allChunks.length; i++) {
    allChunks[i]!.embedding = embeddings[i];
  }

  writeFileSync(CACHE_PATH, JSON.stringify(allChunks), 'utf8');
  loadChunks(allChunks);
  setReady(true);
  console.log(`[index] Done. ${allChunks.length} chunks embedded and cached.`);
}
