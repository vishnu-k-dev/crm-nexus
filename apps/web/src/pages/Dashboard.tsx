import { useEffect, useState } from 'react';
import { benchResults, type BenchAggregate } from '../lib/api';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function Dashboard() {
  const [agg, setAgg] = useState<BenchAggregate[]>([]);
  const [judge, setJudge] = useState<{ winner: string; n: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    benchResults()
      .then((r) => { setAgg(r.aggregate); setJudge(r.judgements); })
      .catch((e) => setErr((e as Error).message));
  }, []);

  const baseline = agg.find((a) => a.pipeline === 'baseline');
  const graphrag = agg.find((a) => a.pipeline === 'graphrag');
  const tokenChart = baseline && graphrag ? [
    { metric: 'Prompt tokens',    Baseline: baseline.avg_prompt_tokens, GraphRAG: graphrag.avg_prompt_tokens },
    { metric: 'Completion tokens',Baseline: baseline.avg_completion_tokens, GraphRAG: graphrag.avg_completion_tokens },
  ] : [];
  const latencyChart = baseline && graphrag ? [
    { metric: 'Latency (ms)', Baseline: baseline.avg_latency_ms, GraphRAG: graphrag.avg_latency_ms },
  ] : [];
  const costChart = baseline && graphrag ? [
    { metric: 'Cost (USD)', Baseline: baseline.avg_cost_usd * 1000, GraphRAG: graphrag.avg_cost_usd * 1000 },
  ] : [];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h1 className="text-2xl font-semibold tracking-tight">Benchmark dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Aggregated across the 50-repo eval set. Run with <code className="font-mono text-emerald-400">npm run bench</code>.
        </p>
      </section>

      {err && <div className="text-sm text-red-400">{err}</div>}

      {(!baseline || !graphrag) ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
          No bench runs yet. Start the API, run <code className="font-mono text-emerald-400">npm run bench</code>, then refresh.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard title="Tokens" data={tokenChart} />
            <ChartCard title="Latency" data={latencyChart} />
            <ChartCard title="Cost (USD × 1000)" data={costChart} />
          </div>
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Sonnet judge winners (independent, blinded)</div>
            <div className="grid grid-cols-3 gap-4 text-center">
              {['baseline', 'graphrag', 'tie'].map((w) => {
                const row = judge.find((j) => j.winner === w);
                return (
                  <div key={w} className={`rounded-lg p-4 ${w === 'graphrag' ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : 'bg-slate-800/40'}`}>
                    <div className="text-xs uppercase text-slate-400">{w}</div>
                    <div className="text-3xl font-mono mt-1">{row?.n ?? 0}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, data }: { title: string; data: { metric: string; Baseline: number; GraphRAG: number }[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">{title}</div>
      <div className="h-56">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Baseline" fill="#64748b" />
            <Bar dataKey="GraphRAG" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
