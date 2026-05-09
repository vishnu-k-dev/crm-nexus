import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
config({ path: resolve(here, '../../../../.env'), override: true });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { compareRoute } from './routes/compare.js';
import { crmEvalRoute } from './routes/crmEval.js';
import { buildIndex } from './layers/retrieval/indexBuilder.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true, ts: Date.now() }));

await app.register(compareRoute, { prefix: '/api/compare' });
await app.register(crmEvalRoute, { prefix: '/api/crm-eval' });

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`Server running on port ${port}`);

// Build vector index in background after server is ready
buildIndex().catch(err => app.log.error('[index] Failed to build index: ' + err.message));
