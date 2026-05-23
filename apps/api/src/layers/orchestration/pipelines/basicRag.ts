/**
 * Pipeline 2 — Basic RAG (vector embeddings + LLM).
 * Embeds the question, retrieves the top-K most similar chunks,
 * and feeds them as context to the LLM.
 */
import { generate, costUsd } from '../../llm/claude.js';
import { embedText, search, isReady } from '../../retrieval/vectorStore.js';
import type { PipelineResult } from './llmOnly.js';

const TOP_K = 20;
const CHAR_CAP = 1000;

export async function runBasicRag(question: string): Promise<PipelineResult> {
  if (!isReady()) throw new Error('Vector index not ready — run buildIndex() first');

  const t0 = Date.now();

  const [queryEmbedding] = await embedText([question]);
  if (!queryEmbedding) throw new Error('Failed to embed question');
  const results = search(queryEmbedding, TOP_K);

  const chunks = results.map(r => r.chunk.text.slice(0, CHAR_CAP));
  const context = chunks.join('\n---\n');
  const userPrompt = `${context}\n${question}`;

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
