import { upsert } from './client.js';
import { knownTechs, techToDomainEdges, ARCHETYPES } from './extract/domainClassifier.js';
import { DEPTH_MARKERS, FAKER_SIGNALS, SEED_QUESTIONS, INTERACTIONS, markersByArchetype } from './extract/depthMarkers.js';

// Seed the ontology (Tech, Domain, DepthMarker, FakerSignal, Question + edges).
// Idempotent — re-runnable.
export async function seedOntology(): Promise<{ vertices: number; edges: number }> {
  const vertices = [];
  const edges = [];

  for (const t of knownTechs()) {
    vertices.push({ type: 'Tech', id: t.name, attributes: { category: t.category } });
  }
  for (const a of ARCHETYPES) {
    vertices.push({ type: 'Domain', id: a, attributes: { description: a } });
  }
  for (const m of DEPTH_MARKERS) {
    vertices.push({ type: 'DepthMarker', id: m.id, attributes: { text: m.text, signal_type: m.signal_type } });
  }
  for (const f of FAKER_SIGNALS) {
    vertices.push({ type: 'FakerSignal', id: f.id, attributes: { text: f.text } });
  }
  for (const q of SEED_QUESTIONS) {
    vertices.push({ type: 'Question', id: q.id, attributes: { text: q.text, difficulty: q.difficulty, archetype: q.archetype } });
  }
  // Interaction vertices — the cross-tech layer
  for (const ix of INTERACTIONS) {
    vertices.push({ type: 'Interaction', id: ix.id, attributes: { name: ix.name, description: ix.description } });
  }

  for (const e of techToDomainEdges()) {
    edges.push({ fromType: 'Tech', fromId: e.tech, edgeType: 'IMPLIES', toType: 'Domain', toId: e.domain, attributes: { confidence: e.confidence } });
  }
  const byArch = markersByArchetype();
  for (const [arch, markers] of Object.entries(byArch)) {
    for (const mid of markers) {
      edges.push({ fromType: 'Domain', fromId: arch, edgeType: 'PROBES', toType: 'DepthMarker', toId: mid });
    }
  }
  for (const q of SEED_QUESTIONS) {
    for (const mid of q.markers) {
      edges.push({ fromType: 'Question', fromId: q.id, edgeType: 'EXEMPLIFIES', toType: 'DepthMarker', toId: mid });
    }
  }
  for (const f of FAKER_SIGNALS) {
    edges.push({ fromType: 'DepthMarker', fromId: f.contrasts, edgeType: 'CONTRASTS', toType: 'FakerSignal', toId: f.id });
  }
  // Interaction edges: Tech -PARTICIPATES_IN-> Interaction -REQUIRES-> DepthMarker
  for (const ix of INTERACTIONS) {
    for (const tech of ix.techs) {
      edges.push({ fromType: 'Tech', fromId: tech, edgeType: 'PARTICIPATES_IN', toType: 'Interaction', toId: ix.id });
    }
    for (const mid of ix.markers) {
      edges.push({ fromType: 'Interaction', fromId: ix.id, edgeType: 'REQUIRES', toType: 'DepthMarker', toId: mid, attributes: { strength: 1.0 } });
    }
  }

  // batch in chunks to stay under TG payload limits
  const CHUNK = 200;
  for (let i = 0; i < vertices.length; i += CHUNK) {
    await upsert(vertices.slice(i, i + CHUNK), []);
  }
  for (let i = 0; i < edges.length; i += CHUNK) {
    await upsert([], edges.slice(i, i + CHUNK));
  }
  return { vertices: vertices.length, edges: edges.length };
}
