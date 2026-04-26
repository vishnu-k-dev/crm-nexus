import type { PipelineRun } from '../lib/api';

function Bar({ label, color, value, max }: { label: string; color: string; value: number; max: number }) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={color}>{label}</span>
        <span className="font-mono text-slate-400">{value.toLocaleString()} tok</span>
      </div>
      <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full transition-[width] duration-700 ease-out ${color === 'text-emerald-400' ? 'bg-emerald-500' : 'bg-slate-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function PipelineRace({ baseline, graphrag }: { baseline?: PipelineRun; graphrag?: PipelineRun }) {
  const max = Math.max(baseline?.promptTokens ?? 0, graphrag?.promptTokens ?? 0, 100);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
      <div className="text-sm text-slate-400">Prompt token budget</div>
      <Bar label="Baseline (prompt-stuff)" color="text-slate-300" value={baseline?.promptTokens ?? 0} max={max} />
      <Bar label="GraphRAG (3-hop traversal)" color="text-emerald-400" value={graphrag?.promptTokens ?? 0} max={max} />
    </div>
  );
}
