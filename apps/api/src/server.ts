import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ingestRoute } from './routes/ingest.js';
import { askRoute } from './routes/ask.js';
import { benchRoute } from './routes/bench.js';

const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } });

await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true, ts: Date.now() }));

await app.register(ingestRoute, { prefix: '/api/ingest' });
await app.register(askRoute, { prefix: '/api/ask' });
await app.register(benchRoute, { prefix: '/api/bench' });

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
