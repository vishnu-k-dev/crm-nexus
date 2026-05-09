/**
 * Demo page — head-to-head 3-pipeline comparison.
 * User types a question, all 3 pipelines run in parallel, results shown side-by-side.
 */
import { useState } from 'react';
import { compareQuestion, getStatus, type CompareResult } from '../lib/api';
import { MetricCards } from '../components/MetricCards';
import { PipelineRace } from '../components/PipelineRace';
import { GraphView } from '../components/GraphView';

const SAMPLE_QUESTIONS = [
  'What role did Facebook\'s infrastructure needs play in the development of React?',
  'How did Google\'s internal tooling influence the creation of Kubernetes?',
  'What is the relationship between Python and machine learning adoption?',
  'How does Redis differ from traditional relational databases?',
  'What year was TypeScript first released and who developed it?',
];

function AnswerCard({ title, color, answer, chunks, error }: {
  title: string;
  color: string;
  answer?: string;
  chunks?: string[];
  error?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      color === 'emerald' ? 'border-emerald-800/50 bg-emerald-950/20' :
      color === 'violet'  ? 'border-violet-800/50 bg-violet-950/20'  :
      'border-slate-700 bg-slate-900/30'
    }`}>
      <div className={`text-xs font-semibold uppercase tracking-widest ${
        color === 'emerald' ? 'text-emerald-400' :
        color === 'violet'  ? 'text-violet-400'  : 'text-slate-400'
      }`}>{title}</div>
      {error ? (
        <div className="text-sm text-red-400">{error}</div>
      ) : (
        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
          {answer ?? '—'}
        </p>
      )}
      {chunks && chunks.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-500 hover:text-slate-300 transition"
          >
            {expanded ? '▲ Hide' : '▼ Show'} {chunks.length} retrieved chunks
          </button>
          {expanded && (
            <ol className="mt-2 space-y-1.5 list-decimal list-inside">
              {chunks.map((c, i) => (
                <li key={i} className="text-xs text-slate-400 leading-snug">
                  {c.slice(0, 200)}{c.length > 200 ? '…' : ''}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export function Demo() {
  const [question, setQuestion] = useState(SAMPLE_QUESTIONS[0]!);
  const [refAnswer, setRefAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);

  async function checkStatus() {
    try {
      const s = await getStatus();
      if (!s.vectorIndexReady) {
        setIndexStatus(`Vector index building… (${s.chunkCount} chunks so far)`);
      } else {
        setIndexStatus(`Ready — ${s.chunkCount.toLocaleString()} chunks indexed`);
      }
    } catch {
      setIndexStatus('Could not reach API');
    }
  }

  async function run() {
    if (question.length < 5) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const r = await compareQuestion(question, refAnswer.trim() || undefined);
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              3-Pipeline knowledge-graph Q&amp;A
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              Same question, same LLM model (<span className="text-slate-300 font-mono">llama-3.3-70b-versatile</span>), three retrieval strategies.
              GraphRAG uses TigerGraph multi-hop entity traversal to find the
              exact context — producing{' '}
              <span className="text-emerald-400 font-medium">≥70% fewer prompt tokens</span>{' '}
              with equal-or-better answer quality.
            </p>
          </div>
          <button
            onClick={checkStatus}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition whitespace-nowrap"
          >
            Check status
          </button>
        </div>
        {indexStatus && (
          <div className="text-xs text-slate-500 bg-slate-900/60 rounded-md px-3 py-2">
            {indexStatus}
          </div>
        )}

        {/* Sample questions */}
        <div className="flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => setQuestion(q)}
              className={`text-xs px-2 py-1 rounded-full border transition ${
                question === q
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500'
              }`}
            >
              {q.length > 60 ? q.slice(0, 60) + '…' : q}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="space-y-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Enter any question (works best for tech/CS topics from Wikipedia)"
            rows={2}
            className="w-full px-3 py-2.5 rounded-md bg-slate-950/60 border border-slate-700 text-sm focus:border-emerald-500 outline-none resize-none"
          />
          <div className="flex gap-3 items-start">
            <textarea
              value={refAnswer}
              onChange={(e) => setRefAnswer(e.target.value)}
              placeholder="Optional: reference answer for accuracy eval (LLM judge)"
              rows={1}
              className="flex-1 px-3 py-2 rounded-md bg-slate-950/60 border border-slate-700 text-sm focus:border-slate-500 outline-none resize-none"
            />
            <button
              onClick={run}
              disabled={loading || question.length < 5}
              className="px-5 py-2 rounded-md bg-emerald-500 text-slate-950 text-sm font-medium hover:bg-emerald-400 disabled:opacity-40 transition whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-slate-800 border-t-transparent rounded-full animate-spin" />
                  Running…
                </span>
              ) : 'Run all 3 pipelines →'}
            </button>
          </div>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
      </section>

      {/* Results */}
      {result && (
        <>
          {/* Token race */}
          <PipelineRace
            llmOnly={result.llmOnly?.error ? undefined : result.llmOnly}
            basicRag={result.basicRag?.error ? undefined : result.basicRag}
            graphrag={result.graphrag?.error ? undefined : result.graphrag}
          />

          {/* Metric cards */}
          <MetricCards
            llmOnly={result.llmOnly?.error ? undefined : result.llmOnly}
            basicRag={result.basicRag?.error ? undefined : result.basicRag}
            graphrag={result.graphrag?.error ? undefined : result.graphrag}
          />

          {/* Answers side-by-side */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AnswerCard
              title="LLM-Only (no retrieval)"
              color="slate"
              answer={result.llmOnly?.answer}
              error={result.llmOnly?.error}
            />
            <AnswerCard
              title="Basic RAG (cosine search)"
              color="violet"
              answer={result.basicRag?.answer}
              chunks={result.basicRag?.retrievedChunks}
              error={result.basicRag?.error}
            />
            <AnswerCard
              title={`GraphRAG (${result.graphrag?.numHops ?? '?'}-hop TigerGraph)`}
              color="emerald"
              answer={result.graphrag?.answer}
              chunks={result.graphrag?.retrievedChunks}
              error={result.graphrag?.error}
            />
          </section>

          {/* Accuracy eval */}
          {result.accuracy && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
              <div className="text-sm font-medium text-slate-300">LLM-as-a-Judge accuracy</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Basic RAG', acc: result.accuracy.basicRag, color: 'violet' },
                  { label: 'GraphRAG', acc: result.accuracy.graphrag, color: 'emerald' },
                ].map(({ label, acc, color }) => (
                  <div key={label} className="rounded-lg bg-slate-800/30 p-3 space-y-1">
                    <div className={`text-xs font-medium ${color === 'emerald' ? 'text-emerald-400' : 'text-violet-400'}`}>
                      {label}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        acc.llmJudge?.verdict === 'PASS'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}>
                        {acc.llmJudge?.verdict ?? '—'}
                      </span>
                      <span className="text-xs text-slate-400">{acc.llmJudge?.reason}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Efficiency: <span className="text-slate-300 font-mono">{acc.efficiencyScore.toFixed(3)}</span>
                      <span className="ml-1">(accuracy ÷ k-tokens)</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Graph visualization */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              Retrieval graph — Basic RAG vs GraphRAG
            </div>
            <div className="text-xs text-slate-600 mb-4">
              Green nodes = GraphRAG entity-traversal chunks (targeted).
              Purple nodes = Basic RAG cosine-similar chunks (broad).
              GraphRAG retrieves conceptually connected context; Basic RAG retrieves surface-similar text.
            </div>
            <GraphView
              basicRag={result.basicRag?.error ? undefined : result.basicRag}
              graphrag={result.graphrag?.error ? undefined : result.graphrag}
              question={result.question}
              queryMeta={result.queryMeta}
            />
          </section>
        </>
      )}
    </div>
  );
}
