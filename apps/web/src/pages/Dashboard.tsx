/**
 * Benchmark dashboard — shows aggregate results from the 50-question eval set.
 * Reads from GET /api/compare/eval (runs the full eval set — takes ~10 min).
 */
import { useState } from 'react';
import { runFullEval, type EvalResult } from '../lib/api';
import {
  Bar, BarChart, CartesianGrid, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export function Dashboard() {
  const [result, setResult] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startEval() {
    setLoading(true);
    setErr(null);
    try {
      const r = await runFullEval();
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const agg = result?.aggregate;

  const tokenData = agg ? [
    { name: 'LLM-Only',  tokens: agg.avgPromptTokens.llmOnly },
    { name: 'Basic RAG', tokens: agg.avgPromptTokens.basicRag },
    { name: 'GraphRAG',  tokens: agg.avgPromptTokens.graphrag },
  ] : [];

  const passData = agg ? [
    { name: 'LLM-Only',  rate: parseFloat(agg.llmJudgePassRate.llmOnly)  || 0 },
    { name: 'Basic RAG', rate: parseFloat(agg.llmJudgePassRate.basicRag) || 0 },
    { name: 'GraphRAG',  rate: parseFloat(agg.llmJudgePassRate.graphrag) || 0 },
  ] : [];

  const bertData = agg ? [
    { name: 'LLM-Only',  f1: parseFloat(agg.avgBertScoreF1Rescaled.llmOnly)  || 0 },
    { name: 'Basic RAG', f1: parseFloat(agg.avgBertScoreF1Rescaled.basicRag) || 0 },
    { name: 'GraphRAG',  f1: parseFloat(agg.avgBertScoreF1Rescaled.graphrag) || 0 },
  ] : [];

  const latencyData = agg ? [
    { name: 'LLM-Only',  ms: agg.avgLatencyMs.llmOnly },
    { name: 'Basic RAG', ms: agg.avgLatencyMs.basicRag },
    { name: 'GraphRAG',  ms: agg.avgLatencyMs.graphrag },
  ] : [];

  const rows = result?.results ?? [];

  const COLORS: Record<string, string> = {
    'LLM-Only':  '#64748b',
    'Basic RAG': '#7c3aed',
    'GraphRAG':  '#10b981',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Benchmark dashboard</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              50-question eval set drawn from 547 Wikipedia tech articles.
              All 3 pipelines use the same{' '}
              <span className="font-mono text-slate-300">llama-3.3-70b-versatile</span> model.
              Quality judged by{' '}
              <span className="font-mono text-slate-300">gemma2-9b-it</span>{' '}
              (independent model family).
            </p>
          </div>
          <button
            onClick={startEval}
            disabled={loading}
            className="px-5 py-2 rounded-md bg-emerald-500 text-slate-950 text-sm font-medium hover:bg-emerald-400 disabled:opacity-40 transition whitespace-nowrap"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-slate-800 border-t-transparent rounded-full animate-spin" />
                Running eval… (~15 min)
              </span>
            ) : 'Run 50-question eval →'}
          </button>
        </div>
        {loading && (
          <div className="mt-3 text-xs text-slate-500 bg-slate-900/60 rounded-md px-3 py-2">
            Running 50 questions × 3 pipelines + LLM judge + BERTScore. Keep this tab open.
          </div>
        )}
        {err && <div className="mt-3 text-sm text-red-400">{err}</div>}
      </section>

      {!result && !loading && (
        <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center space-y-2">
          <div className="text-slate-500 text-sm">No eval results yet.</div>
          <div className="text-slate-600 text-xs">
            Make sure the API is running, the Wikipedia index is loaded, and TigerGraph is up, then click Run.
          </div>
        </div>
      )}

      {result && agg && (
        <>
          {/* Key numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Token reduction',
                value: agg.tokenReductionVsBasic,
                color: 'text-emerald-400',
                sub: `${agg.avgPromptTokens.basicRag} → ${agg.avgPromptTokens.graphrag} avg tokens`,
              },
              {
                label: 'GraphRAG pass rate',
                value: agg.llmJudgePassRate.graphrag,
                color: 'text-emerald-400',
                sub: `Basic RAG: ${agg.llmJudgePassRate.basicRag}`,
              },
              {
                label: 'GraphRAG BERTScore F1',
                value: agg.avgBertScoreF1Rescaled.graphrag,
                color: parseFloat(agg.avgBertScoreF1Rescaled.graphrag) >= 0.55
                  ? 'text-emerald-400' : 'text-amber-400',
                sub: `Target ≥ 0.55`,
              },
              {
                label: 'GraphRAG first-place wins',
                value: `${agg.firstPlaceWins.graphrag} / ${result.n}`,
                color: 'text-emerald-400',
                sub: `Basic RAG: ${agg.firstPlaceWins.basicRag}, LLM-Only: ${agg.firstPlaceWins.llm}`,
              },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</div>
                <div className={`text-3xl font-mono font-bold ${color}`}>{value}</div>
                {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Avg prompt tokens (lower = better)">
              <BarChart data={tokenData}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
                <Bar dataKey="tokens" radius={[4, 4, 0, 0]}
                  fill="#10b981"
                  label={{ position: 'top', fill: '#94a3b8', fontSize: 10 }}
                  isAnimationActive
                >
                  {tokenData.map((entry) => (
                    <rect key={entry.name} fill={COLORS[entry.name] ?? '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>

            <ChartCard title="LLM judge pass rate % (higher = better)">
              <BarChart data={passData}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}
                  label={{ position: 'top', fill: '#94a3b8', fontSize: 10 }}
                  isAnimationActive
                >
                  {passData.map((entry) => (
                    <rect key={entry.name} fill={COLORS[entry.name] ?? '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>

            <ChartCard title="BERTScore F1 rescaled (target ≥ 0.55)">
              <BarChart data={bertData}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis domain={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
                <Bar dataKey="f1" radius={[4, 4, 0, 0]}
                  label={{ position: 'top', fill: '#94a3b8', fontSize: 10, formatter: (v: number) => v.toFixed(3) }}
                  isAnimationActive
                >
                  {bertData.map((entry) => (
                    <rect key={entry.name} fill={COLORS[entry.name] ?? '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>

            <ChartCard title="Avg latency ms">
              <BarChart data={latencyData}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
                <Bar dataKey="ms" radius={[4, 4, 0, 0]}
                  label={{ position: 'top', fill: '#94a3b8', fontSize: 10 }}
                  isAnimationActive
                >
                  {latencyData.map((entry) => (
                    <rect key={entry.name} fill={COLORS[entry.name] ?? '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>
          </div>

          {/* Per-question table */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
            <div className="text-sm font-medium text-slate-300">Per-question results</div>
            <div className="overflow-auto max-h-96 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-slate-500 text-left">
                    <th className="py-2 pr-4 font-medium w-8">#</th>
                    <th className="py-2 pr-4 font-medium">Question</th>
                    <th className="py-2 pr-2 font-medium text-slate-400">LLM judge</th>
                    <th className="py-2 pr-4 font-medium text-violet-400">Basic RAG judge</th>
                    <th className="py-2 pr-4 font-medium text-violet-400">Basic tokens</th>
                    <th className="py-2 pr-4 font-medium text-emerald-400">GraphRAG judge</th>
                    <th className="py-2 pr-4 font-medium text-emerald-400">Graph tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const lJudge = (row.llmOnly  as { judge?: { verdict: string } } | undefined)?.judge;
                    const bJudge = (row.basicRag as { judge?: { verdict: string } } | undefined)?.judge;
                    const gJudge = (row.graphrag as { judge?: { verdict: string } } | undefined)?.judge;
                    const verdictBadge = (v?: string) => v ? (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        v === 'PASS' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                      }`}>{v}</span>
                    ) : <span className="text-slate-600">—</span>;
                    return (
                      <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/30 transition">
                        <td className="py-2 pr-4 text-slate-500">{i + 1}</td>
                        <td className="py-2 pr-4 max-w-[240px] text-slate-300 leading-snug">{row.question}</td>
                        <td className="py-2 pr-2">{verdictBadge(lJudge?.verdict)}</td>
                        <td className="py-2 pr-4">{verdictBadge(bJudge?.verdict)}</td>
                        <td className="py-2 pr-4 font-mono text-slate-400">
                          {row.basicRag?.promptTokens?.toLocaleString() ?? '—'}
                        </td>
                        <td className="py-2 pr-4">{verdictBadge(gJudge?.verdict)}</td>
                        <td className="py-2 pr-4 font-mono text-slate-400">
                          {row.graphrag?.promptTokens?.toLocaleString() ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">{title}</div>
      <div className="h-52">
        <ResponsiveContainer>{children as React.ReactElement}</ResponsiveContainer>
      </div>
    </div>
  );
}
