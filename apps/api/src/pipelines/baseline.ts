import { fetchRepo } from '../extract/repoParser.js';
import { generate, costUsd, type LLMResult } from '../llm/claude.js';

const SYSTEM = `You are an expert technical interviewer.
Given a candidate's GitHub repo and resume, output exactly 5 interview questions of increasing difficulty (1..5).
Each question MUST be answerable only by someone who personally built the repo — not by reading the README.
Output one JSON object: {"questions":[{"text":"...","difficulty":N}]}`;

export interface PipelineResult extends LLMResult {
  pipeline: 'baseline' | 'graphrag';
  costUsd: number;
  questions: { text: string; difficulty: number }[];
  contextChars: number;
}

export async function runBaseline(repoUrl: string, resume: string): Promise<PipelineResult> {
  const repo = await fetchRepo(repoUrl);

  // Naive prompt-stuffing: file tree, README, all manifest files, full dep list, resume.
  const ctx = [
    `REPO: ${repo.url} (${repo.stars}★, primary=${repo.primaryLanguage}, files=${repo.fileCount})`,
    `LANGUAGES: ${JSON.stringify(repo.languages)}`,
    `TOP_PATHS:\n${repo.topPaths.join('\n')}`,
    `README:\n${repo.readme}`,
    ...Object.entries(repo.packageManifests).map(([k, v]) => `MANIFEST ${k}:\n${v}`),
    `DEPENDENCIES: ${repo.dependencies.join(', ')}`,
    `RESUME:\n${resume}`,
  ].join('\n\n');

  const user = `Generate 5 interview questions for this candidate.\n\n${ctx}`;
  const r = await generate({ system: SYSTEM, user, maxTokens: 600 });

  let questions: { text: string; difficulty: number }[] = [];
  try {
    const m = r.text.match(/\{[\s\S]*\}/);
    if (m) questions = (JSON.parse(m[0]) as { questions: typeof questions }).questions ?? [];
  } catch { /* leave empty */ }

  return {
    ...r,
    pipeline: 'baseline',
    costUsd: costUsd(r.model, r.promptTokens, r.completionTokens),
    questions,
    contextChars: ctx.length,
  };
}
