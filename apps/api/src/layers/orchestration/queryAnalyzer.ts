/**
 * Query Complexity Analyzer
 * Classifies a query as "simple" or "multi-hop" to drive adaptive retrieval.
 *
 * Simple queries (1–2 hops):
 *   "What is React?" — single entity, direct fact
 *
 * Multi-hop queries (3–4 hops):
 *   "How is React connected to Meta's AI strategy?" — requires traversing
 *   Entity → Company → Strategy relationships
 */

export type QueryComplexity = 'simple' | 'multi-hop';

// Signals that indicate a multi-hop query
const MULTI_HOP_PATTERNS = [
  /\bhow (is|does|did|was)\b.*\b(connect|relate|lead|influence|affect|impact|enable|drive)\b/i,
  /\bwhat role\b/i,
  /\bwhy did\b/i,
  /\bwhat (caused|led to|resulted in)\b/i,
  /\brelationship between\b/i,
  /\bconnection between\b/i,
  /\bhow .+ (became|evolved|transformed)\b/i,
  /\bcompare\b/i,
  /\bdifference between\b/i,
  /\bwhat (company|organization|team|person|founder).+(created|built|developed|launched)\b/i,
  /\bwho (created|founded|developed|built).+(and|why|when|how)\b/i,
  /\b(and|then|after|before|because|therefore|as a result)\b.*\?/i,
  /\bstrategy\b/i,
  /\binfluence\b/i,
  /\bimpact\b/i,
  /\b(acquired|acquisition|merger)\b/i,
];

// Named entity count heuristic — more entities = more likely multi-hop
function countCapitalized(q: string): number {
  return (q.match(/\b[A-Z][a-zA-Z]+\b/g) ?? []).filter(w =>
    !['What', 'How', 'Why', 'Who', 'When', 'Where', 'Is', 'Are', 'Does', 'Did', 'The', 'A', 'An'].includes(w)
  ).length;
}

export function analyzeQuery(question: string): {
  complexity: QueryComplexity;
  numHops: number;
  reason: string;
} {
  const multiHopMatch = MULTI_HOP_PATTERNS.find(p => p.test(question));
  const entityCount = countCapitalized(question);
  const wordCount = question.split(/\s+/).length;

  if (multiHopMatch || entityCount >= 3 || wordCount >= 12) {
    // Cap at 2 hops — 3+ causes exponential node fan-out (15s+ traversal).
    // Use top_k=3 for extra coverage on complex queries instead of deeper hops.
    return {
      complexity: 'multi-hop',
      numHops: 2,
      reason: multiHopMatch
        ? `Relational pattern detected`
        : entityCount >= 3
          ? `${entityCount} named entities suggest cross-document reasoning`
          : `Long query (${wordCount} words) likely requires multi-hop`,
    };
  }

  return {
    complexity: 'simple',
    numHops: 2,
    reason: 'Direct factual query — 2-hop retrieval sufficient',
  };
}
