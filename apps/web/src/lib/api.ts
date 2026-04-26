export interface PipelineRun {
  pipeline: 'baseline' | 'graphrag';
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costUsd: number;
  contextChars: number;
  questions: { text: string; difficulty: number }[];
  graphTrace?: {
    domains: { v_id: string }[];
    techs: { name: string }[];
    markers: { v_id: string; attributes: { text: string } }[];
    questions: { v_id: string; attributes: { text: string } }[];
  };
}

export async function ask(repoUrl: string, resume = ''): Promise<{ baseline: PipelineRun; graphrag: PipelineRun }> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl, resume, mode: 'both' }),
  });
  if (!res.ok) throw new Error(`ask failed: ${res.status}`);
  return res.json();
}

export interface BenchAggregate {
  pipeline: 'baseline' | 'graphrag';
  n: number;
  avg_prompt_tokens: number;
  avg_completion_tokens: number;
  avg_latency_ms: number;
  avg_cost_usd: number;
}

export async function benchResults(runId?: string): Promise<{ aggregate: BenchAggregate[]; judgements: { winner: string; n: number }[] }> {
  const url = runId ? `/api/bench/results?runId=${encodeURIComponent(runId)}` : '/api/bench/results';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bench failed: ${res.status}`);
  return res.json();
}
