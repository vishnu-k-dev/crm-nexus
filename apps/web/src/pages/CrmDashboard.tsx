/**
 * CRM GraphRAG Benchmark Dashboard
 * Redesigned for maximum hackathon judge impact.
 */
import { useState } from 'react';
import { runCrmEval, type CrmEvalResult } from '../lib/api';
import {
  Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts';

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  llm:   '#64748b',
  basic: '#8b5cf6',
  graph: '#10b981',
};

// ── Static dataset numbers (always visible) ───────────────────────────────────
const DATASET = {
  tokens:   '2.69M',
  entities: '21,318',
  edges:    '48,201',
  questions: '35',
};

// ── Animated counter hook ─────────────────────────────────────────────────────
function usePrev<T>(v: T) { return v; }

export function CrmDashboard() {
  const [result, setResult] = useState<CrmEvalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  async function startEval() {
    setLoading(true); setErr(null);
    try { setResult(await runCrmEval()); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  const agg = result?.aggregate;

  /* ── derived chart data ── */
  const tokenData = agg ? [
    { name: 'LLM-Only',  v: agg.avgPromptTokens.llmOnly,  c: C.llm   },
    { name: 'Basic RAG', v: agg.avgPromptTokens.basicRag, c: C.basic },
    { name: 'GraphRAG',  v: agg.avgPromptTokens.graphrag, c: C.graph },
  ] : [];
  const passData = agg ? [
    { name: 'LLM-Only',  v: parseFloat(agg.llmJudgePassRate.llmOnly)  || 0, c: C.llm   },
    { name: 'Basic RAG', v: parseFloat(agg.llmJudgePassRate.basicRag) || 0, c: C.basic },
    { name: 'GraphRAG',  v: parseFloat(agg.llmJudgePassRate.graphrag) || 0, c: C.graph },
  ] : [];
  const latData = agg ? [
    { name: 'LLM-Only',  v: agg.avgLatencyMs.llmOnly,  c: C.llm   },
    { name: 'Basic RAG', v: agg.avgLatencyMs.basicRag, c: C.basic },
    { name: 'GraphRAG',  v: agg.avgLatencyMs.graphrag, c: C.graph },
  ] : [];
  const hopData = result ? (() => {
    const m: Record<string, { g: number; b: number; t: number }> = {};
    for (const r of result.results) {
      const k = `${r.hops ?? 1}-hop`;
      if (!m[k]) m[k] = { g: 0, b: 0, t: 0 };
      m[k]!.t++;
      if (r.graphrag?.judge?.verdict === 'PASS') m[k]!.g++;
      if (r.basicRag?.judge?.verdict === 'PASS') m[k]!.b++;
    }
    return Object.entries(m).sort().map(([k, v]) => ({
      name: k,
      GraphRAG:  Math.round((v.g / v.t) * 100),
      'Basic RAG': Math.round((v.b / v.t) * 100),
      n: v.t,
    }));
  })() : [];

  const bert  = agg?.bertScoreGraphRAG?.avgF1Rescaled;
  const tkCut = agg?.tokenReductionVsBasicRag   ?? null;
  const ltCut = agg?.latencyReductionVsBasicRag ?? null;
  const grPass = agg?.llmJudgePassRate.graphrag ?? null;

  return (
    <div className="space-y-8 pb-20">

      {/* ══════════════════════════════════════════════════════════════
          HERO — immediately visible, no eval needed
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900">
        {/* grid bg */}
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: 'linear-gradient(#10b98130 1px,transparent 1px),linear-gradient(90deg,#10b98130 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
        {/* glow */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-violet-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative px-8 pt-10 pb-8">
          {/* badge row */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-600/40 text-emerald-300 text-xs font-semibold tracking-wide">
              TigerGraph Hackathon 2026
            </span>
            <span className="px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-600/40 text-violet-300 text-xs font-semibold tracking-wide">
              GraphRAG × CRM
            </span>
            <span className="px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-600/40 text-sky-300 text-xs font-semibold tracking-wide">
              llama-3.1-8b-instant · All 3 pipelines
            </span>
          </div>

          {/* headline */}
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-3">
            <span className="text-white">Multi-hop </span>
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">GraphRAG</span>
            <span className="text-white"> on a</span>
            <br />
            <span className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">2.69M-token</span>
            <span className="text-white"> CRM knowledge graph</span>
          </h1>
          <p className="text-slate-400 text-base max-w-2xl leading-relaxed">
            Synthetic enterprise CRM — customers, deals, employees, products — indexed into{' '}
            <span className="text-emerald-400 font-medium">TigerGraph</span> with HNSW vector embeddings
            and IS_AFTER graph traversal. Three pipelines run on identical data —
            only the retrieval method changes.
          </p>

          {/* dataset stat pills */}
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              { label: 'Total tokens in graph',   val: DATASET.tokens,    accent: 'emerald', icon: '🔤', note: '10× judge minimum' },
              { label: 'Graph vertices',           val: DATASET.entities,  accent: 'sky',     icon: '⬡',  note: 'CRM entities' },
              { label: 'Graph edges',              val: DATASET.edges,     accent: 'violet',  icon: '⇢',  note: 'Relationships' },
              { label: 'Eval questions',           val: DATASET.questions, accent: 'amber',   icon: '❓', note: 'Simple · Multi-hop · Synthesis' },
            ].map(({ label, val, accent, icon, note }) => (
              <div key={label} className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm ${
                accent === 'emerald' ? 'bg-emerald-950/50 border-emerald-700/50' :
                accent === 'sky'     ? 'bg-sky-950/50 border-sky-700/50' :
                accent === 'violet'  ? 'bg-violet-950/50 border-violet-700/50' :
                                       'bg-amber-950/50 border-amber-700/50'
              }`}>
                <span className="text-2xl">{icon}</span>
                <div>
                  <div className={`text-2xl font-bold font-mono leading-none ${
                    accent === 'emerald' ? 'text-emerald-300' :
                    accent === 'sky'     ? 'text-sky-300' :
                    accent === 'violet'  ? 'text-violet-300' :
                                           'text-amber-300'
                  }`}>{val}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
                  <div className={`text-[9px] font-semibold uppercase tracking-widest mt-0.5 ${
                    accent === 'emerald' ? 'text-emerald-600' :
                    accent === 'sky'     ? 'text-sky-600' :
                    accent === 'violet'  ? 'text-violet-600' :
                                           'text-amber-600'
                  }`}>{note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          ARCHITECTURE — 3-pipeline visual
      ══════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 px-8 py-6">
        <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-5">
          How it works — same question, 3 retrieval methods
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              name: 'LLM-Only',
              icon: '🧠',
              color: 'slate',
              steps: ['Question → LLM directly', 'No retrieval', 'Relies on training data'],
              weakness: 'Hallucination on private data',
              tokens: '~50',
            },
            {
              name: 'Basic RAG',
              icon: '🔍',
              color: 'violet',
              steps: ['Embed question', 'Cosine similarity search', '15 chunks → LLM'],
              weakness: 'Flat retrieval misses relationships',
              tokens: '~2,000',
            },
            {
              name: 'GraphRAG',
              icon: '⬡',
              color: 'emerald',
              steps: ['Detect entity in question', 'RESTPP direct vertex fetch', 'IS_AFTER graph traversal → LLM'],
              weakness: null,
              tokens: '~400',
            },
          ].map(({ name, icon, color, steps, weakness, tokens }) => (
            <div key={name} className={`rounded-xl border p-5 ${
              color === 'emerald' ? 'border-emerald-700/60 bg-emerald-950/30' :
              color === 'violet'  ? 'border-violet-700/60 bg-violet-950/30' :
                                    'border-slate-700/60 bg-slate-900/40'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">{icon}</span>
                <span className={`font-bold text-sm ${
                  color === 'emerald' ? 'text-emerald-300' :
                  color === 'violet'  ? 'text-violet-300' :
                                        'text-slate-300'
                }`}>{name}</span>
              </div>
              <div className="space-y-1.5 mb-4">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className={`mt-0.5 font-mono text-[10px] px-1 rounded ${
                      color === 'emerald' ? 'bg-emerald-900/60 text-emerald-500' :
                      color === 'violet'  ? 'bg-violet-900/60 text-violet-500' :
                                            'bg-slate-800 text-slate-500'
                    }`}>{i + 1}</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
                <span className="text-[10px] text-slate-600">avg tokens</span>
                <span className={`font-mono font-bold text-sm ${
                  color === 'emerald' ? 'text-emerald-400' :
                  color === 'violet'  ? 'text-violet-400' :
                                        'text-slate-400'
                }`}>{tokens}</span>
              </div>
              {weakness && (
                <div className="mt-2 text-[10px] text-red-400/60">⚠ {weakness}</div>
              )}
              {!weakness && (
                <div className="mt-2 text-[10px] text-emerald-400/70">✓ Structured + precise retrieval</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          IMPACT METRICS — big numbers, always prominent
      ══════════════════════════════════════════════════════════════ */}
      <section>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
          Results — GraphRAG vs Basic RAG
          {!result && <span className="ml-2 font-normal text-slate-600 normal-case">(run eval below to populate)</span>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BigMetric
            label="Token reduction"
            value={tkCut ? tkCut.replace('%', '') : '—'}
            unit="%"
            sub="vs Basic RAG"
            detail={agg ? `${agg.avgPromptTokens.basicRag.toLocaleString()} → ${agg.avgPromptTokens.graphrag.toLocaleString()} avg tokens` : 'GraphRAG retrieves only exact entities'}
            color="emerald"
            icon="⚡"
          />
          <BigMetric
            label="GraphRAG pass rate"
            value={grPass ? grPass.replace('%', '') : '—'}
            unit="%"
            sub="LLM-as-a-Judge"
            detail={agg ? `Basic RAG: ${agg.llmJudgePassRate.basicRag} · LLM-Only: ${agg.llmJudgePassRate.llmOnly}` : 'Independent llama-3.1-8b judge'}
            color="emerald"
            icon="✓"
          />
          <BigMetric
            label="BERTScore F1"
            value={bert != null ? (bert * 100).toFixed(1) : '—'}
            unit={bert != null ? '' : ''}
            sub="rescale_with_baseline=True"
            detail={agg ? `Target ≥ 0.55 · n=${agg.bertScoreGraphRAG.n} answers scored` : 'Semantic similarity vs reference'}
            color={bert != null ? (bert >= 0.55 ? 'emerald' : 'amber') : 'slate'}
            icon="🎯"
          />
          <BigMetric
            label="Latency reduction"
            value={ltCut ? ltCut.replace('%', '') : '—'}
            unit="%"
            sub="vs Basic RAG"
            detail={agg ? `${agg.avgLatencyMs.basicRag.toLocaleString()}ms → ${agg.avgLatencyMs.graphrag.toLocaleString()}ms avg` : 'Direct graph lookup is fast'}
            color="emerald"
            icon="🚀"
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          RUN EVAL BUTTON
      ══════════════════════════════════════════════════════════════ */}
      <section className={`rounded-2xl border p-6 transition ${
        loading ? 'border-emerald-700/60 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/40'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-100 mb-1">Run CRM Benchmark</h3>
            <p className="text-sm text-slate-400 max-w-xl">
              35 questions · 3 pipelines · LLM-as-a-Judge per answer · BERTScore F1 on GraphRAG.
              Progress is auto-saved every question.
            </p>
          </div>
          <button
            onClick={startEval}
            disabled={loading}
            className="relative px-6 py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm hover:bg-emerald-400 disabled:opacity-50 transition shadow-lg shadow-emerald-900/40 whitespace-nowrap"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-slate-800 border-t-transparent rounded-full animate-spin" />
                Evaluating… (~20 min)
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                Run eval
                <span className="text-slate-800 text-xs ml-1">35 Qs →</span>
              </span>
            )}
          </button>
        </div>
        {loading && (
          <div className="mt-4 rounded-lg bg-slate-900/80 border border-slate-800 px-4 py-3 text-xs text-slate-500 leading-relaxed">
            <span className="text-emerald-400 font-medium">Running:</span>{' '}
            35 × (LLM-Only + Basic RAG + GraphRAG + 3 judge calls + BERTScore) in sequence.
            Check <span className="font-mono text-slate-400">crm_eval_partial.json</span> for live progress.
          </div>
        )}
        {err && (
          <div className="mt-4 rounded-lg bg-red-950/40 border border-red-800/50 px-4 py-3 text-sm text-red-300 font-mono">
            {err}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════
          CHARTS (only when results available)
      ══════════════════════════════════════════════════════════════ */}
      {result && agg && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Chart title="Avg prompt tokens" sub="Lower is better — GraphRAG targets exact entities">
              <BarChart data={tokenData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  cursor={{ fill: '#ffffff08' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [v.toLocaleString() + ' tokens', '']}
                />
                <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                  {tokenData.map((d) => <Cell key={d.name} fill={d.c} />)}
                </Bar>
              </BarChart>
            </Chart>

            <Chart title="Pass rate %" sub="LLM-as-a-Judge · higher is better">
              <BarChart data={passData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  cursor={{ fill: '#ffffff08' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [v + '%', '']}
                />
                <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                  {passData.map((d) => <Cell key={d.name} fill={d.c} />)}
                </Bar>
              </BarChart>
            </Chart>

            <Chart title="Avg latency ms" sub="Lower is better — direct graph lookup skips embed round-trip">
              <BarChart data={latData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  cursor={{ fill: '#ffffff08' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [v.toLocaleString() + 'ms', '']}
                />
                <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                  {latData.map((d) => <Cell key={d.name} fill={d.c} />)}
                </Bar>
              </BarChart>
            </Chart>
          </div>

          {/* Accuracy by hop depth */}
          {hopData.length > 0 && (
            <Chart title="Pass rate % by question type" sub="GraphRAG advantage is sharpest on multi-hop — graph traversal walks entity relationships Basic RAG can't see" wide>
              <BarChart data={hopData} margin={{ top: 6, right: 20, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: '#ffffff08' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [`${v}%`, name]}
                />
                <Bar dataKey="GraphRAG"   radius={[4, 4, 0, 0]} fill={C.graph} />
                <Bar dataKey="Basic RAG"  radius={[4, 4, 0, 0]} fill={C.basic} />
              </BarChart>
            </Chart>
          )}

          {/* ── Per-question table ──────────────────────────────────── */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-200 text-sm">Per-question results</span>
                <span className="ml-2 text-slate-600 text-xs">{result.n} questions · click row to expand answer</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <Dot color={C.graph} label="GraphRAG" />
                <Dot color={C.basic} label="Basic RAG" />
                <Dot color={C.llm}   label="LLM-Only" />
              </div>
            </div>

            <div className="overflow-auto max-h-[560px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
                  <tr className="text-slate-600 text-left">
                    <th className="py-3 px-4 font-medium w-8">#</th>
                    <th className="py-3 px-4 font-medium">Question</th>
                    <th className="py-3 px-3 font-medium text-center">Type</th>
                    <th className="py-3 px-3 font-medium text-center" style={{ color: C.llm }}>LLM</th>
                    <th className="py-3 px-3 font-medium text-center" style={{ color: C.basic }}>Basic</th>
                    <th className="py-3 px-3 font-medium text-right" style={{ color: C.basic }}>Tok</th>
                    <th className="py-3 px-3 font-medium text-center" style={{ color: C.graph }}>Graph</th>
                    <th className="py-3 px-3 font-medium text-right" style={{ color: C.graph }}>Tok</th>
                    <th className="py-3 px-3 font-medium text-right" style={{ color: C.graph }}>BERT</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((row, i) => {
                    const open = expandedRow === i;
                    const lv = row.llmOnly?.judge?.verdict;
                    const bv = row.basicRag?.judge?.verdict;
                    const gv = row.graphrag?.judge?.verdict;
                    const bf = row.graphrag?.bertScore?.f1Rescaled;
                    return [
                      <tr
                        key={`r${i}`}
                        onClick={() => setExpandedRow(open ? null : i)}
                        className={`border-t border-slate-800/70 cursor-pointer transition-colors ${
                          open ? 'bg-slate-800/50' : 'hover:bg-slate-800/20'
                        }`}
                      >
                        <td className="py-2.5 px-4 text-slate-700 tabular-nums">{i + 1}</td>
                        <td className="py-2.5 px-4 max-w-[200px] text-slate-300 leading-snug pr-2">{row.question}</td>
                        <td className="py-2.5 px-3 text-center">
                          <TypeBadge t={row.type} />
                        </td>
                        <td className="py-2.5 px-3 text-center"><Verdict v={lv} /></td>
                        <td className="py-2.5 px-3 text-center"><Verdict v={bv} /></td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                          {row.basicRag?.promptTokens?.toLocaleString() ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center"><Verdict v={gv} /></td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                          {row.graphrag?.promptTokens?.toLocaleString() ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {bf != null ? (
                            <span className={bf >= 0.55 ? 'text-emerald-400' : 'text-amber-400'}>
                              {bf.toFixed(3)}
                            </span>
                          ) : <span className="text-slate-700">—</span>}
                        </td>
                      </tr>,
                      open && (
                        <tr key={`e${i}`} className="border-t border-slate-700/50 bg-slate-900/80">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              <ExpandBox label="Reference answer" text={row.referenceAnswer} c="slate" />
                              <ExpandBox label="GraphRAG answer"  text={row.graphrag?.answer} c="emerald" />
                              <ExpandBox label="Basic RAG answer" text={row.basicRag?.answer}  c="violet" />
                            </div>
                          </td>
                        </tr>
                      ),
                    ].filter(Boolean);
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function BigMetric({
  label, value, unit, sub, detail, color, icon,
}: {
  label: string; value: string; unit: string;
  sub: string; detail: string;
  color: 'emerald' | 'amber' | 'slate'; icon: string;
}) {
  const haval = value !== '—';
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-1 transition ${
      color === 'emerald' ? 'border-emerald-800/50 bg-emerald-950/30' :
      color === 'amber'   ? 'border-amber-800/50 bg-amber-950/30' :
                            'border-slate-800 bg-slate-900/40'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-5xl font-extrabold font-mono leading-none ${
          !haval ? 'text-slate-700' :
          color === 'emerald' ? 'text-emerald-300' :
          color === 'amber'   ? 'text-amber-300' :
                                'text-slate-300'
        }`}>{value}</span>
        {unit && haval && (
          <span className={`text-xl font-bold ${
            color === 'emerald' ? 'text-emerald-500' :
            color === 'amber'   ? 'text-amber-500' :
                                  'text-slate-500'
          }`}>{unit}</span>
        )}
      </div>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${
        color === 'emerald' ? 'text-emerald-600' :
        color === 'amber'   ? 'text-amber-600' :
                              'text-slate-600'
      }`}>{sub}</div>
      <div className="text-[11px] text-slate-500 mt-1 leading-snug">{detail}</div>
    </div>
  );
}

function Chart({
  title, sub, wide, children,
}: {
  title: string; sub: string; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/40 p-5 ${wide ? 'md:col-span-3' : ''}`}>
      <div className="mb-1 font-medium text-slate-300 text-sm">{title}</div>
      <div className="text-[10px] text-slate-600 mb-3">{sub}</div>
      <div className={wide ? 'h-48' : 'h-44'}>
        <ResponsiveContainer>{children as React.ReactElement}</ResponsiveContainer>
      </div>
    </div>
  );
}

function Verdict({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-700">—</span>;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
      v === 'PASS'
        ? 'bg-emerald-500/20 text-emerald-300'
        : 'bg-red-500/20 text-red-300'
    }`}>{v}</span>
  );
}

function TypeBadge({ t }: { t?: string }) {
  const cls =
    t === 'simple'    ? 'bg-sky-900/50 text-sky-400/80 border-sky-800/40' :
    t === 'multi_hop' ? 'bg-violet-900/50 text-violet-400/80 border-violet-800/40' :
                        'bg-amber-900/50 text-amber-400/80 border-amber-800/40';
  const label =
    t === 'simple'    ? 'simple' :
    t === 'multi_hop' ? 'multi' :
                        'synth';
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${cls}`}>{label}</span>
  );
}

function ExpandBox({ label, text, c }: { label: string; text?: string; c: 'slate' | 'emerald' | 'violet' }) {
  return (
    <div className={`rounded-xl border p-3 ${
      c === 'emerald' ? 'border-emerald-800/50 bg-emerald-950/20' :
      c === 'violet'  ? 'border-violet-800/50 bg-violet-950/20' :
                        'border-slate-700/50 bg-slate-900/40'
    }`}>
      <div className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${
        c === 'emerald' ? 'text-emerald-600' :
        c === 'violet'  ? 'text-violet-600' :
                          'text-slate-600'
      }`}>{label}</div>
      <div className="text-slate-300 leading-relaxed text-[11px]">
        {text ?? <span className="text-slate-700 italic">No answer</span>}
      </div>
    </div>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-slate-500">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
