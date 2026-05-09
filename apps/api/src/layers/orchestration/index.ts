// Inference Orchestration Layer — public surface.
// Owns: deciding when to traverse the graph vs. call the LLM directly,
// composing prompts from filtered context, running pipelines side-by-side for benchmarking.
// Depends on: graph + llm layers. NEVER imported by graph or llm.
export { route, decide, type Decision, type RouteResult } from './router.js';
export { runBaseline, type PipelineResult } from './pipelines/baseline.js';
export { runGraphRag } from './pipelines/graphrag.js';
