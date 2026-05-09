// Graph Layer — public surface.
// Owns: entity extraction, TigerGraph schema/queries, upsert, multi-hop retrieval.
// Depends on: nothing inside ./layers/* (this is the bottom of the stack).
export { fetchRepo, type RepoSnapshot } from './extract/repoParser.js';
export { resolveTechs, classifyDomains, ARCHETYPES, type Archetype } from './extract/domainClassifier.js';
export { DEPTH_MARKERS, SEED_QUESTIONS, FAKER_SIGNALS, INTERACTIONS } from './extract/depthMarkers.js';
export { upsert, runQuery, ping } from './client.js';
export { seedOntology } from './seed.js';
