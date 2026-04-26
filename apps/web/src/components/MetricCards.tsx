import type { PipelineRun } from '../lib/api';

function pct(a: number, b: number): string {
  if (b === 0) return '—';
  const d = ((a - b) / b) * 100;
  return `${d > 0 ? '+' : ''}${d.toFixed(0)}%`;
}

function Card({ label, baseline, graphrag, fmt, betterLow = true }: {
  label: string;
  baseline: number; graphrag: number;
  fmt: (n: number) => string;
  betterLow?: boolean;
}) {
  const winner = betterLow ? (graphrag < baseline ? 'graphrag' : 'baseline') : (graphrag > baseline ? 'graphrag' : 'baseline');
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className={`rounded-lg p-3 ${winner === 'baseline' ? 'bg-slate-800/60 ring-1 ring-slate-600' : 'bg-slate-800/30'}`}>
          <div className="text-slate-400 text-xs mb-1">Baseline</div>
          <div className="font-mono text-lg">{fmt(baseline)}</div>
        </div>
        <div className={`rounded-lg p-3 ${winner === 'graphrag' ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : 'bg-slate-800/30'}`}>
          <div className="text-emerald-400 text-xs mb-1">GraphRAG</div>
          <div className="font-mono text-lg">{fmt(graphrag)}</div>
        </div>
      </div>
      <div className="text-xs text-slate-500 mt-2">
        delta: <span className={winner === 'graphrag' ? 'text-emerald-400' : 'text-slate-300'}>{pct(graphrag, baseline)}</span>
      </div>
    </div>
  );
}

export function MetricCards({ baseline, graphrag }: { baseline: PipelineRun; graphrag: PipelineRun }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Prompt tokens"   baseline={baseline.promptTokens} graphrag={graphrag.promptTokens} fmt={(n) => n.toLocaleString()} />
      <Card label="Latency (ms)"    baseline={baseline.latencyMs}    graphrag={graphrag.latencyMs}    fmt={(n) => n.toLocaleString()} />
      <Card label="Cost (USD)"      baseline={baseline.costUsd}      graphrag={graphrag.costUsd}      fmt={(n) => `$${n.toFixed(5)}`} />
      <Card label="Context (chars)" baseline={baseline.contextChars} graphrag={graphrag.contextChars} fmt={(n) => n.toLocaleString()} />
    </div>
  );
}
