// Inference Orchestration — the AI Factory's "decision" component.
//
// Given a candidate request, decide:
//   1. Is the graph healthy and seeded? → use GraphRAG.
//   2. Is the repo's stack outside our ontology coverage? → fall through to baseline.
//   3. Did graph retrieval return < threshold useful nodes? → blend (graph hint + repo dump).
//
// This file is intentionally thin. It is the contract between the rest of the
// system and "which pipeline runs". Routes call route(), not the pipelines directly.

import { ping, runQuery } from '../graph/client.js';
import { fetchRepo } from '../graph/extract/repoParser.js';
import { resolveTechs, classifyDomains } from '../graph/extract/domainClassifier.js';
import { runBaseline } from './pipelines/baseline.js';
import { runGraphRag } from './pipelines/graphrag.js';

export type Decision = 'graphrag' | 'baseline' | 'graphrag_then_baseline_fallback';

export interface RouteResult {
  decision: Decision;
  reason: string;
  baseline?: Awaited<ReturnType<typeof runBaseline>>;
  graphrag?: Awaited<ReturnType<typeof runGraphRag>>;
}

interface DecisionInputs {
  graphUp: boolean;
  ontologyCoverage: number; // share of resolved techs that map to a known Domain (0..1)
  topDomainScore: number;   // score of best-matching domain
}

const COVERAGE_THRESHOLD = 0.4;
const DOMAIN_SCORE_THRESHOLD = 1.0;

export function decide(i: DecisionInputs): { decision: Decision; reason: string } {
  if (!i.graphUp) {
    return { decision: 'baseline', reason: 'TigerGraph unreachable; degrading to baseline' };
  }
  if (i.ontologyCoverage < COVERAGE_THRESHOLD || i.topDomainScore < DOMAIN_SCORE_THRESHOLD) {
    return { decision: 'graphrag_then_baseline_fallback', reason: `coverage=${i.ontologyCoverage.toFixed(2)} score=${i.topDomainScore.toFixed(2)} below thresholds; running both for safety` };
  }
  return { decision: 'graphrag', reason: 'graph healthy + high ontology coverage' };
}

async function probeGraph(): Promise<boolean> {
  try {
    if (!(await ping())) return false;
    await runQuery('graphStats');
    return true;
  } catch {
    return false;
  }
}

export async function route(repoUrl: string, resume: string): Promise<RouteResult> {
  const [graphUp, repo] = await Promise.all([probeGraph(), fetchRepo(repoUrl)]);
  const techs = resolveTechs(repo);
  const domains = classifyDomains(techs);
  const known = techs.filter((t) => domains.some((d) => d.score > 0)).length;
  const coverage = techs.length === 0 ? 0 : known / techs.length;
  const topScore = domains[0]?.score ?? 0;

  const { decision, reason } = decide({ graphUp, ontologyCoverage: coverage, topDomainScore: topScore });

  if (decision === 'baseline') {
    return { decision, reason, baseline: await runBaseline(repoUrl, resume) };
  }
  if (decision === 'graphrag') {
    return { decision, reason, graphrag: await runGraphRag(repoUrl, resume) };
  }
  // graphrag_then_baseline_fallback: race both, return both. Caller picks.
  const [baseline, graphrag] = await Promise.all([
    runBaseline(repoUrl, resume),
    runGraphRag(repoUrl, resume),
  ]);
  return { decision, reason, baseline, graphrag };
}
