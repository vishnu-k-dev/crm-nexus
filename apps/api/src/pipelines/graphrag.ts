import { fetchRepo } from '../extract/repoParser.js';
import { resolveTechs, classifyDomains } from '../extract/domainClassifier.js';
import { runQuery, upsert } from '../graph/client.js';
import { generate, costUsd } from '../llm/claude.js';
import type { PipelineResult } from './baseline.js';

const SYSTEM = `You are an expert technical interviewer.
You will receive a structured brief about a candidate's repo: detected domains, candidate's tech stack, and proven probe templates that elicit real-builder answers.
Output exactly 5 interview questions of increasing difficulty (1..5), grounded in the probes provided. Adapt each probe to mention the candidate's specific repo / tech where natural.
Each question MUST be answerable only by someone who personally built the repo.
Output one JSON object: {"questions":[{"text":"...","difficulty":N}]}`;

interface ProbesResult {
  domains?: Array<{ v_id: string; attributes: { '@domainScore': number } }>;
  questions?: Array<{ v_id: string; attributes: { text: string; difficulty: number; archetype: string; '@markerHits': number } }>;
  markers?: Array<{ v_id: string; attributes: { text: string } }>;
}

export async function runGraphRag(repoUrl: string, resume: string): Promise<PipelineResult & { graphTrace: unknown }> {
  const repo = await fetchRepo(repoUrl);
  const techs = resolveTechs(repo);
  const domains = classifyDomains(techs);

  // upsert Repo + USES edges
  await upsert(
    [{ type: 'Repo', id: repo.url, attributes: { stars: repo.stars, primary_language: repo.primaryLanguage, file_count: repo.fileCount } },
     ...techs.map((t) => ({ type: 'Tech', id: t.name, attributes: { category: t.category } }))],
    techs.map((t) => ({ fromType: 'Repo', fromId: repo.url, edgeType: 'USES', toType: 'Tech', toId: t.name, attributes: { weight: t.weight } })),
  ).catch(() => {/* graph offline → fall back to local-only retrieval */});

  // 3-hop traversal in TigerGraph
  let probes: ProbesResult = {};
  try {
    const raw = await runQuery<unknown[]>('getRelevantProbes', { repo: repo.url, k: 5 });
    for (const block of raw ?? []) {
      Object.assign(probes, block as ProbesResult);
    }
  } catch {
    // local fallback so the pipeline still runs without TigerGraph
    const { SEED_QUESTIONS, DEPTH_MARKERS } = await import('../extract/depthMarkers.js');
    const top = domains.slice(0, 3).map((d) => d.name);
    probes.domains = top.map((n, i) => ({ v_id: n, attributes: { '@domainScore': domains[i]?.score ?? 0 } }));
    probes.questions = SEED_QUESTIONS
      .filter((q) => top.includes(q.archetype))
      .slice(0, 5)
      .map((q) => ({ v_id: q.id, attributes: { text: q.text, difficulty: q.difficulty, archetype: q.archetype, '@markerHits': q.markers.length } }));
    probes.markers = DEPTH_MARKERS
      .filter((m) => top.some((d) => m.id.includes(d.split('_')[0]!.slice(0, 4))))
      .slice(0, 8)
      .map((m) => ({ v_id: m.id, attributes: { text: m.text } }));
  }

  const briefDomains = (probes.domains ?? []).map((d) => d.v_id).join(', ');
  const briefTechs = techs.slice(0, 8).map((t) => t.name).join(', ');
  const briefMarkers = (probes.markers ?? []).map((m) => `- ${m.attributes.text}`).join('\n');
  const briefProbes = (probes.questions ?? []).map((q, i) => `${i + 1}. [d=${q.attributes.difficulty}] ${q.attributes.text}`).join('\n');

  const ctx = [
    `REPO: ${repo.url}`,
    `DOMAINS: ${briefDomains}`,
    `TECHS: ${briefTechs}`,
    `DEPTH_MARKERS:\n${briefMarkers}`,
    `PROBE_TEMPLATES:\n${briefProbes}`,
    resume ? `RESUME (top 200 chars): ${resume.slice(0, 200)}` : '',
  ].filter(Boolean).join('\n\n');

  const r = await generate({ system: SYSTEM, user: ctx, cacheSystem: true, maxTokens: 600 });

  let questions: { text: string; difficulty: number }[] = [];
  try {
    const m = r.text.match(/\{[\s\S]*\}/);
    if (m) questions = (JSON.parse(m[0]) as { questions: typeof questions }).questions ?? [];
  } catch { /* */ }

  return {
    ...r,
    pipeline: 'graphrag',
    costUsd: costUsd(r.model, r.promptTokens, r.completionTokens),
    questions,
    contextChars: ctx.length,
    graphTrace: { domains: probes.domains, markers: probes.markers, questions: probes.questions, techs: techs.slice(0, 8) },
  };
}
