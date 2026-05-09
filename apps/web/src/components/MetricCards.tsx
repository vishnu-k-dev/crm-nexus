import type { PipelineResult } from '../lib/api';

interface CardProps {
  label: string;
  values: { name: string; v: number; color: string }[];
  fmt: (n: number) => string;
  betterLow?: boolean;
}

function MetricCard({ label, values, fmt, betterLow = true }: CardProps) {
  const best = values.reduce((a, b) =>
    betterLow ? (a.v <= b.v ? a : b) : (a.v >= b.v ? a : b),
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">{label}</div>
      <div className="space-y-2">
        {values.map(({ name, v, color }) => (
          <div key={name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${
            name === best.name ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'bg-slate-800/30'
          }`}>
            <span className={`text-xs font-medium ${color}`}>{name}</span>
            <span className="font-mono text-sm text-slate-200">{fmt(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  llmOnly?: PipelineResult;
  basicRag?: PipelineResult;
  graphrag?: PipelineResult;
}

export function MetricCards({ llmOnly, basicRag, graphrag }: Props) {
  const pipelines = [
    { name: 'LLM-Only',  r: llmOnly,  color: 'text-slate-400' },
    { name: 'Basic RAG', r: basicRag, color: 'text-violet-400' },
    { name: 'GraphRAG',  r: graphrag, color: 'text-emerald-400' },
  ].filter(p => p.r != null) as { name: string; r: PipelineResult; color: string }[];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <MetricCard
        label="Prompt tokens"
        values={pipelines.map(p => ({ name: p.name, v: p.r.promptTokens, color: p.color }))}
        fmt={(n) => n.toLocaleString()}
      />
      <MetricCard
        label="Latency (ms)"
        values={pipelines.map(p => ({ name: p.name, v: p.r.latencyMs, color: p.color }))}
        fmt={(n) => n.toLocaleString()}
      />
      <MetricCard
        label="Cost (USD)"
        values={pipelines.map(p => ({ name: p.name, v: p.r.costUsd, color: p.color }))}
        fmt={(n) => `$${n.toFixed(5)}`}
      />
      <MetricCard
        label="Context (chars)"
        values={pipelines.map(p => ({ name: p.name, v: p.r.contextChars, color: p.color }))}
        fmt={(n) => n.toLocaleString()}
      />
    </div>
  );
}
