/**
 * CRM GraphRAG Dashboard — interactive, impactful, instant.
 *
 * On load:
 *   1. Fetches pre-computed results from disk (instant, no eval needed)
 *   2. Shows 4 huge metric cards (token reduction %, accuracy %, BERTScore, latency %)
 *   3. Interactive question runner — click any sample or type your own
 *   4. Charts + per-question table from pre-computed results
 *   5. "Re-run full eval" is a secondary action (bottom)
 */
import { useState, useEffect, useRef } from 'react';
import { getCrmResults, runCrmEval, askQuestion, type CrmEvalResult, type SingleQuestionResult } from '../lib/api';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts';

// ── colour tokens ──────────────────────────────────────────────────────────────
const C = { llm: '#64748b', basic: '#8b5cf6', graph: '#10b981' };
const TOKEN_C = ['#64748b', '#8b5cf6', '#10b981'];

// ── sample questions that showcase GraphRAG's strengths ───────────────────────
const SAMPLES = [
  { q: 'What is the health score and ARR of Acme Corp?',             ref: 'Acme Corp has a health score of 94/100 (Healthy) and an ARR of approximately $1,478,328.',    type: 'simple'    },
  { q: 'What products does Nexus Industries use?',                   ref: 'Nexus Industries uses Support Desk, Analytics Suite, and Field Service.',                       type: 'simple'    },
  { q: "What department does Paul Robinson work in and what is that department's Q4 goal?", ref: "Paul Robinson is in the Sales department which has a Q4 goal of $22M ARR.", type: 'multi_hop' },
  { q: 'What is the Q4 roadmap for the product used by Stellar Technologies?', ref: 'Stellar Technologies uses CRM Enterprise. Its Q4 roadmap is to launch an AI-powered mobile app.', type: 'multi_hop' },
  { q: 'Compare the health scores of Acme Corp and Nexus Industries. Which one is at greater risk?', ref: 'Acme Corp is 94/100 (Healthy). Nexus Industries is 38/100 (Critical). Nexus is at far greater risk.', type: 'synthesis' },
  { q: 'Which product has higher annual revenue — CRM Pro or CRM Enterprise?', ref: 'CRM Pro ($4,357,770) vs CRM Enterprise ($2,722,813). CRM Pro generates more revenue.', type: 'synthesis' },
  { q: 'What is the base price per seat of CRM Pro?',                ref: 'CRM Pro is priced at $299 per seat per month.',                                                  type: 'simple'    },
  { q: 'What is the Q4 goal for the Sales department?',              ref: 'The Sales department Q4 goal is $22M ARR.',                                                      type: 'simple'    },
];

export function CrmDashboard() {
  const [evalData, setEvalData]         = useState<CrmEvalResult | null>(null);
  const [loadingResults, setLoadingRes] = useState(true);

  // Interactive question runner
  const [activeQ, setActiveQ]     = useState<string>('');
  const [activeRef, setActiveRef] = useState<string>('');
  const [running, setRunning]     = useState(false);
  const [liveResult, setLiveRes]  = useState<SingleQuestionResult | null>(null);
  const [liveError, setLiveErr]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Full eval re-run
  const [fullRunning, setFullRunning] = useState(false);
  const [fullErr, setFullErr]         = useState<string | null>(null);

  // Table expansion
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // ── auto-load pre-computed results ────────────────────────────────────────
  useEffect(() => {
    getCrmResults()
      .then(r => setEvalData(r))
      .catch(() => {})
      .finally(() => setLoadingRes(false));
  }, []);

  // ── run a single question ─────────────────────────────────────────────────
  async function runQuestion(q: string, ref: string) {
    if (!q.trim() || running) return;
    setRunning(true); setLiveErr(null); setLiveRes(null); setActiveQ(q); setActiveRef(ref);
    try { setLiveRes(await askQuestion(q, ref)); }
    catch (e) { setLiveErr((e as Error).message); }
    finally { setRunning(false); }
  }

  // ── run full eval (long) ──────────────────────────────────────────────────
  async function runFull() {
    setFullRunning(true); setFullErr(null);
    try { const r = await runCrmEval(); setEvalData(r); }
    catch (e) { setFullErr((e as Error).message); }
    finally { setFullRunning(false); }
  }

  const agg = evalData?.aggregate;
  const tokenData = agg ? [
    { name: 'LLM-Only',  v: agg.avgPromptTokens.llmOnly },
    { name: 'Basic RAG', v: agg.avgPromptTokens.basicRag },
    { name: 'GraphRAG',  v: agg.avgPromptTokens.graphrag },
  ] : [];
  const passData = agg ? [
    { name: 'LLM-Only',  v: parseFloat(agg.llmJudgePassRate.llmOnly) || 0 },
    { name: 'Basic RAG', v: parseFloat(agg.llmJudgePassRate.basicRag) || 0 },
    { name: 'GraphRAG',  v: parseFloat(agg.llmJudgePassRate.graphrag) || 0 },
  ] : [];
  const latData = agg ? [
    { name: 'LLM-Only',  v: agg.avgLatencyMs.llmOnly },
    { name: 'Basic RAG', v: agg.avgLatencyMs.basicRag },
    { name: 'GraphRAG',  v: agg.avgLatencyMs.graphrag },
  ] : [];
  const hopData = evalData ? (() => {
    const m: Record<string, { g: number; b: number; t: number }> = {};
    for (const r of evalData.results) {
      const k = r.type === 'simple' ? '1-hop (simple)' : r.type === 'multi_hop' ? '2-3 hop (multi)' : 'synthesis';
      if (!m[k]) m[k] = { g: 0, b: 0, t: 0 };
      m[k]!.t++;
      if (r.graphrag?.judge?.verdict === 'PASS') m[k]!.g++;
      if (r.basicRag?.judge?.verdict === 'PASS') m[k]!.b++;
    }
    return Object.entries(m).map(([k, v]) => ({
      name: k,
      'GraphRAG': Math.round((v.g / v.t) * 100),
      'Basic RAG': Math.round((v.b / v.t) * 100),
      n: v.t,
    }));
  })() : [];

  const bert    = agg?.bertScoreGraphRAG?.avgF1Rescaled;
  const tkCut   = agg?.tokenReductionVsBasicRag ?? null;
  const ltCut   = agg?.latencyReductionVsBasicRag ?? null;
  const grPass  = agg?.llmJudgePassRate.graphrag ?? null;
  const hasData = !!agg;

  return (
    <div className="space-y-7 pb-24">

      {/* ══════════════════════════════════════════════════════
          HERO BANNER
      ══════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800">
        {/* grid bg */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(#10b981 1px,transparent 1px),linear-gradient(90deg,#10b981 1px,transparent 1px)', backgroundSize: '44px 44px' }} />
        <div className="absolute -top-20 left-1/4 w-72 h-72 bg-emerald-500/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 right-1/4 w-72 h-72 bg-violet-500/6 rounded-full blur-3xl" />

        <div className="relative px-8 py-10">
          <div className="flex flex-wrap items-start justify-between gap-8">
            {/* headline */}
            <div className="max-w-2xl">
              <div className="flex flex-wrap gap-2 mb-4">
                <Chip color="emerald">TigerGraph Hackathon 2026</Chip>
                <Chip color="violet">Multi-hop GraphRAG</Chip>
                <Chip color="sky">3-pipeline benchmark</Chip>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight leading-tight mb-3">
                <span className="text-white">CRM knowledge graph — </span>
                <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                  2.69M tokens
                </span>
              </h1>
              <p className="text-slate-400 text-sm leading-relaxed">
                500 customers · 200 employees · 200 products · 2,000+ deals ingested into{' '}
                <span className="text-emerald-400 font-medium">TigerGraph</span> with HNSW vector index
                and IS_AFTER graph traversal. Identical <span className="font-mono text-slate-300">llama-3.1-8b-instant</span>{' '}
                model across all 3 pipelines — only retrieval differs.
              </p>
            </div>

            {/* dataset stat pills */}
            <div className="flex flex-col gap-3">
              {[
                { val: '2.69M', label: 'tokens in graph', accent: 'emerald', note: '10× judge minimum' },
                { val: '21,318', label: 'graph vertices', accent: 'sky',     note: 'CRM entities' },
                { val: '48,201', label: 'graph edges',    accent: 'violet',  note: 'relationships' },
              ].map(({ val, label, accent, note }) => (
                <div key={label} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
                  accent === 'emerald' ? 'border-emerald-700/50 bg-emerald-950/40' :
                  accent === 'sky'     ? 'border-sky-700/50 bg-sky-950/30' :
                                         'border-violet-700/50 bg-violet-950/30'
                }`}>
                  <span className={`text-xl font-extrabold font-mono ${
                    accent === 'emerald' ? 'text-emerald-300' :
                    accent === 'sky'     ? 'text-sky-300' : 'text-violet-300'
                  }`}>{val}</span>
                  <div>
                    <div className="text-xs text-slate-400">{label}</div>
                    <div className={`text-[10px] font-bold uppercase tracking-widest ${
                      accent === 'emerald' ? 'text-emerald-700' :
                      accent === 'sky'     ? 'text-sky-700' : 'text-violet-700'
                    }`}>{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          4 BIG METRIC CARDS
      ══════════════════════════════════════════════════════ */}
      <section>
        <SectionLabel>GraphRAG vs Basic RAG — benchmark results</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          <BigCard
            icon="⚡" label="Token reduction"
            value={tkCut?.replace('%','') ?? (loadingResults ? '…' : '—')}
            unit="%"
            color={hasData ? 'emerald' : 'muted'}
            sub={agg ? `${agg.avgPromptTokens.basicRag.toLocaleString()} → ${agg.avgPromptTokens.graphrag.toLocaleString()} tokens` : 'GraphRAG fetches only exact entities'}
            target="Target ≥ 80%"
          />
          <BigCard
            icon="✓" label="Accuracy (pass rate)"
            value={grPass?.replace('%','') ?? (loadingResults ? '…' : '—')}
            unit="%"
            color={hasData && parseFloat(grPass ?? '0') >= 70 ? 'emerald' : hasData ? 'amber' : 'muted'}
            sub={agg ? `Basic RAG: ${agg.llmJudgePassRate.basicRag} · LLM: ${agg.llmJudgePassRate.llmOnly}` : 'Independent LLM-as-a-Judge'}
            target="Target ≥ 70%"
          />
          <BigCard
            icon="🎯" label="BERTScore F1"
            value={bert != null ? (bert * 100).toFixed(1) : (loadingResults ? '…' : '—')}
            unit={bert != null ? '' : ''}
            color={bert != null ? (bert >= 0.55 ? 'emerald' : 'amber') : 'muted'}
            sub={agg ? `n=${agg.bertScoreGraphRAG.n} answers · rescale_with_baseline` : 'Semantic similarity to reference'}
            target="Target ≥ 55"
          />
          <BigCard
            icon="🚀" label="Latency reduction"
            value={ltCut?.replace('%','') ?? (loadingResults ? '…' : '—')}
            unit="%"
            color={hasData ? 'emerald' : 'muted'}
            sub={agg ? `${agg.avgLatencyMs.basicRag.toLocaleString()}ms → ${agg.avgLatencyMs.graphrag.toLocaleString()}ms` : 'Direct graph lookup skips embed round-trip'}
            target="Target ≥ 80%"
          />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          INTERACTIVE QUESTION RUNNER
      ══════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-slate-800">
          <SectionLabel className="mb-0">Try a question live — all 3 pipelines respond in real-time</SectionLabel>
          <p className="text-slate-500 text-xs mt-1">Click a sample or type your own CRM question. Responses run in parallel.</p>
        </div>

        {/* sample pills */}
        <div className="px-6 py-4 flex flex-wrap gap-2 border-b border-slate-800/50">
          {SAMPLES.map((s) => (
            <button
              key={s.q}
              onClick={() => { setActiveQ(s.q); setActiveRef(s.ref); inputRef.current && (inputRef.current.value = s.q); runQuestion(s.q, s.ref); }}
              disabled={running}
              className={`text-[11px] px-3 py-1.5 rounded-full border transition cursor-pointer disabled:opacity-40 ${
                s.type === 'simple'    ? 'border-sky-700/60 bg-sky-900/20 text-sky-400 hover:bg-sky-900/40' :
                s.type === 'multi_hop' ? 'border-violet-700/60 bg-violet-900/20 text-violet-400 hover:bg-violet-900/40' :
                                         'border-amber-700/60 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40'
              }`}
            >
              {s.type === 'multi_hop' ? '⇢ ' : s.type === 'synthesis' ? '◈ ' : '· '}
              {s.q.length > 52 ? s.q.slice(0, 52) + '…' : s.q}
            </button>
          ))}
        </div>

        {/* free-text input */}
        <div className="px-6 py-4 flex gap-3 border-b border-slate-800/50">
          <input
            ref={inputRef}
            type="text"
            defaultValue={activeQ}
            placeholder="Type any CRM question…"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-600 transition"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputRef.current?.value.trim()) {
                const q = inputRef.current.value.trim();
                const match = SAMPLES.find(s => s.q === q);
                runQuestion(q, match?.ref ?? '');
              }
            }}
          />
          <button
            onClick={() => {
              const q = inputRef.current?.value.trim() ?? '';
              if (q) { const m = SAMPLES.find(s => s.q === q); runQuestion(q, m?.ref ?? ''); }
            }}
            disabled={running}
            className="px-5 py-2.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-sm hover:bg-emerald-400 disabled:opacity-40 transition whitespace-nowrap shadow shadow-emerald-900/30"
          >
            {running ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-slate-800 border-t-transparent rounded-full animate-spin" />
                Running…
              </span>
            ) : 'Run →'}
          </button>
        </div>

        {/* live result */}
        {liveError && (
          <div className="px-6 py-4 text-sm text-red-400 font-mono bg-red-950/20">{liveError}</div>
        )}
        {liveResult && (
          <div className="px-6 py-5 space-y-4">
            {/* question + reference */}
            <div className="text-sm text-slate-300 font-medium">
              {liveResult.question}
            </div>
            {liveResult.referenceAnswer && (
              <div className="text-xs text-slate-600 italic">
                Reference: {liveResult.referenceAnswer}
              </div>
            )}
            {/* 3-column answer cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([
                { key: 'llmOnly',  label: 'LLM-Only',  color: 'slate',   data: liveResult.llmOnly },
                { key: 'basicRag', label: 'Basic RAG', color: 'violet',  data: liveResult.basicRag },
                { key: 'graphrag', label: 'GraphRAG',  color: 'emerald', data: liveResult.graphrag },
              ] as const).map(({ label, color, data }) => {
                const tokens = (data as { promptTokens?: number }).promptTokens;
                const lat    = (data as { latencyMs?: number }).latencyMs;
                const answer = (data as { answer?: string }).answer;
                const err    = (data as { error?: string }).error;
                const judge  = (data as { judge?: { verdict: string } | null }).judge;
                return (
                  <div key={label} className={`rounded-xl border p-4 ${
                    color === 'emerald' ? 'border-emerald-700/50 bg-emerald-950/20' :
                    color === 'violet'  ? 'border-violet-700/50 bg-violet-950/20' :
                                          'border-slate-700/50 bg-slate-900/40'
                  }`}>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className={`text-xs font-bold uppercase tracking-widest ${
                        color === 'emerald' ? 'text-emerald-400' :
                        color === 'violet'  ? 'text-violet-400' :
                                              'text-slate-400'
                      }`}>{label}</span>
                      {judge && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          judge.verdict === 'PASS'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-red-500/20 text-red-300'
                        }`}>{judge.verdict}</span>
                      )}
                    </div>
                    {err ? (
                      <p className="text-xs text-red-400">{err}</p>
                    ) : (
                      <p className="text-sm text-slate-200 leading-relaxed">{answer ?? '—'}</p>
                    )}
                    {(tokens || lat) && (
                      <div className="flex gap-3 mt-3 pt-3 border-t border-slate-800/60">
                        {tokens && <Stat label="tokens" value={tokens.toLocaleString()} color={color} />}
                        {lat    && <Stat label="latency" value={`${lat.toLocaleString()}ms`} color={color} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!liveResult && !running && !liveError && (
          <div className="px-6 py-8 text-center text-slate-600 text-sm">
            ↑ Click a sample question or type your own to see all 3 pipelines respond live
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════
          CHARTS (from pre-computed results)
      ══════════════════════════════════════════════════════ */}
      {hasData && (
        <>
          <section>
            <SectionLabel>Benchmark charts — {evalData!.n} questions × 3 pipelines</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-3">
              <MiniChart title="Avg prompt tokens" sub="Lower = better">
                <BarChart data={tokenData} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#475569', fontSize: 10 }} />
                  <Tooltip cursor={{ fill: '#ffffff06' }}
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => [v.toLocaleString() + ' tokens', '']} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                    {tokenData.map((_, i) => <Cell key={i} fill={TOKEN_C[i] ?? '#10b981'} />)}
                  </Bar>
                </BarChart>
              </MiniChart>

              <MiniChart title="Pass rate %" sub="Higher = better">
                <BarChart data={passData} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 10 }} />
                  <Tooltip cursor={{ fill: '#ffffff06' }}
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => [v + '%', '']} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                    {passData.map((_, i) => <Cell key={i} fill={TOKEN_C[i] ?? '#10b981'} />)}
                  </Bar>
                </BarChart>
              </MiniChart>

              <MiniChart title="Avg latency ms" sub="Lower = better">
                <BarChart data={latData} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#475569', fontSize: 10 }} />
                  <Tooltip cursor={{ fill: '#ffffff06' }}
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => [v.toLocaleString() + 'ms', '']} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                    {latData.map((_, i) => <Cell key={i} fill={TOKEN_C[i] ?? '#10b981'} />)}
                  </Bar>
                </BarChart>
              </MiniChart>
            </div>

            {hopData.length > 0 && (
              <div className="mt-5">
                <MiniChart title="Pass rate by question type — GraphRAG advantage is sharpest on multi-hop" sub="Graph traversal walks entity relationships flat cosine search can't see" wide>
                  <BarChart data={hopData} margin={{ top: 6, right: 20, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 11 }} />
                    <Tooltip cursor={{ fill: '#ffffff06' }}
                      contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number, name: string) => [v + '%', name]} />
                    <Bar dataKey="GraphRAG"  radius={[4, 4, 0, 0]} fill={C.graph} />
                    <Bar dataKey="Basic RAG" radius={[4, 4, 0, 0]} fill={C.basic} />
                  </BarChart>
                </MiniChart>
              </div>
            )}
          </section>

          {/* per-question table */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-200">
                Per-question results
                <span className="ml-2 text-slate-600 font-normal text-xs">{evalData!.n} questions · click to expand answer</span>
              </span>
              <div className="flex gap-4 text-xs text-slate-600">
                <LegendDot color={C.graph} label="GraphRAG" />
                <LegendDot color={C.basic} label="Basic RAG" />
                <LegendDot color={C.llm}   label="LLM-Only" />
              </div>
            </div>
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
                  <tr className="text-slate-600 text-left">
                    <th className="py-3 px-4 w-8">#</th>
                    <th className="py-3 px-3">Question</th>
                    <th className="py-3 px-3 text-center">Type</th>
                    <th className="py-3 px-3 text-center" style={{ color: C.llm }}>LLM</th>
                    <th className="py-3 px-3 text-center" style={{ color: C.basic }}>Basic</th>
                    <th className="py-3 px-3 text-right" style={{ color: C.basic }}>Tok</th>
                    <th className="py-3 px-3 text-center" style={{ color: C.graph }}>Graph</th>
                    <th className="py-3 px-3 text-right" style={{ color: C.graph }}>Tok</th>
                    <th className="py-3 px-3 text-right" style={{ color: C.graph }}>BERT</th>
                  </tr>
                </thead>
                <tbody>
                  {evalData!.results.map((row, i) => {
                    const open  = expandedRow === i;
                    const lv    = row.llmOnly?.judge?.verdict;
                    const bv    = row.basicRag?.judge?.verdict;
                    const gv    = row.graphrag?.judge?.verdict;
                    const bf    = row.graphrag?.bertScore?.f1Rescaled;
                    return [
                      <tr
                        key={`r${i}`}
                        onClick={() => setExpandedRow(open ? null : i)}
                        className={`border-t border-slate-800/60 cursor-pointer transition-colors ${open ? 'bg-slate-800/50' : 'hover:bg-slate-800/20'}`}
                      >
                        <td className="py-2.5 px-4 text-slate-700 tabular-nums">{i + 1}</td>
                        <td className="py-2.5 px-3 max-w-[200px] text-slate-300 leading-snug">{row.question}</td>
                        <td className="py-2.5 px-3 text-center"><TypeTag t={row.type} /></td>
                        <td className="py-2.5 px-3 text-center"><Verdict v={lv} /></td>
                        <td className="py-2.5 px-3 text-center"><Verdict v={bv} /></td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">{row.basicRag?.promptTokens?.toLocaleString() ?? '—'}</td>
                        <td className="py-2.5 px-3 text-center"><Verdict v={gv} /></td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">{row.graphrag?.promptTokens?.toLocaleString() ?? '—'}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {bf != null
                            ? <span className={bf >= 0.55 ? 'text-emerald-400' : 'text-amber-400'}>{bf.toFixed(3)}</span>
                            : <span className="text-slate-700">—</span>}
                        </td>
                      </tr>,
                      open && (
                        <tr key={`e${i}`} className="bg-slate-900/80 border-t border-slate-700/40">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              <ExpandBox c="slate"   label="Reference"        text={row.referenceAnswer} />
                              <ExpandBox c="emerald" label="GraphRAG answer"  text={row.graphrag?.answer} />
                              <ExpandBox c="violet"  label="Basic RAG answer" text={row.basicRag?.answer} />
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

      {/* no data yet placeholder */}
      {!hasData && !loadingResults && (
        <div className="rounded-2xl border border-dashed border-slate-700 py-14 text-center space-y-2">
          <div className="text-3xl">📊</div>
          <p className="text-slate-500 text-sm">No benchmark results yet.</p>
          <p className="text-slate-600 text-xs">Try a sample question above, or run the full 35-question eval below.</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          FULL EVAL — secondary action at the bottom
      ══════════════════════════════════════════════════════ */}
      <section className={`rounded-2xl border p-6 transition ${fullRunning ? 'border-emerald-700/40 bg-emerald-950/10' : 'border-slate-800/60 bg-slate-900/30'}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium text-slate-300 text-sm">Re-run full 35-question benchmark</p>
            <p className="text-slate-500 text-xs mt-0.5">Runs all questions × 3 pipelines + judge + BERTScore. Takes ~20 min. Results auto-saved for instant reload.</p>
          </div>
          <button
            onClick={runFull}
            disabled={fullRunning}
            className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700 disabled:opacity-40 transition whitespace-nowrap"
          >
            {fullRunning ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                Running (~20 min)…
              </span>
            ) : 'Run full eval →'}
          </button>
        </div>
        {fullErr && <div className="mt-3 text-sm text-red-400 font-mono">{fullErr}</div>}
      </section>
    </div>
  );
}

// ── Tiny components ────────────────────────────────────────────────────────────

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold tracking-wide ${
      color === 'emerald' ? 'border-emerald-700/50 bg-emerald-900/30 text-emerald-300' :
      color === 'violet'  ? 'border-violet-700/50 bg-violet-900/30 text-violet-300' :
                            'border-sky-700/50 bg-sky-900/30 text-sky-300'
    }`}>{children}</span>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[10px] font-bold uppercase tracking-widest text-slate-600 ${className}`}>{children}</div>
  );
}

function BigCard({
  icon, label, value, unit, color, sub, target,
}: { icon: string; label: string; value: string; unit: string; color: 'emerald' | 'amber' | 'muted'; sub: string; target: string }) {
  const isReal = value !== '—' && value !== '…';
  return (
    <div className={`rounded-2xl border p-5 flex flex-col ${
      color === 'emerald' ? 'border-emerald-800/50 bg-emerald-950/25' :
      color === 'amber'   ? 'border-amber-800/50 bg-amber-950/25' :
                            'border-slate-800 bg-slate-900/30'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="flex items-baseline gap-0.5 mb-1">
        <span className={`text-5xl font-extrabold font-mono leading-none ${
          !isReal ? 'text-slate-700' :
          color === 'emerald' ? 'text-emerald-300' :
          color === 'amber'   ? 'text-amber-300' :
                                'text-slate-400'
        }`}>{value}</span>
        {unit && isReal && (
          <span className={`text-2xl font-bold ml-0.5 ${
            color === 'emerald' ? 'text-emerald-500' :
            color === 'amber'   ? 'text-amber-500' : 'text-slate-500'
          }`}>{unit}</span>
        )}
      </div>
      <div className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${
        color === 'emerald' ? 'text-emerald-700' :
        color === 'amber'   ? 'text-amber-700' : 'text-slate-700'
      }`}>{target}</div>
      <div className="text-[11px] text-slate-500 leading-snug">{sub}</div>
    </div>
  );
}

function MiniChart({ title, sub, wide, children }: { title: string; sub: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/40 p-5 ${wide ? '' : ''}`}>
      <div className="text-sm font-medium text-slate-300 mb-0.5">{title}</div>
      <div className="text-[10px] text-slate-600 mb-3">{sub}</div>
      <div className={wide ? 'h-44' : 'h-40'}>
        <ResponsiveContainer>{children as React.ReactElement}</ResponsiveContainer>
      </div>
    </div>
  );
}

function Verdict({ v }: { v?: string }) {
  if (!v) return <span className="text-slate-700">—</span>;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
      v === 'PASS' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
    }`}>{v}</span>
  );
}

function TypeTag({ t }: { t?: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${
      t === 'simple'    ? 'border-sky-800/50 bg-sky-900/30 text-sky-500' :
      t === 'multi_hop' ? 'border-violet-800/50 bg-violet-900/30 text-violet-500' :
                          'border-amber-800/50 bg-amber-900/30 text-amber-500'
    }`}>{t === 'multi_hop' ? 'multi' : t ?? '?'}</span>
  );
}

function ExpandBox({ label, text, c }: { label: string; text?: string; c: 'slate' | 'emerald' | 'violet' }) {
  return (
    <div className={`rounded-xl border p-3 ${
      c === 'emerald' ? 'border-emerald-800/50 bg-emerald-950/20' :
      c === 'violet'  ? 'border-violet-800/50 bg-violet-950/20' :
                        'border-slate-700/50 bg-slate-900/40'
    }`}>
      <div className={`text-[9px] font-bold uppercase tracking-widest mb-1.5 ${
        c === 'emerald' ? 'text-emerald-700' : c === 'violet' ? 'text-violet-700' : 'text-slate-600'
      }`}>{label}</div>
      <div className="text-slate-300 text-[11px] leading-relaxed">
        {text ?? <span className="text-slate-700 italic">no answer</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: 'emerald' | 'violet' | 'slate' }) {
  return (
    <div>
      <div className={`text-sm font-mono font-bold ${
        color === 'emerald' ? 'text-emerald-400' : color === 'violet' ? 'text-violet-400' : 'text-slate-400'
      }`}>{value}</div>
      <div className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
