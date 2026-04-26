import { useState } from 'react';
import { ask, type PipelineRun } from '../lib/api';
import { MetricCards } from '../components/MetricCards';
import { PipelineRace } from '../components/PipelineRace';
import { GraphView } from '../components/GraphView';

const SAMPLE = 'https://github.com/fastify/fastify';

export function Demo() {
  const [repoUrl, setRepoUrl] = useState(SAMPLE);
  const [resume, setResume] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<PipelineRun | undefined>();
  const [graphrag, setGraphrag] = useState<PipelineRun | undefined>();

  async function run() {
    setLoading(true); setErr(null); setBaseline(undefined); setGraphrag(undefined);
    try {
      const r = await ask(repoUrl, resume);
      setBaseline(r.baseline);
      setGraphrag(r.graphrag);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Personalize an interview from a GitHub repo
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl">
          Both pipelines call the same Claude Haiku 4.5 with the same instruction. Only the
          context differs: the baseline stuffs the whole repo; GraphRAG walks
          <span className="text-emerald-400"> Repo → Tech → Domain → DepthMarker → Question </span>
          inside TigerGraph and feeds 5 proven probes.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="GitHub repo URL"
            className="md:col-span-2 px-3 py-2 rounded-md bg-slate-950/60 border border-slate-700 text-sm focus:border-emerald-500 outline-none"
          />
          <button
            onClick={run}
            disabled={loading}
            className="px-4 py-2 rounded-md bg-emerald-500 text-slate-950 text-sm font-medium hover:bg-emerald-400 disabled:opacity-50"
          >
            {loading ? 'Running both pipelines…' : 'Run head-to-head'}
          </button>
        </div>
        <textarea
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          placeholder="Optional: paste resume text"
          rows={2}
          className="w-full px-3 py-2 rounded-md bg-slate-950/60 border border-slate-700 text-sm"
        />
        {err && <div className="text-sm text-red-400">{err}</div>}
      </section>

      {(baseline || graphrag) && (
        <>
          <PipelineRace baseline={baseline} graphrag={graphrag} />
          {baseline && graphrag && <MetricCards baseline={baseline} graphrag={graphrag} />}
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Graph traversal</div>
              <GraphView trace={graphrag?.graphTrace ?? null} repoUrl={repoUrl} />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Baseline questions</div>
                <ol className="space-y-2 text-sm list-decimal list-inside text-slate-300">
                  {(baseline?.questions ?? []).map((q, i) => (
                    <li key={i}><span className="text-slate-500 text-xs mr-1">d={q.difficulty}</span>{q.text}</li>
                  ))}
                </ol>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-emerald-400 mb-2">GraphRAG questions</div>
                <ol className="space-y-2 text-sm list-decimal list-inside text-slate-200">
                  {(graphrag?.questions ?? []).map((q, i) => (
                    <li key={i}><span className="text-emerald-500/80 text-xs mr-1">d={q.difficulty}</span>{q.text}</li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
