/**
 * Pipeline 1 — LLM-Only (worst-case baseline).
 * No retrieval. Question goes directly to the LLM with zero context.
 * Establishes the floor for token count and answer quality.
 */
import { generate, costUsd } from '../../llm/claude.js';

export interface PipelineResult {
  pipeline: string;
  answer: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costUsd: number;
  contextChars: number;
  retrievedChunks: string[];  // empty for LLM-Only
}

export async function runLlmOnly(question: string): Promise<PipelineResult> {
  const t0 = Date.now();
  const r = await generate({
    system: '',
    user: question,
    role: 'llm',
    maxTokens: 512,
  });
  return {
    pipeline: 'llm-only',
    answer: r.text,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    latencyMs: Date.now() - t0,
    costUsd: costUsd(r.model, r.promptTokens, r.completionTokens),
    contextChars: question.length,
    retrievedChunks: [],
  };
}
