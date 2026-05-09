import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { route } from '../layers/orchestration/router.js';
import { runBaseline } from '../layers/orchestration/pipelines/baseline.js';
import { runGraphRag } from '../layers/orchestration/pipelines/graphrag.js';

const Body = z.object({
  repoUrl: z.string().url(),
  resume: z.string().default(''),
  mode: z.enum(['baseline', 'graphrag', 'both', 'auto']).default('both'),
});

export const askRoute: FastifyPluginAsync = async (app) => {
  app.post('/', async (req) => {
    const { repoUrl, resume, mode } = Body.parse(req.body);
    if (mode === 'baseline') return { baseline: await runBaseline(repoUrl, resume) };
    if (mode === 'graphrag') return { graphrag: await runGraphRag(repoUrl, resume) };
    if (mode === 'auto') return route(repoUrl, resume);
    const [baseline, graphrag] = await Promise.all([
      runBaseline(repoUrl, resume),
      runGraphRag(repoUrl, resume),
    ]);
    return { baseline, graphrag };
  });
};
