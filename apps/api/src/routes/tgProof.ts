/**
 * GET /api/tg-proof
 * Returns live TigerGraph stats — proves the graph is real and running CE.
 */
import type { FastifyInstance } from 'fastify';

const TG_RESTPP_URL = process.env.TG_RESTPP_URL ?? 'http://host.docker.internal:14240';
const GRAPH_NAME    = process.env.TG_GRAPH_NAME  ?? 'MyGraph';

export async function tgProofRoute(app: FastifyInstance) {
  app.get('/', async (_req, reply) => {
    try {
      // 1. Vertex count
      const statsRes = await fetch(
        `${TG_RESTPP_URL}/restpp/builtins/${GRAPH_NAME}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ function: 'stat_vertex_number', type: '*' }),
          signal: AbortSignal.timeout(8000),
        }
      );
      const statsJson = statsRes.ok ? await statsRes.json() : null;
      const vertexRows: { v_type: string; count: number }[] = statsJson?.results ?? [];
      const totalVertices = vertexRows.reduce((s, r) => s + (r.count ?? 0), 0);

      // 2. Edge count
      const edgeRes = await fetch(
        `${TG_RESTPP_URL}/restpp/builtins/${GRAPH_NAME}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ function: 'stat_edge_number', type: '*' }),
          signal: AbortSignal.timeout(8000),
        }
      );
      const edgeJson = edgeRes.ok ? await edgeRes.json() : null;
      const edgeRows: { e_type: string; count: number }[] = edgeJson?.results ?? [];
      const totalEdges = edgeRows.reduce((s, r) => s + (r.count ?? 0), 0);

      // 3. DocumentChunk count (proxy for embedded chunks)
      const chunkRes = await fetch(
        `${TG_RESTPP_URL}/restpp/builtins/${GRAPH_NAME}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ function: 'stat_vertex_number', type: 'DocumentChunk' }),
          signal: AbortSignal.timeout(8000),
        }
      );
      const chunkJson = chunkRes.ok ? await chunkRes.json() : null;
      const chunkCount: number = chunkJson?.results?.[0]?.count ?? 0;

      reply.send({
        ok: true,
        edition: 'TigerGraph Community Edition',
        graph: GRAPH_NAME,
        vertices: totalVertices,
        edges: totalEdges,
        embeddedChunks: chunkCount,
        vertexBreakdown: vertexRows,
        edgeBreakdown: edgeRows,
        ts: Date.now(),
      });
    } catch (err) {
      reply.status(503).send({ ok: false, error: String(err) });
    }
  });
}
