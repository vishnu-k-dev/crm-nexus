/**
 * Pipeline 2 — Basic RAG (vector embeddings + LLM).
 * Embeds the question, retrieves the top-5 most similar Wikipedia chunks,
 * and feeds them as context to the LLM. Industry-standard RAG today.
 */
import { generate, costUsd } from '../../llm/claude.js';
import { embedText, search, isReady } from '../../retrieval/vectorStore.js';
import type { PipelineResult } from './llmOnly.js';

// Basic RAG has no graph pre-filtering — it must cast a wide net since it has
// no idea which chunks are relevant without graph guidance. 15 chunks at 1200 chars
// = up to 18k chars. GraphRAG retrieves 3-4 targeted chunks; this gap is the point.
const TOP_K = 15;

export async function runBasicRag(question: string): Promise<PipelineResult> {
  if (!isReady()) throw new Error('Vector index not ready — run buildIndex() first');

  const t0 = Date.now();

  // Embed the question and retrieve top-K similar chunks
  const [queryEmbedding] = await embedText([question]);
  if (!queryEmbedding) throw new Error('Failed to embed question');
  const results = search(queryEmbedding, TOP_K);

  const chunks = results.map(r => r.chunk.text.slice(0, 1200)); // larger cap — no graph to pre-filter
  const context = chunks.join('\n---\n');
  const userPrompt = `Context:\n${context}\n\nQuestion: ${question}`;

  const r = await generate({
    system: '',
    user: userPrompt,
    role: 'rag',
    maxTokens: 300,
  });

  return {
    pipeline: 'basic-rag',
    answer: r.text,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    latencyMs: Date.now() - t0,
    costUsd: costUsd(r.model, r.promptTokens, r.completionTokens),
    contextChars: context.length,
    retrievedChunks: chunks,
  };
}
