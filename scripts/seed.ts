import 'dotenv/config';
import { seedOntology } from '../apps/api/src/graph/seed.js';

const t0 = Date.now();
const r = await seedOntology();
console.log(`Seeded ontology: ${r.vertices} vertices, ${r.edges} edges in ${Date.now() - t0}ms`);
