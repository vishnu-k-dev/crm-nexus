import type { PipelineResult } from '../lib/api';

function TokenBar({ label, color, value, max, badge, highlight }: {
  label: string;
  color: string;
  value: number;
  max: number;
  badge?: string;
  highlight?: boolean;
}) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className={`space-y-1 rounded-lg p-3 transition ${highlight ? 'bg-emerald-500/5 ring-1 ring-emerald-500/20' : ''}`}>
      <div className="flex justify-between items-center text-xs">
        <span className={`font-medium flex items-center gap-2 ${color}`}>
          {label}
          {badge && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">{badge}</span>
          )}
          {highlight && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold">
              Best efficiency
            </span>
          )}
        </span>
        <span className="font-mono text-slate-300 font-semibold">{value.toLocaleString()} tok</span>
      </div>
      <div className="h-4 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            color === 'text-emerald-400' ? 'bg-emerald-500' :
            color === 'text-violet-400'  ? 'bg-violet-500'  : 'bg-slate-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function LatencyBreakdown({ graphrag, basicRag, llmOnly }: {
  graphrag?: PipelineResult;
  basicRag?: PipelineResult;
  llmOnly?: PipelineResult;
}) {
  const tgMs    = graphrag?.tgLatencyMs   ?? 0;
  const groqMs  = graphrag?.groqLatencyMs ?? 0;
  const otherMs = Math.max(0, (graphrag?.latencyMs ?? 0) - tgMs - groqMs);

  return (
    <div className="grid grid-cols-3 gap-2 pt-1">
      {/* LLM-Only */}
      <div className="rounded-lg bg-slate-800/40 p-2.5 text-center space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">LLM-Only</div>
        <div className="font-mono text-sm text-slate-200">
          {llmOnly?.latencyMs != null ? `${llmOnly.latencyMs.toLocaleString()} ms` : '—'}
        </div>
        <div className="text-[10px] text-slate-600">no retrieval</div>
      </div>

      {/* Basic RAG */}
      <div className="rounded-lg bg-slate-800/40 p-2.5 text-center space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-violet-400">Basic RAG</div>
        <div className="font-mono text-sm text-slate-200">
          {basicRag?.latencyMs != null ? `${basicRag.latencyMs.toLocaleString()} ms` : '—'}
        </div>
        <div className="text-[10px] text-slate-600">vector search</div>
      </div>

      {/* GraphRAG — broken down */}
      <div className="rounded-lg bg-emerald-500/5 ring-1 ring-emerald-500/20 p-2.5 text-center space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-emerald-400">GraphRAG</div>
        <div className="font-mono text-sm text-slate-200">
          {graphrag?.latencyMs != null ? `${graphrag.latencyMs.toLocaleString()} ms` : '—'}
        </div>
        {tgMs > 0 && (
          <div className="text-[10px] text-slate-500 leading-tight space-y-0.5">
            <div>Graph traversal: {tgMs.toLocaleString()} ms</div>
            <div>LLM generation: {groqMs.toLocaleString()} ms</div>
            {otherMs > 200 && <div>Queue/other: {otherMs.toLocaleString()} ms</div>}
          </div>
        )}
        <div className="text-[10px] text-emerald-600">{graphrag?.numHops ?? 2}-hop traversal</div>
      </div>
    </div>
  );
}

interface Props {
  llmOnly?: PipelineResult;
  basicRag?: PipelineResult;
  graphrag?: PipelineResult;
}

export function PipelineRace({ llmOnly, basicRag, graphrag }: Props) {
  const max = Math.max(
    llmOnly?.promptTokens  ?? 0,
    basicRag?.promptTokens ?? 0,
    graphrag?.promptTokens ?? 0,
    100,
  );

  const bTokens = (basicRag?.promptTokens  ?? 0) + (basicRag?.completionTokens  ?? 0);
  const gTokens = (graphrag?.promptTokens  ?? 0) + (graphrag?.completionTokens  ?? 0);
  const reduction = bTokens > 0
    ? (((bTokens - gTokens) / bTokens) * 100).toFixed(1)
    : null;

  const costSaving = basicRag && graphrag
    ? (((basicRag.costUsd - graphrag.costUsd) / basicRag.costUsd) * 100).toFixed(0)
    : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-5">

      {/* Impact summary */}
      {reduction && (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-4 py-3 flex flex-wrap gap-4 items-center">
          <span className="text-xs uppercase tracking-widest text-emerald-500 font-semibold">GraphRAG impact</span>
          <span className="text-emerald-300 font-mono text-sm font-bold">↓ {reduction}% tokens</span>
          {costSaving && <span className="text-emerald-300 font-mono text-sm font-bold">↓ {costSaving}% cost</span>}
          <span className="text-slate-500 text-xs ml-auto">
            Graph structure eliminates redundant context
          </span>
        </div>
      )}

      {/* Token bars — the hero */}
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-3 flex items-center justify-between">
          <span>Prompt tokens</span>
          <span className="text-slate-600 normal-case">lower = cheaper + faster LLM</span>
        </div>
        <div className="space-y-2">
          <TokenBar
            label="LLM-Only"
            color="text-slate-400"
            value={llmOnly?.promptTokens ?? 0}
            max={max}
            badge="no retrieval"
          />
          <TokenBar
            label="Basic RAG"
            color="text-violet-400"
            value={basicRag?.promptTokens ?? 0}
            max={max}
            badge="top-5 cosine"
          />
          <TokenBar
            label="GraphRAG"
            color="text-emerald-400"
            value={graphrag?.promptTokens ?? 0}
            max={max}
            badge={graphrag?.numHops ? `${graphrag.numHops}-hop TigerGraph` : 'TigerGraph'}
            highlight
          />
        </div>
      </div>

      {/* Latency breakdown */}
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
          Latency — GraphRAG spends time on traversal, saves it on LLM
        </div>
        <LatencyBreakdown graphrag={graphrag} basicRag={basicRag} llmOnly={llmOnly} />
      </div>
    </div>
  );
}
