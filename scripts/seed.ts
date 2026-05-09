import 'dotenv/config';
import { seedOntology } from '../apps/api/src/layers/graph/seed.js';

(async () => {
  const t0 = Date.now();
  const r = await seedOntology();
  console.log(`Seeded ontology: ${r.vertices} vertices, ${r.edges} edges in ${Date.now() - t0}ms`);
})().catch((e) => { console.error(e); process.exit(1); });
