/**
 * Knowledge graph traversal visualizer for the 3-pipeline comparison.
 *
 * Shows two retrieval strategies side-by-side:
 *   • Basic RAG — broad cosine similarity, returns similar-looking chunks
 *   • GraphRAG  — entity-aware multi-hop traversal on TigerGraph, returns
 *                 conceptually connected context chunks
 *
 * The graph is constructed from the retrieved chunks and question text.
 * Nodes represent document fragments; edges represent "retrieved-by" or
 * shared-entity relationships inferred from chunk text.
 */
import { useEffect, useRef } from 'react';
import cytoscape, { type ElementDefinition } from 'cytoscape';
import type { PipelineResult, QueryMeta } from '../lib/api';

// ── helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** Extract short "entity" labels from a chunk for graph labels */
function extractLabel(chunk: string, idx: number): string {
  // First sentence or first 60 chars
  const first = chunk.split(/[.!?]/)[0]?.trim() ?? chunk;
  const label = truncate(first, 55);
  return label.length > 5 ? label : `Chunk ${idx + 1}`;
}

// ── style ────────────────────────────────────────────────────────────────────

const STYLE: cytoscape.StylesheetCSS[] = [
  {
    selector: 'node',
    css: {
      label: 'data(label)',
      'font-size': 9,
      color: '#cbd5e1',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '90px',
      'background-color': '#334155',
      width: 40,
      height: 40,
      'border-width': 1.5,
      'border-color': '#475569',
    },
  },
  {
    selector: 'node[type="query"]',
    css: {
      'background-color': '#0f172a',
      'border-color': '#38bdf8',
      'border-width': 3,
      color: '#38bdf8',
      width: 64,
      height: 64,
      'font-size': 10,
    },
  },
  {
    selector: 'node[type="basic"]',
    css: {
      'background-color': '#2e1065',
      'border-color': '#7c3aed',
      color: '#c4b5fd',
      shape: 'round-rectangle',
      width: 100,
      height: 32,
    },
  },
  {
    selector: 'node[type="graph"]',
    css: {
      'background-color': '#052e16',
      'border-color': '#16a34a',
      color: '#86efac',
      shape: 'round-rectangle',
      width: 100,
      height: 32,
    },
  },
  {
    selector: 'edge',
    css: {
      width: 1.5,
      'line-color': '#334155',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#334155',
    },
  },
  {
    selector: 'edge[type="basic"]',
    css: {
      'line-color': '#7c3aed',
      'target-arrow-color': '#7c3aed',
      'line-style': 'dashed',
    },
  },
  {
    selector: 'edge[type="graph"]',
    css: {
      'line-color': '#16a34a',
      'target-arrow-color': '#16a34a',
    },
  },
  {
    selector: '.lit',
    css: {
      'border-color': '#34d399',
      'border-width': 3.5,
    },
  },
  {
    selector: 'edge.lit',
    css: {
      'line-color': '#34d399',
      'target-arrow-color': '#34d399',
      width: 3,
    },
  },
  {
    selector: '.lit-basic',
    css: {
      'border-color': '#a78bfa',
      'border-width': 3.5,
    },
  },
  {
    selector: 'edge.lit-basic',
    css: {
      'line-color': '#a78bfa',
      'target-arrow-color': '#a78bfa',
      width: 3,
    },
  },
];

// ── component ────────────────────────────────────────────────────────────────

interface Props {
  basicRag?: PipelineResult;
  graphrag?: PipelineResult;
  question: string;
  queryMeta?: QueryMeta;
}

export function GraphView({ basicRag, graphrag, question, queryMeta }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!basicRag && !graphrag) return;

    const elements: ElementDefinition[] = [];

    // Query node (center)
    const queryId = 'query';
    elements.push({
      data: {
        id: queryId,
        type: 'query',
        label: truncate(question, 40),
      },
    });

    // Basic RAG chunks (purple, dashed edges — "similar text")
    const basicChunks = basicRag?.retrievedChunks ?? [];
    for (let i = 0; i < basicChunks.length; i++) {
      const id = `basic_${i}`;
      elements.push({
        data: {
          id,
          type: 'basic',
          label: extractLabel(basicChunks[i]!, i),
        },
      });
      elements.push({
        data: {
          id: `q_basic_${i}`,
          source: queryId,
          target: id,
          type: 'basic',
        },
      });
    }

    // GraphRAG chunks (green, solid edges — "entity traversal")
    const graphChunks = graphrag?.retrievedChunks ?? [];
    for (let i = 0; i < graphChunks.length; i++) {
      const id = `graph_${i}`;
      elements.push({
        data: {
          id,
          type: 'graph',
          label: extractLabel(graphChunks[i]!, i),
        },
      });
      elements.push({
        data: {
          id: `q_graph_${i}`,
          source: queryId,
          target: id,
          type: 'graph',
        },
      });
    }

    const cy = cytoscape({
      container: ref.current,
      elements,
      style: STYLE,
      layout: {
        name: 'concentric',
        minNodeSpacing: 40,
        levelWidth: () => 1,
        concentric: (node: cytoscape.NodeSingular) => {
          if (node.id() === queryId) return 3;
          if (node.data('type') === 'graph') return 2;
          return 1;
        },
      } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.2,
    });

    // Animated traversal: light up graphrag path first (faster, targeted),
    // then light up basic rag (broad, more diffuse)
    const graphNodes = cy.nodes('[type="graph"]');
    const graphEdges = cy.edges('[type="graph"]');
    const basicNodes = cy.nodes('[type="basic"]');
    const basicEdges = cy.edges('[type="basic"]');

    let step = 0;
    const t = setInterval(() => {
      if (step === 0) {
        cy.getElementById(queryId).addClass('lit');
      } else if (step === 1) {
        graphNodes.addClass('lit');
        graphEdges.addClass('lit');
      } else if (step === 2) {
        basicNodes.addClass('lit-basic');
        basicEdges.addClass('lit-basic');
      } else {
        clearInterval(t);
      }
      step++;
    }, 700);

    return () => {
      clearInterval(t);
      cy.destroy();
    };
  }, [basicRag, graphrag, question]);

  const hops = graphrag?.numHops;
  const complexity = queryMeta?.complexity;

  return (
    <div className="space-y-2">
      {queryMeta && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={`px-2 py-0.5 rounded-full font-medium ${
            complexity === 'multi-hop'
              ? 'bg-amber-500/15 text-amber-300'
              : 'bg-sky-500/15 text-sky-300'
          }`}>
            {complexity === 'multi-hop' ? '🔗 Multi-hop query' : '⚡ Simple query'}
          </span>
          {hops && (
            <span className="text-slate-500">→ {hops}-hop TigerGraph traversal</span>
          )}
          {queryMeta.reason && (
            <span className="text-slate-600 italic">{queryMeta.reason}</span>
          )}
        </div>
      )}
      <div
        ref={ref}
        className="w-full h-[380px] rounded-xl border border-slate-800 bg-slate-900/30"
      />
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#0f172a] border-2 border-[#38bdf8] inline-block" />
          Query
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#2e1065] border border-[#7c3aed] inline-block" />
          Basic RAG chunks (cosine sim, top-5)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#052e16] border border-[#16a34a] inline-block" />
          GraphRAG context ({hops ?? '?'}-hop TigerGraph)
        </span>
      </div>
    </div>
  );
}
