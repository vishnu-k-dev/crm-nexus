import 'dotenv/config';
import { request } from 'undici';

const port = process.env.PORT ?? 3001;
const limit = process.argv[2] ? Number(process.argv[2]) : undefined;

const res = await request(`http://localhost:${port}/api/bench/run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit, judge: true }),
});
const body = await res.body.json() as { runId: string; aggregate: unknown; judgements: unknown };
console.log(`runId=${body.runId}`);
console.log('Aggregate (per pipeline):');
console.table(body.aggregate);
console.log('Judge winners:');
console.table(body.judgements);
