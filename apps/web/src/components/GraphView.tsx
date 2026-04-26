import { useEffect, useRef } from 'react';
import cytoscape, { type ElementDefinition } from 'cytoscape';

export interface GraphTrace {
  domains: { v_id: string }[];
  techs: { name: string }[];
  markers: { v_id: string; attributes: { text: string } }[];
  questions: { v_id: string; attributes: { text: string } }[];
}

const STYLE: cytoscape.StylesheetCSS[] = [
  { selector: 'node', css: { label: 'data(label)', 'font-size': 10, color: '#e2e8f0', 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': '90px', 'background-color': '#475569', width: 38, height: 38, 'border-width': 1, 'border-color': '#1e293b' } },
  { selector: 'node[type="repo"]',    css: { 'background-color': '#0ea5e9', width: 56, height: 56 } },
  { selector: 'node[type="tech"]',    css: { 'background-color': '#6366f1' } },
  { selector: 'node[type="domain"]',  css: { 'background-color': '#f59e0b', width: 50, height: 50 } },
  { selector: 'node[type="marker"]',  css: { 'background-color': '#10b981', shape: 'round-rectangle', width: 90, height: 30 } },
  { selector: 'node[type="question"]',css: { 'background-color': '#ef4444', shape: 'round-rectangle', width: 110, height: 36 } },
  { selector: 'edge', css: { width: 1.5, 'line-color': '#334155', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#334155' } },
  { selector: '.lit', css: { 'line-color': '#34d399', 'target-arrow-color': '#34d399', width: 2.5 } },
  { selector: 'node.lit', css: { 'border-color': '#34d399', 'border-width': 3 } },
];

export function GraphView({ trace, repoUrl }: { trace: GraphTrace | null; repoUrl: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const elements: ElementDefinition[] = [];
    const repoId = `repo:${repoUrl}`;
    elements.push({ data: { id: repoId, type: 'repo', label: repoUrl.split('/').slice(-2).join('/') } });
    for (const t of trace?.techs ?? []) {
      const id = `tech:${t.name}`;
      elements.push({ data: { id, type: 'tech', label: t.name } });
      elements.push({ data: { id: `${repoId}->${id}`, source: repoId, target: id } });
    }
    for (const d of trace?.domains ?? []) {
      const id = `dom:${d.v_id}`;
      elements.push({ data: { id, type: 'domain', label: d.v_id } });
      for (const t of trace?.techs ?? []) {
        elements.push({ data: { id: `tech:${t.name}->${id}`, source: `tech:${t.name}`, target: id } });
      }
    }
    for (const m of trace?.markers ?? []) {
      const id = `mk:${m.v_id}`;
      elements.push({ data: { id, type: 'marker', label: m.attributes.text } });
      for (const d of trace?.domains ?? []) {
        elements.push({ data: { id: `dom:${d.v_id}->${id}`, source: `dom:${d.v_id}`, target: id } });
      }
    }
    for (const q of trace?.questions ?? []) {
      const id = `q:${q.v_id}`;
      elements.push({ data: { id, type: 'question', label: q.attributes.text.slice(0, 50) + '…' } });
      for (const m of trace?.markers ?? []) {
        elements.push({ data: { id: `${id}->mk:${m.v_id}`, source: id, target: `mk:${m.v_id}` } });
      }
    }
    const cy = cytoscape({
      container: ref.current,
      elements,
      style: STYLE,
      layout: { name: 'breadthfirst', directed: true, padding: 16, spacingFactor: 1.1, roots: [repoId] } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;

    // animated traversal: light up Repo → Tech → Domain → Marker → Question
    const order = [
      cy.$(`#${cssEscape(repoId)}`),
      cy.nodes('[type="tech"]'),
      cy.nodes('[type="domain"]'),
      cy.nodes('[type="marker"]'),
      cy.nodes('[type="question"]'),
    ];
    let i = 0;
    const t = setInterval(() => {
      if (i >= order.length) { clearInterval(t); return; }
      order[i].addClass('lit');
      order[i].connectedEdges().addClass('lit');
      i += 1;
    }, 600);
    return () => { clearInterval(t); cy.destroy(); };
  }, [trace, repoUrl]);

  return <div ref={ref} className="w-full h-[480px] rounded-xl border border-slate-800 bg-slate-900/30" />;
}

function cssEscape(s: string): string {
  return s.replace(/([^\w-])/g, '\\$1');
}
