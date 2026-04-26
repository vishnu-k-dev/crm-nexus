import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fetchRepo } from '../extract/repoParser.js';
import { resolveTechs, classifyDomains } from '../extract/domainClassifier.js';
import { upsert } from '../graph/client.js';

const Body = z.object({ repoUrl: z.string().url() });

export const ingestRoute: FastifyPluginAsync = async (app) => {
  app.post('/', async (req) => {
    const { repoUrl } = Body.parse(req.body);
    const repo = await fetchRepo(repoUrl);
    const techs = resolveTechs(repo);
    const domains = classifyDomains(techs);

    const ok = await upsert(
      [
        { type: 'Repo', id: repo.url, attributes: { stars: repo.stars, primary_language: repo.primaryLanguage, file_count: repo.fileCount } },
        ...techs.map((t) => ({ type: 'Tech', id: t.name, attributes: { category: t.category } })),
      ],
      techs.map((t) => ({ fromType: 'Repo', fromId: repo.url, edgeType: 'USES', toType: 'Tech', toId: t.name, attributes: { weight: t.weight } })),
    ).then(() => true).catch(() => false);

    return { repo, techs, domains, graphWritten: ok };
  });
};
