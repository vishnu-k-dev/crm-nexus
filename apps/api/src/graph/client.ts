import { request } from 'undici';

const HOST = process.env.TG_HOST ?? '';
const GRAPH = process.env.TG_GRAPH ?? 'TechProbe';
const TOKEN = process.env.TG_TOKEN ?? '';

function authHeaders(): Record<string, string> {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

export async function runQuery<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = new URL(`${HOST}/query/${GRAPH}/${name}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await request(url, { method: 'GET', headers: authHeaders() });
  const body = (await res.body.json()) as { error?: boolean; message?: string; results?: T };
  if (body.error) throw new Error(`TG query ${name} failed: ${body.message}`);
  return body.results as T;
}

interface UpsertVertexInput {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
}
interface UpsertEdgeInput {
  fromType: string; fromId: string;
  edgeType: string;
  toType: string;   toId: string;
  attributes?: Record<string, unknown>;
}

export async function upsert(vertices: UpsertVertexInput[], edges: UpsertEdgeInput[] = []): Promise<void> {
  const v: Record<string, Record<string, Record<string, { value: unknown }>>> = {};
  for (const x of vertices) {
    v[x.type] ??= {};
    const attrs: Record<string, { value: unknown }> = {};
    for (const [k, val] of Object.entries(x.attributes ?? {})) attrs[k] = { value: val };
    v[x.type][x.id] = attrs;
  }
  const e: Record<string, Record<string, Record<string, Record<string, Record<string, Record<string, { value: unknown }>>>>>> = {};
  for (const x of edges) {
    const attrs: Record<string, { value: unknown }> = {};
    for (const [k, val] of Object.entries(x.attributes ?? {})) attrs[k] = { value: val };
    e[x.fromType] ??= {};
    e[x.fromType][x.fromId] ??= {};
    e[x.fromType][x.fromId][x.edgeType] ??= {};
    e[x.fromType][x.fromId][x.edgeType][x.toType] ??= {};
    e[x.fromType][x.fromId][x.edgeType][x.toType][x.toId] = attrs;
  }
  const payload = { vertices: v, edges: e };
  const res = await request(`${HOST}/graph/${GRAPH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const body = (await res.body.json()) as { error?: boolean; message?: string };
  if (body.error) throw new Error(`TG upsert failed: ${body.message}`);
}

export async function ping(): Promise<boolean> {
  if (!HOST) return false;
  const res = await request(`${HOST}/echo`, { method: 'GET', headers: authHeaders() });
  return res.statusCode === 200;
}
