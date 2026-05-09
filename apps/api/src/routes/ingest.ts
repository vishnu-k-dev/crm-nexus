import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fetchRepo } from '../layers/graph/extract/repoParser.js';
import { resolveTechs, classifyDomains } from '../layers/graph/extract/domainClassifier.js';
import { upsert } from '../layers/graph/client.js';

const Body = z.object({ repoUrl: z.string().url() });

export const ingestRoute: FastifyPluginAsync = async (app) => {
  app.post('/', async (req) => {
    const { repoUrl } = Body.parse(req.body);
    const repo = await fetchRepo(repoUrl);
    const techs = resolveTechs(repo);
    const domains = classifyDomains(techs);

    let ok = false;
    let upsertError: string | undefined;
    try {
      await upsert(
        [
          { type: 'Repo', id: repo.url, attributes: { stars: repo.stars, primary_language: repo.primaryLanguage, file_count: repo.fileCount } },
          ...techs.map((t) => ({ type: 'Tech', id: t.name, attributes: { category: t.category } })),
        ],
        techs.map((t) => ({ fromType: 'Repo', fromId: repo.url, edgeType: 'USES', toType: 'Tech', toId: t.name, attributes: { weight: t.weight } })),
      );
      ok = true;
    } catch (e) {
      upsertError = (e as Error).message;
      // eslint-disable-next-line no-console
      console.error('[ingest] upsert error:', upsertError);
    }

    return { repo, techs, domains, graphWritten: ok, upsertError };
  });
};
