// LLM Layer — public surface.
// Owns: model selection (gen vs judge), token accounting, prompt caching.
// Depends on: external Anthropic SDK only. NO knowledge of graph or pipelines.
export { generate, judge, costUsd, type LLMResult } from './claude.js';
